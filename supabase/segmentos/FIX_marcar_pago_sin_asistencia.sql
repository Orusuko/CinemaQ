-- ============================================================================
-- FIX: marcar pago sin asistencia previa
-- Permite que el empleado marque "Ya pagué" aunque no tenga asistencia/horario
-- registrado hoy. Sigue bloqueando un segundo pago el mismo día.
-- Ejecuta TODO este archivo en el SQL Editor de Supabase (Run).
-- ============================================================================

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
