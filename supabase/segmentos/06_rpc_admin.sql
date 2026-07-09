-- ============================================================================
-- 06_rpc_admin (9/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

-- ############################################################################
-- 0006_rpc_admin.sql
-- ############################################################################

-- ============================================================================
-- 0006_rpc_admin.sql
-- RPCs para roles autenticados (admin_area, administrador_general). Cada
-- función valida permisos internamente (defensa en profundidad, además de
-- RLS) porque son SECURITY DEFINER y por lo tanto se saltan RLS al ejecutar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- notificar_pago_fuera_horario(pago_id, mensaje)
-- Helper interno (sección 4.3): cuando un admin_area registra/valida un pago
-- después de las 23:30 CDMX, se notifica SOLO a administrador_general (nunca
-- al empleado ni a otros admin_area). administrador_general no dispara esta
-- notificación porque puede operar sin restricción horaria.
-- ---------------------------------------------------------------------------
create or replace function notificar_pago_fuera_horario(p_pago_id uuid, p_mensaje text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  if es_admin_area() and not ventana_empleado_abierta() then
    for v_admin_id in select id from perfiles where rol = 'administrador_general' and activo = true loop
      insert into notificaciones (destinatario_id, tipo, titulo, mensaje, entidad, entidad_id)
      values (v_admin_id, 'pago_fuera_horario', 'Pago registrado fuera de horario', p_mensaje, 'pagos_cuota', p_pago_id);
    end loop;
  end if;
end;
$$;

revoke all on function notificar_pago_fuera_horario(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- validar_pago(pago_id)
-- Confirma un pago (pendiente o en revisión) como recaudado. Es el único
-- punto donde estado pasa a 'validado' vía flujo normal.
-- ---------------------------------------------------------------------------
create or replace function validar_pago(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_cuota;
begin
  select * into v_pago from pagos_cuota where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_pago.area_id) then
    raise exception 'No tienes permiso para validar pagos de esta área.' using errcode = 'P0001';
  end if;

  if v_pago.estado not in ('pendiente', 'marcado_pendiente_validacion') then
    raise exception 'Este pago no está en un estado que se pueda validar.' using errcode = 'P0001';
  end if;

  update pagos_cuota
     set validado = true,
         validado_por = auth.uid(),
         validado_en = now(),
         estado = 'validado'
   where id = p_pago_id;

  perform notificar_pago_fuera_horario(p_pago_id, 'Se validó un pago fuera del horario habitual (después de las 11:30 p.m.).');

  return jsonb_build_object('exito', true, 'mensaje', 'Pago validado correctamente.');
end;
$$;

revoke all on function validar_pago(uuid) from public;
grant execute on function validar_pago(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- rechazar_pago(pago_id, motivo)
-- El admin no confirma lo que el empleado reportó. Vuelve a 'pendiente' para
-- que se revise con la persona hasta que realmente pague.
-- ---------------------------------------------------------------------------
create or replace function rechazar_pago(p_pago_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_cuota;
begin
  select * into v_pago from pagos_cuota where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_pago.area_id) then
    raise exception 'No tienes permiso sobre pagos de esta área.' using errcode = 'P0001';
  end if;

  if v_pago.estado <> 'marcado_pendiente_validacion' then
    raise exception 'Solo se pueden rechazar pagos que estén en revisión.' using errcode = 'P0001';
  end if;

  update pagos_cuota
     set estado = 'pendiente',
         marcado_por_empleado = false,
         marcado_empleado_en = null,
         notas = coalesce(p_motivo, notas)
   where id = p_pago_id;

  return jsonb_build_object('exito', true, 'mensaje', 'Pago regresado a pendiente.');
end;
$$;

revoke all on function rechazar_pago(uuid, text) from public;
grant execute on function rechazar_pago(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_pago_manual(empleado_id, fecha, notas)
-- Cobro directo del admin sin pasar por el marcado del empleado. NO crea
-- asistencia_diaria (son independientes por diseño). Solo aplica cuando no
-- existe todavía una obligación para ese día, o si esta fue cancelada.
-- ---------------------------------------------------------------------------
create or replace function registrar_pago_manual(p_empleado_id uuid, p_fecha date, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
  v_existente pagos_cuota;
  v_pago pagos_cuota;
begin
  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_empleado.area_id) then
    raise exception 'No tienes permiso sobre empleados de esta área.' using errcode = 'P0001';
  end if;

  select * into v_existente from pagos_cuota where empleado_id = p_empleado_id and fecha = p_fecha;

  if v_existente.id is not null and v_existente.estado <> 'cancelado' then
    raise exception 'Ya existe un registro de pago para ese día (estado: %). Usa validar o revertir en vez de registrar uno manual.', v_existente.estado using errcode = 'P0001';
  end if;

  if v_existente.id is not null then
    update pagos_cuota
       set monto_esperado = cuota_vigente(v_empleado.area_id, p_fecha),
           marcado_por_empleado = false,
           marcado_empleado_en = null,
           validado = true,
           validado_por = auth.uid(),
           validado_en = now(),
           origen = 'manual_admin',
           estado = 'validado',
           notas = p_notas
     where id = v_existente.id
    returning * into v_pago;
  else
    insert into pagos_cuota (
      empleado_id, area_id, fecha, monto_esperado,
      validado, validado_por, validado_en, origen, estado, notas
    ) values (
      p_empleado_id, v_empleado.area_id, p_fecha, cuota_vigente(v_empleado.area_id, p_fecha),
      true, auth.uid(), now(), 'manual_admin', 'validado', p_notas
    )
    returning * into v_pago;
  end if;

  perform notificar_pago_fuera_horario(v_pago.id, 'Se registró un pago manual fuera del horario habitual (después de las 11:30 p.m.).');

  return jsonb_build_object('exito', true, 'mensaje', 'Pago manual registrado y validado.', 'pago_id', v_pago.id);
end;
$$;

revoke all on function registrar_pago_manual(uuid, date, text) from public;
grant execute on function registrar_pago_manual(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- revertir_validacion(pago_id, motivo)
-- Deshace una validación (nunca se borra un pago validado). Motivo
-- obligatorio; queda registrado también vía el trigger genérico de
-- auditoría sobre pagos_cuota.
-- ---------------------------------------------------------------------------
create or replace function revertir_validacion(p_pago_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_cuota;
begin
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Debes indicar un motivo para revertir la validación.' using errcode = 'P0001';
  end if;

  select * into v_pago from pagos_cuota where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_pago.area_id) then
    raise exception 'No tienes permiso sobre pagos de esta área.' using errcode = 'P0001';
  end if;

  if v_pago.estado <> 'validado' then
    raise exception 'Solo se pueden revertir pagos que estén validados.' using errcode = 'P0001';
  end if;

  update pagos_cuota
     set validado = false,
         validado_por = null,
         validado_en = null,
         marcado_por_empleado = false,
         marcado_empleado_en = null,
         estado = 'pendiente',
         motivo_reversion = p_motivo
   where id = p_pago_id;

  return jsonb_build_object('exito', true, 'mensaje', 'Validación revertida. El pago volvió a estado pendiente.');
end;
$$;

revoke all on function revertir_validacion(uuid, text) from public;
grant execute on function revertir_validacion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- eliminar_pago(pago_id)  [admin_area, administrador_general]
-- Borra un registro de pago (pruebas o corrección de error humano).
-- Deja rastro en logs_auditoria antes del DELETE.
-- ---------------------------------------------------------------------------
create or replace function eliminar_pago(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_cuota;
begin
  if es_supervision() then
    raise exception 'No tienes permiso para eliminar pagos.' using errcode = 'P0001';
  end if;

  select * into v_pago from pagos_cuota where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_pago.area_id) then
    raise exception 'No tienes permiso sobre pagos de esta área.' using errcode = 'P0001';
  end if;

  insert into logs_auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(),
    'pagos_cuota_eliminado',
    'pagos_cuota',
    p_pago_id,
    jsonb_build_object('eliminado', to_jsonb(v_pago))
  );

  delete from pagos_cuota where id = p_pago_id;

  return jsonb_build_object('exito', true, 'mensaje', 'Pago eliminado.');
end;
$$;

revoke all on function eliminar_pago(uuid) from public;
grant execute on function eliminar_pago(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- soft_delete_asistencia(asistencia_id, motivo)
-- Elimina lógicamente una asistencia. Si el pago vinculado ya estaba
-- validado, el motivo es obligatorio y se deja un rastro explícito en
-- logs_auditoria equivalente a una reversión formal.
-- ---------------------------------------------------------------------------
create or replace function soft_delete_asistencia(p_asistencia_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asistencia asistencia_diaria;
  v_pago pagos_cuota;
  v_estado_anterior estado_pago;
begin
  select * into v_asistencia from asistencia_diaria where id = p_asistencia_id;
  if v_asistencia.id is null then
    raise exception 'Registro de asistencia no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_asistencia.area_id) then
    raise exception 'No tienes permiso sobre asistencia de esta área.' using errcode = 'P0001';
  end if;

  if v_asistencia.eliminado then
    raise exception 'Esta asistencia ya estaba eliminada.' using errcode = 'P0001';
  end if;

  select * into v_pago from pagos_cuota
   where empleado_id = v_asistencia.empleado_id and fecha = v_asistencia.fecha;

  v_estado_anterior := v_pago.estado;

  if v_estado_anterior = 'validado' and (p_motivo is null or length(trim(p_motivo)) = 0) then
    raise exception 'Debes indicar un motivo: este pago ya estaba validado (dinero recaudado).' using errcode = 'P0001';
  end if;

  update asistencia_diaria
     set eliminado = true,
         eliminado_en = now(),
         eliminado_por = auth.uid(),
         motivo_eliminacion = p_motivo
   where id = p_asistencia_id;

  if v_pago.id is not null and v_pago.estado <> 'cancelado' then
    update pagos_cuota set estado = 'cancelado' where id = v_pago.id;
  end if;

  if v_estado_anterior = 'validado' then
    insert into logs_auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    values (
      auth.uid(),
      'reversion_por_eliminacion_asistencia',
      'pagos_cuota',
      v_pago.id,
      jsonb_build_object(
        'estado_anterior', 'validado',
        'estado_nuevo', 'cancelado',
        'motivo', p_motivo,
        'via', 'soft_delete_asistencia',
        'asistencia_id', p_asistencia_id
      )
    );
  end if;

  return jsonb_build_object('exito', true, 'mensaje', 'Se ha eliminado la asistencia.');
end;
$$;

revoke all on function soft_delete_asistencia(uuid, text) from public;
grant execute on function soft_delete_asistencia(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- revertir_eliminacion_asistencia(asistencia_id)
-- Botón "Revertir" del toast de 5 segundos. El pago vinculado (si fue
-- cancelado por la eliminación) regresa a 'pendiente', NUNCA directo a
-- 'validado': re-acreditar dinero automáticamente saltaría el filtro humano.
-- ---------------------------------------------------------------------------
create or replace function revertir_eliminacion_asistencia(p_asistencia_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asistencia asistencia_diaria;
  v_pago pagos_cuota;
begin
  select * into v_asistencia from asistencia_diaria where id = p_asistencia_id;
  if v_asistencia.id is null then
    raise exception 'Registro de asistencia no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_asistencia.area_id) then
    raise exception 'No tienes permiso sobre asistencia de esta área.' using errcode = 'P0001';
  end if;

  if not v_asistencia.eliminado then
    raise exception 'Esta asistencia no está eliminada.' using errcode = 'P0001';
  end if;

  update asistencia_diaria
     set eliminado = false,
         eliminado_en = null,
         eliminado_por = null,
         motivo_eliminacion = null
   where id = p_asistencia_id;

  select * into v_pago from pagos_cuota
   where empleado_id = v_asistencia.empleado_id and fecha = v_asistencia.fecha;

  if v_pago.id is not null and v_pago.estado = 'cancelado' then
    update pagos_cuota
       set estado = 'pendiente',
           validado = false,
           validado_por = null,
           validado_en = null,
           marcado_por_empleado = false,
           marcado_empleado_en = null
     where id = v_pago.id;
  end if;

  return jsonb_build_object('exito', true, 'mensaje', 'Se revirtió la eliminación de la asistencia.');
end;
$$;

revoke all on function revertir_eliminacion_asistencia(uuid) from public;
grant execute on function revertir_eliminacion_asistencia(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_asistencia(empleado_id, fecha)
-- Alta de asistencia (hoy o retroactiva hasta 7 días). El trigger de la
-- migración 0004 crea automáticamente la obligación de pago.
-- ---------------------------------------------------------------------------
create or replace function registrar_asistencia(p_empleado_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
  v_hoy date := fecha_operativa_cdmx();
  v_existente asistencia_diaria;
begin
  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_empleado.area_id) then
    raise exception 'No tienes permiso sobre empleados de esta área.' using errcode = 'P0001';
  end if;

  if p_fecha > v_hoy then
    raise exception 'No se puede registrar asistencia en una fecha futura.' using errcode = 'P0001';
  end if;

  if p_fecha < v_hoy - interval '7 days' then
    raise exception 'Solo se puede registrar asistencia retroactiva hasta 7 días atrás.' using errcode = 'P0001';
  end if;

  select * into v_existente from asistencia_diaria where empleado_id = p_empleado_id and fecha = p_fecha;

  if v_existente.id is not null and not v_existente.eliminado then
    raise exception 'Ya existe asistencia registrada para ese día.' using errcode = 'P0001';
  end if;

  if v_existente.id is not null and v_existente.eliminado then
    return revertir_eliminacion_asistencia(v_existente.id);
  end if;

  insert into asistencia_diaria (empleado_id, area_id, fecha, registrado_por)
  values (p_empleado_id, v_empleado.area_id, p_fecha, auth.uid());

  return jsonb_build_object('exito', true, 'mensaje', 'Asistencia registrada.');
end;
$$;

revoke all on function registrar_asistencia(uuid, date) from public;
grant execute on function registrar_asistencia(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_asistencia_desde_horario(fecha, empleado_ids[])
-- Alta en lote a partir del roster planeado en horario_diario.
-- ---------------------------------------------------------------------------
create or replace function registrar_asistencia_desde_horario(p_fecha date, p_empleado_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_exitos int := 0;
  v_errores jsonb := '[]'::jsonb;
begin
  foreach v_id in array p_empleado_ids loop
    begin
      perform registrar_asistencia(v_id, p_fecha);
      v_exitos := v_exitos + 1;
    exception when others then
      v_errores := v_errores || jsonb_build_object('empleado_id', v_id, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('exito', true, 'registrados', v_exitos, 'errores', v_errores);
end;
$$;

revoke all on function registrar_asistencia_desde_horario(date, uuid[]) from public;
grant execute on function registrar_asistencia_desde_horario(date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_horario(empleado_id, fecha)  /  quitar_horario(empleado_id, fecha)
-- Módulo de planeación previa (roster del día).
-- ---------------------------------------------------------------------------
create or replace function registrar_horario(p_empleado_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
begin
  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_empleado.area_id) then
    raise exception 'No tienes permiso sobre empleados de esta área.' using errcode = 'P0001';
  end if;

  insert into horario_diario (empleado_id, area_id, fecha, registrado_por)
  values (p_empleado_id, v_empleado.area_id, p_fecha, auth.uid())
  on conflict (empleado_id, fecha) do nothing;

  return jsonb_build_object('exito', true, 'mensaje', 'Empleado agregado al horario.');
end;
$$;

revoke all on function registrar_horario(uuid, date) from public;
grant execute on function registrar_horario(uuid, date) to authenticated;

create or replace function quitar_horario(p_empleado_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
begin
  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_empleado.area_id) then
    raise exception 'No tienes permiso sobre empleados de esta área.' using errcode = 'P0001';
  end if;

  delete from horario_diario where empleado_id = p_empleado_id and fecha = p_fecha;

  return jsonb_build_object('exito', true, 'mensaje', 'Empleado quitado del horario.');
end;
$$;

revoke all on function quitar_horario(uuid, date) from public;
grant execute on function quitar_horario(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- solicitar_cambio_area(empleado_id, area_nueva_id)  [admin_area]
-- Solicita traer un empleado de OTRA área hacia el área del administrador.
-- resolver_solicitud_cambio_area(solicitud_id, aprobar, motivo)  [administrador_general]
-- listar_empleados_otras_areas()  [admin_area]
-- buscar_empleado_por_numero(numero)  [admin_area, administrador_general]
-- ---------------------------------------------------------------------------
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

revoke all on function solicitar_cambio_area(uuid, uuid) from public;
grant execute on function solicitar_cambio_area(uuid, uuid) to authenticated;

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

create or replace function resolver_solicitud_cambio_area(p_solicitud_id uuid, p_aprobar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes_cambio_area;
begin
  if not es_admin_general() then
    raise exception 'Solo el administrador general puede resolver solicitudes de cambio de área.' using errcode = 'P0001';
  end if;

  select * into v_solicitud from solicitudes_cambio_area where id = p_solicitud_id;
  if v_solicitud.id is null then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0001';
  end if;

  if v_solicitud.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya fue resuelta.' using errcode = 'P0001';
  end if;

  if p_aprobar then
    update empleados set area_id = v_solicitud.area_solicitada_id, actualizado_por = auth.uid()
     where id = v_solicitud.empleado_id;

    insert into historial_area_empleado (empleado_id, area_anterior_id, area_nueva_id, realizado_por)
    values (v_solicitud.empleado_id, v_solicitud.area_actual_id, v_solicitud.area_solicitada_id, auth.uid());

    update solicitudes_cambio_area
       set estado = 'aprobada', resuelto_por = auth.uid(), resuelto_en = now(), motivo = p_motivo
     where id = p_solicitud_id;
  else
    update solicitudes_cambio_area
       set estado = 'rechazada', resuelto_por = auth.uid(), resuelto_en = now(), motivo = p_motivo
     where id = p_solicitud_id;
  end if;

  return jsonb_build_object('exito', true, 'mensaje', case when p_aprobar then 'Cambio de área aprobado.' else 'Solicitud rechazada.' end);
end;
$$;

revoke all on function resolver_solicitud_cambio_area(uuid, boolean, text) from public;
grant execute on function resolver_solicitud_cambio_area(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mover_empleado_area(empleado_id, area_nueva_id)  [administrador_general]
-- Movimiento directo, sin pasar por solicitud.
-- ---------------------------------------------------------------------------
create or replace function mover_empleado_area(p_empleado_id uuid, p_area_nueva_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
begin
  if not es_admin_general() then
    raise exception 'Solo el administrador general puede mover empleados de área directamente.' using errcode = 'P0001';
  end if;

  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if v_empleado.area_id = p_area_nueva_id then
    raise exception 'El empleado ya pertenece a esa área.' using errcode = 'P0001';
  end if;

  update empleados set area_id = p_area_nueva_id, actualizado_por = auth.uid() where id = p_empleado_id;

  insert into historial_area_empleado (empleado_id, area_anterior_id, area_nueva_id, realizado_por)
  values (p_empleado_id, v_empleado.area_id, p_area_nueva_id, auth.uid());

  return jsonb_build_object('exito', true, 'mensaje', 'Empleado movido de área.');
end;
$$;

revoke all on function mover_empleado_area(uuid, uuid) from public;
grant execute on function mover_empleado_area(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cambiar_cuota(area_id, monto, vigente_desde)  [administrador_general]
-- ---------------------------------------------------------------------------
create or replace function cambiar_cuota(p_area_id uuid, p_monto numeric, p_vigente_desde date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin_general() then
    raise exception 'Solo el administrador general puede cambiar la cuota.' using errcode = 'P0001';
  end if;

  if p_monto < 0 then
    raise exception 'El monto de la cuota no puede ser negativo.' using errcode = 'P0001';
  end if;

  update historial_cuotas
     set vigente_hasta = p_vigente_desde - 1
   where area_id = p_area_id and vigente_hasta is null;

  insert into historial_cuotas (area_id, monto, vigente_desde, vigente_hasta, registrado_por)
  values (p_area_id, p_monto, p_vigente_desde, null, auth.uid());

  update areas set cuota_fija = p_monto where id = p_area_id;

  return jsonb_build_object('exito', true, 'mensaje', 'Cuota actualizada. Aplica a partir de ' || p_vigente_desde);
end;
$$;

revoke all on function cambiar_cuota(uuid, numeric, date) from public;
grant execute on function cambiar_cuota(uuid, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- cerrar_periodo(desde, hasta)  [administrador_general]
-- Snapshot contable por área. Guarda el desglose por empleado en `detalle`
-- para que el CSV se pueda regenerar idéntico más adelante, sin importar
-- cambios posteriores en pagos_cuota (el cierre no bloquea operación).
-- ---------------------------------------------------------------------------
create or replace function cerrar_periodo(p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area record;
  v_esperado numeric(12,2);
  v_validado numeric(12,2);
  v_detalle jsonb;
  v_resultado jsonb := '[]'::jsonb;
  v_cierre_id uuid;
begin
  if not es_admin_general() then
    raise exception 'Solo el administrador general puede cerrar un periodo.' using errcode = 'P0001';
  end if;

  if p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;

  for v_area in select id, nombre from areas loop
    select coalesce(sum(pc.monto_esperado) filter (where pc.estado <> 'cancelado'), 0),
           coalesce(sum(pc.monto_esperado) filter (where pc.estado = 'validado'), 0)
      into v_esperado, v_validado
      from pagos_cuota pc
     where pc.area_id = v_area.id and pc.fecha between p_desde and p_hasta;

    select coalesce(jsonb_agg(jsonb_build_object(
             'fecha', pc.fecha,
             'area', v_area.nombre,
             'numero_empleado', e.numero_empleado,
             'id_publico', id_publico(e.numero_empleado),
             'nombre_publico', nombre_publico(e),
             'monto_esperado', pc.monto_esperado,
             'estado', pc.estado,
             'marcado_por_empleado', pc.marcado_por_empleado,
             'marcado_empleado_en', pc.marcado_empleado_en,
             'validado_por', pc.validado_por,
             'validado_en', pc.validado_en,
             'origen', pc.origen,
             'notas', pc.notas,
             'motivo_reversion', pc.motivo_reversion
           ) order by pc.fecha, e.numero_empleado), '[]'::jsonb)
      into v_detalle
      from pagos_cuota pc
      join empleados e on e.id = pc.empleado_id
     where pc.area_id = v_area.id and pc.fecha between p_desde and p_hasta;

    insert into cierres_periodo (
      area_id, desde, hasta, cerrado_por, monto_esperado_total, monto_validado_total, detalle
    ) values (
      v_area.id, p_desde, p_hasta, auth.uid(), v_esperado, v_validado, v_detalle
    )
    returning id into v_cierre_id;

    v_resultado := v_resultado || jsonb_build_object(
      'cierre_id', v_cierre_id,
      'area_id', v_area.id,
      'area_nombre', v_area.nombre,
      'esperado', v_esperado,
      'validado', v_validado,
      'diferencia', v_esperado - v_validado
    );
  end loop;

  return jsonb_build_object('exito', true, 'mensaje', 'Periodo cerrado correctamente.', 'cierres', v_resultado);
exception
  when exclusion_violation then
    raise exception 'Ya existe un cierre que se traslapa con este rango de fechas para alguna de las áreas.' using errcode = 'P0001';
end;
$$;

revoke all on function cerrar_periodo(date, date) from public;
grant execute on function cerrar_periodo(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- revisar_pagos_estancados()
-- Función interna invocada por pg_cron (sin GRANT a roles de usuario).
-- Notifica pagos en revisión por más de 2 días sin resolverse.
-- ---------------------------------------------------------------------------
create or replace function revisar_pagos_estancados()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago record;
  v_destinatario uuid;
begin
  for v_pago in
    select pc.id, pc.area_id, e.numero_empleado, nombre_publico(e) as nombre
    from pagos_cuota pc
    join empleados e on e.id = pc.empleado_id
    where pc.estado = 'marcado_pendiente_validacion'
      and pc.marcado_empleado_en < now() - interval '2 days'
  loop
    for v_destinatario in
      select id from perfiles
      where activo = true
        and (
          (rol = 'admin_area' and area_id = v_pago.area_id)
          or rol = 'administrador_general'
          or rol = 'supervision'
        )
    loop
      insert into notificaciones (destinatario_id, tipo, titulo, mensaje, entidad, entidad_id)
      values (
        v_destinatario,
        'pago_en_revision_estancado',
        'Pago estancado en revisión',
        'El pago de ' || v_pago.nombre || ' lleva más de 2 días en revisión sin resolverse.',
        'pagos_cuota',
        v_pago.id
      )
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

revoke all on function revisar_pagos_estancados() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- marcar_notificacion_leida(notificacion_id)
-- ---------------------------------------------------------------------------
create or replace function marcar_notificacion_leida(p_notificacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update notificaciones set leida = true
   where id = p_notificacion_id and destinatario_id = auth.uid();

  return jsonb_build_object('exito', true);
end;
$$;

revoke all on function marcar_notificacion_leida(uuid) from public;
grant execute on function marcar_notificacion_leida(uuid) to authenticated;

-- VERIFICACIÓN
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='validar_pago';
