-- ============================================================================
-- PATCH: admin_area empleados + pago sin asistencia
-- Ejecuta TODO este archivo en el SQL Editor de Supabase (Run).
-- Orden interno: pago público → RPCs admin → triggers/RLS
-- ============================================================================

-- 1) marcar_pago_empleado: permite marcar aunque no haya asistencia previa
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

-- 2) solicitar_cambio_area: traer empleado de OTRA área a la del admin
create or replace function solicitar_cambio_area(p_empleado_id uuid, p_area_nueva_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
  v_solicitud_id uuid;
  v_admin_id uuid;
  v_area_origen text;
  v_area_destino text;
begin
  if not es_admin_area() then
    raise exception 'Solo un administrador de área puede solicitar un cambio de área.' using errcode = 'P0001';
  end if;

  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if p_area_nueva_id <> mi_area_id() then
    raise exception 'Solo puedes solicitar que un empleado se incorpore a tu área.' using errcode = 'P0001';
  end if;

  if v_empleado.area_id = mi_area_id() then
    raise exception 'Este empleado ya pertenece a tu área.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from solicitudes_cambio_area
    where empleado_id = p_empleado_id and estado = 'pendiente'
  ) then
    raise exception 'Ya existe una solicitud pendiente para este empleado.' using errcode = 'P0001';
  end if;

  select nombre into v_area_origen from areas where id = v_empleado.area_id;
  select nombre into v_area_destino from areas where id = p_area_nueva_id;

  insert into solicitudes_cambio_area (empleado_id, area_actual_id, area_solicitada_id, solicitado_por)
  values (p_empleado_id, v_empleado.area_id, p_area_nueva_id, auth.uid())
  returning id into v_solicitud_id;

  for v_admin_id in select id from perfiles where rol = 'administrador_general' and activo = true loop
    insert into notificaciones (destinatario_id, tipo, titulo, mensaje, entidad, entidad_id)
    values (
      v_admin_id,
      'solicitud_cambio_area',
      'Solicitud de incorporación de empleado',
      'Se solicitó incorporar a ' || nombre_publico(v_empleado) || ' de ' || v_area_origen || ' hacia ' || v_area_destino || '.',
      'solicitudes_cambio_area',
      v_solicitud_id
    );
  end loop;

  return jsonb_build_object('exito', true, 'mensaje', 'Solicitud enviada al administrador.', 'solicitud_id', v_solicitud_id);
end;
$$;

-- 3) listar empleados de otras áreas (solo admin_area)
create or replace function listar_empleados_otras_areas()
returns table (
  id uuid,
  numero_empleado varchar,
  primer_nombre text,
  segundo_nombre text,
  primer_apellido text,
  segundo_apellido text,
  pref_nombre_publico preferencia_nombre,
  pref_apellido_publico preferencia_nombre,
  area_id uuid,
  area_nombre text,
  estado estado_empleado
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.numero_empleado,
    e.primer_nombre,
    e.segundo_nombre,
    e.primer_apellido,
    e.segundo_apellido,
    e.pref_nombre_publico,
    e.pref_apellido_publico,
    e.area_id,
    a.nombre,
    e.estado
  from empleados e
  join areas a on a.id = e.area_id
  where es_admin_area()
    and e.area_id <> mi_area_id()
    and e.estado = 'activo'
  order by e.primer_nombre, e.primer_apellido;
$$;

revoke all on function listar_empleados_otras_areas() from public;
grant execute on function listar_empleados_otras_areas() to authenticated;

-- 4) buscar empleado por número (alta duplicada)
create or replace function buscar_empleado_por_numero(p_numero text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
  v_area_nombre text;
begin
  if not (es_admin_area() or es_admin_general()) then
    raise exception 'No autorizado.' using errcode = 'P0001';
  end if;

  if p_numero !~ '^[0-9]{6}$' then
    raise exception 'El número de empleado debe tener exactamente 6 dígitos.' using errcode = 'P0001';
  end if;

  select e.* into v_empleado
    from empleados e
   where e.numero_empleado = p_numero;

  if v_empleado.id is null then
    return jsonb_build_object('existe', false);
  end if;

  select nombre into v_area_nombre from areas where id = v_empleado.area_id;

  return jsonb_build_object(
    'existe', true,
    'id', v_empleado.id,
    'numero_empleado', v_empleado.numero_empleado,
    'primer_nombre', v_empleado.primer_nombre,
    'segundo_nombre', v_empleado.segundo_nombre,
    'primer_apellido', v_empleado.primer_apellido,
    'segundo_apellido', v_empleado.segundo_apellido,
    'area_id', v_empleado.area_id,
    'area_nombre', v_area_nombre,
    'estado', v_empleado.estado,
    'en_mi_area', case when es_admin_area() then v_empleado.area_id = mi_area_id() else false end
  );
end;
$$;

revoke all on function buscar_empleado_por_numero(text) from public;
grant execute on function buscar_empleado_por_numero(text) to authenticated;

-- 5) Trigger: admin_area solo edita estado
create or replace function trg_fn_restringir_edicion_empleado_admin_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if es_admin_area() then
    if new.numero_empleado is distinct from old.numero_empleado
       or new.primer_nombre is distinct from old.primer_nombre
       or new.segundo_nombre is distinct from old.segundo_nombre
       or new.primer_apellido is distinct from old.primer_apellido
       or new.segundo_apellido is distinct from old.segundo_apellido
       or new.pref_nombre_publico is distinct from old.pref_nombre_publico
       or new.pref_apellido_publico is distinct from old.pref_apellido_publico
       or new.area_id is distinct from old.area_id
    then
      raise exception 'Como administrador de área solo puedes cambiar el estado (activo/inactivo) del empleado.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_empleados_restringir_edicion_admin_area on empleados;
create trigger trg_empleados_restringir_edicion_admin_area
  before update on empleados
  for each row execute function trg_fn_restringir_edicion_empleado_admin_area();

-- 6) RLS solicitudes: admin_area ve solicitudes hacia su área
drop policy if exists solicitudes_area_select on solicitudes_cambio_area;

create policy solicitudes_area_select on solicitudes_cambio_area
  for select to authenticated
  using (
    es_admin_general() or es_supervision()
    or (es_admin_area() and (
      area_solicitada_id = mi_area_id()
      or area_actual_id = mi_area_id()
      or solicitado_por = auth.uid()
    ))
  );

-- 7) RLS empleados: admin_area puede leer todas las áreas (solo lectura)
drop policy if exists empleados_select on empleados;

create policy empleados_select on empleados
  for select to authenticated
  using (es_admin_general() or es_supervision() or es_admin_area());
