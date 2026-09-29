-- importar_horario_asistencia
--
-- Registra horario_diario + asistencia_diaria para una fecha pasada, con el AREA que
-- indica el PDF de horarios (y no la del empleado), sin el límite de 7 días de
-- registrar_asistencia. Solo administrador_general.
--
-- El pago de cuota lo genera el trigger trg_asistencia_crea_pago al insertar la
-- asistencia, igual que en el flujo manual. Si por algún motivo el pago no queda
-- creado con el área pedida, la función lanza excepción y se revierte todo.
--
-- No modifica registrar_asistencia / registrar_horario: el flujo manual queda igual.

create or replace function public.importar_horario_asistencia(
  p_empleado_id uuid,
  p_fecha date,
  p_area_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol text;
  v_empleado empleados;
  v_horario horario_diario;
  v_existente asistencia_diaria;
  v_pago pagos_cuota;
  v_creo_horario boolean := false;
  v_asistencia_id uuid;
begin
  select rol::text into v_rol from perfiles where id = auth.uid() and activo;
  if v_rol is distinct from 'administrador_general' then
    raise exception 'Solo el administrador general puede importar horarios.' using errcode = 'P0001';
  end if;

  if p_fecha > fecha_operativa_cdmx() then
    raise exception 'No se puede registrar asistencia en una fecha futura.' using errcode = 'P0001';
  end if;

  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from areas where id = p_area_id) then
    raise exception 'Área no encontrada.' using errcode = 'P0001';
  end if;

  select * into v_existente from asistencia_diaria
   where empleado_id = p_empleado_id and fecha = p_fecha;

  if v_existente.id is not null and not v_existente.eliminado then
    raise exception 'Ya existe asistencia registrada para ese día.' using errcode = 'P0001';
  end if;

  -- Horario: se crea con el área del PDF; si ya existe con otra área no se pisa.
  select * into v_horario from horario_diario
   where empleado_id = p_empleado_id and fecha = p_fecha;

  if v_horario.id is null then
    insert into horario_diario (empleado_id, area_id, fecha, registrado_por)
    values (p_empleado_id, p_area_id, p_fecha, auth.uid());
    v_creo_horario := true;
  elsif v_horario.area_id <> p_area_id then
    raise exception 'Ya existe un horario de ese día con un área distinta a la del PDF.' using errcode = 'P0001';
  end if;

  -- Asistencia previamente eliminada (p. ej. tras "Deshacer"): se reactiva.
  if v_existente.id is not null and v_existente.eliminado then
    perform revertir_eliminacion_asistencia(v_existente.id);
    v_asistencia_id := v_existente.id;
  else
    insert into asistencia_diaria (empleado_id, area_id, fecha, registrado_por)
    values (p_empleado_id, p_area_id, p_fecha, auth.uid())
    returning id into v_asistencia_id;
  end if;

  -- Red de seguridad: el pago debe existir con el área pedida.
  select * into v_pago from pagos_cuota
   where empleado_id = p_empleado_id and fecha = p_fecha
   limit 1;

  if v_pago.id is null then
    raise exception 'No se generó el pago de cuota para ese día (¿hay cuota vigente para el área?).' using errcode = 'P0001';
  end if;

  if v_pago.area_id is distinct from p_area_id then
    raise exception 'El pago de cuota quedó con un área distinta a la solicitada; se cancela la importación de ese día.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'exito', true,
    'mensaje', 'Horario y asistencia registrados.',
    'asistencia_id', v_asistencia_id,
    'creo_horario', v_creo_horario
  );
end;
$function$;

revoke all on function public.importar_horario_asistencia(uuid, date, uuid) from public, anon;
grant execute on function public.importar_horario_asistencia(uuid, date, uuid) to authenticated;
