-- ============================================================================
-- 04_triggers (7/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

-- ############################################################################
-- 0004_triggers.sql
-- ############################################################################

-- ============================================================================
-- 0004_triggers.sql
-- Triggers de negocio (generación automática de obligación de pago) y de
-- auditoría (poblar logs_auditoria sin depender del frontend).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Mantenimiento de actualizado_en
-- ---------------------------------------------------------------------------
create or replace function set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_areas_actualizado_en on areas;
create trigger trg_areas_actualizado_en before update on areas
  for each row execute function set_actualizado_en();

drop trigger if exists trg_perfiles_actualizado_en on perfiles;
create trigger trg_perfiles_actualizado_en before update on perfiles
  for each row execute function set_actualizado_en();

drop trigger if exists trg_empleados_actualizado_en on empleados;
create trigger trg_empleados_actualizado_en before update on empleados
  for each row execute function set_actualizado_en();

drop trigger if exists trg_pagos_cuota_actualizado_en on pagos_cuota;
create trigger trg_pagos_cuota_actualizado_en before update on pagos_cuota
  for each row execute function set_actualizado_en();

-- ---------------------------------------------------------------------------
-- 6.1 Generación automática de la obligación de pago
-- Al insertar asistencia (no eliminada) se crea pagos_cuota si no existe,
-- con la cuota vigente del área en esa fecha. Garantizado a nivel de BD.
-- ---------------------------------------------------------------------------
create or replace function trg_fn_crear_pago_desde_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.eliminado then
    return new;
  end if;

  insert into pagos_cuota (empleado_id, area_id, fecha, monto_esperado, origen, estado)
  values (
    new.empleado_id,
    new.area_id,
    new.fecha,
    cuota_vigente(new.area_id, new.fecha),
    'flujo_normal',
    'pendiente'
  )
  on conflict (empleado_id, fecha) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_asistencia_crea_pago on asistencia_diaria;
create trigger trg_asistencia_crea_pago
  after insert on asistencia_diaria
  for each row execute function trg_fn_crear_pago_desde_asistencia();

-- ---------------------------------------------------------------------------
-- Auditoría genérica: registra INSERT/UPDATE relevantes en logs_auditoria.
-- Se usa row_to_json para capturar antes/después sin depender del frontend.
-- ---------------------------------------------------------------------------
create or replace function trg_fn_auditoria_generica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accion text;
  v_detalle jsonb;
begin
  if tg_op = 'INSERT' then
    v_accion := lower(tg_table_name) || '_creado';
    v_detalle := jsonb_build_object('nuevo', to_jsonb(new));
    insert into logs_auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), v_accion, tg_table_name, new.id, v_detalle);
    return new;
  elsif tg_op = 'UPDATE' then
    v_accion := lower(tg_table_name) || '_actualizado';
    v_detalle := jsonb_build_object('anterior', to_jsonb(old), 'nuevo', to_jsonb(new));
    insert into logs_auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), v_accion, tg_table_name, new.id, v_detalle);
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_auditoria_empleados on empleados;
create trigger trg_auditoria_empleados
  after insert or update on empleados
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_asistencia on asistencia_diaria;
create trigger trg_auditoria_asistencia
  after insert or update on asistencia_diaria
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_pagos on pagos_cuota;
create trigger trg_auditoria_pagos
  after insert or update on pagos_cuota
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_perfiles on perfiles;
create trigger trg_auditoria_perfiles
  after insert or update on perfiles
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_areas on areas;
create trigger trg_auditoria_areas
  after insert or update on areas
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_historial_cuotas on historial_cuotas;
create trigger trg_auditoria_historial_cuotas
  after insert on historial_cuotas
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_solicitudes_area on solicitudes_cambio_area;
create trigger trg_auditoria_solicitudes_area
  after insert or update on solicitudes_cambio_area
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_cierres_periodo on cierres_periodo;
create trigger trg_auditoria_cierres_periodo
  after insert on cierres_periodo
  for each row execute function trg_fn_auditoria_generica();

-- VERIFICACIÓN
select tgname from pg_trigger where not tgisinternal and tgname like 'trg_%' order by tgname limit 5;
