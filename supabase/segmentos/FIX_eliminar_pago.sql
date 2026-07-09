-- ============================================================================
-- FIX: eliminar_pago — borrar registros de prueba o errores
-- Ejecuta TODO este archivo en el SQL Editor de Supabase (Run).
-- ============================================================================

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
