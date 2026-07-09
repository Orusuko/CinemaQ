-- ============================================================================
-- 05_rpc_publico (8/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

-- ############################################################################
-- 0005_rpc_publico.sql
-- ############################################################################

-- ============================================================================
-- 0005_rpc_publico.sql
-- RPCs accesibles por el rol `anon` (sin autenticación). Son la ÚNICA puerta
-- abierta del sistema para el rol empleado. Ambas son SECURITY DEFINER porque
-- `anon` no tiene acceso directo de lectura/escritura a las tablas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- listar_empleados_publicos()
-- Lectura mínima para el selector de la página pública: solo empleados
-- activos, con un identificador corto (4 dígitos, ampliado automáticamente
-- si hay colisión entre activos) y su nombre público según preferencias.
-- ---------------------------------------------------------------------------
create or replace function listar_empleados_publicos()
returns table (
  id uuid,
  id_publico text,
  nombre_publico text,
  area_nombre text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      e.id,
      e.numero_empleado,
      nombre_publico(e) as nombre_publico,
      a.nombre as area_nombre,
      left(e.numero_empleado, 4) as pref4
    from empleados e
    join areas a on a.id = e.area_id
    where e.estado = 'activo'
  ),
  conteo as (
    select pref4, count(*) as n
    from base
    group by pref4
  )
  select
    b.id,
    case when c.n > 1 then left(b.numero_empleado, 5) else b.pref4 end as id_publico,
    b.nombre_publico,
    b.area_nombre
  from base b
  join conteo c using (pref4)
  order by b.nombre_publico;
$$;

revoke all on function listar_empleados_publicos() from public;
grant execute on function listar_empleados_publicos() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- marcar_pago_empleado(empleado_id)
-- Único punto de escritura anónima del sistema. Operación atómica: solo
-- actualiza si el pago del día operativo sigue en estado 'pendiente'. Esto
-- evita condiciones de carrera (doble clic, doble marcado).
-- No requiere PIN ni contraseña: el segundo filtro humano (validación del
-- admin) es lo que sostiene la fiabilidad del dato, no la identidad de quien
-- marcó (riesgo aceptado, ver sección 2 de la especificación).
-- ---------------------------------------------------------------------------
create or replace function marcar_pago_empleado(p_empleado_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date := fecha_operativa_cdmx();
  v_empleado empleados;
  v_pago pagos_cuota;
begin
  select * into v_empleado from empleados where id = p_empleado_id;

  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if v_empleado.estado <> 'activo' then
    raise exception 'Este registro de empleado no está activo.' using errcode = 'P0001';
  end if;

  if not ventana_empleado_abierta() then
    raise exception 'El horario para marcar tu pago cerró a las 11:30 p.m. Acude con tu administrador.' using errcode = 'P0001';
  end if;

  select * into v_pago
    from pagos_cuota
   where empleado_id = p_empleado_id
     and fecha = v_fecha;

  if v_pago.id is not null and v_pago.estado in ('marcado_pendiente_validacion', 'validado') then
    raise exception 'Ya se marcó tu pago de hoy.' using errcode = 'P0001';
  end if;

  if v_pago.id is null then
    insert into pagos_cuota (empleado_id, area_id, fecha, monto_esperado, origen, estado)
    values (
      p_empleado_id,
      v_empleado.area_id,
      v_fecha,
      cuota_vigente(v_empleado.area_id, v_fecha),
      'flujo_normal',
      'pendiente'
    )
    returning * into v_pago;
  elsif v_pago.estado = 'cancelado' then
    update pagos_cuota
       set monto_esperado = cuota_vigente(v_empleado.area_id, v_fecha),
           origen = 'flujo_normal',
           estado = 'pendiente',
           marcado_por_empleado = false,
           marcado_empleado_en = null,
           validado = false,
           validado_por = null,
           validado_en = null
     where id = v_pago.id
    returning * into v_pago;
  end if;

  update pagos_cuota
     set marcado_por_empleado = true,
         marcado_empleado_en = now(),
         estado = 'marcado_pendiente_validacion'
   where id = v_pago.id
     and estado = 'pendiente'
  returning * into v_pago;

  if v_pago.id is null then
    raise exception 'No se pudo registrar tu pago de hoy. Intenta de nuevo o consulta con tu administrador.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'exito', true,
    'mensaje', 'Tu pago quedó marcado como reportado. Un administrador lo validará en breve.',
    'pago_id', v_pago.id
  );
end;
$$;

revoke all on function marcar_pago_empleado(uuid) from public;
grant execute on function marcar_pago_empleado(uuid) to anon;

-- ---------------------------------------------------------------------------
-- balance_publico_hoy()
-- Decisión de diseño (ver README): en la página pública SOLO se muestra el
-- balance AGREGADO del día operativo actual por área (sin desglose por
-- empleado, sin nombres). No requiere autenticación porque no expone datos
-- sensibles individuales, y le da transparencia al equipo sobre cómo va el
-- corte del día.
-- ---------------------------------------------------------------------------
create or replace function balance_publico_hoy()
returns table (
  area_nombre text,
  esperado numeric,
  recaudado numeric,
  en_revision numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.nombre,
    coalesce(sum(pc.monto_esperado) filter (where pc.estado <> 'cancelado'), 0),
    coalesce(sum(pc.monto_esperado) filter (where pc.estado = 'validado'), 0),
    coalesce(sum(pc.monto_esperado) filter (where pc.estado = 'marcado_pendiente_validacion'), 0)
  from areas a
  left join pagos_cuota pc on pc.area_id = a.id and pc.fecha = fecha_operativa_cdmx()
  where a.activo = true
  group by a.id, a.nombre
  order by a.nombre;
$$;

revoke all on function balance_publico_hoy() from public;
-- Sin GRANT a anon/authenticated: el balance solo se consulta en el panel admin (pagos_cuota + RLS).

-- VERIFICACIÓN
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='listar_empleados_publicos';
