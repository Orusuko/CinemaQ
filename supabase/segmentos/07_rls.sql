-- ============================================================================
-- 07_rls (10/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

-- ############################################################################
-- 0007_rls.sql
-- ############################################################################

-- ============================================================================
-- 0007_rls.sql
-- Row Level Security: la fuente real de permisos del sistema (sección 9).
-- La UI solo oculta botones por comodidad; esto es lo que de verdad protege
-- los datos, porque el frontend habla directo con Supabase vía anon key.
--
-- Principio de diseño usado en este archivo:
--  - Las tablas cuya escritura SIEMPRE pasa por una función RPC
--    (SECURITY DEFINER, ver 0005/0006) NO reciben políticas de INSERT/UPDATE
--    para usuarios normales: la función se salta RLS y hace sus propias
--    validaciones, así que dejar la tabla sin política de escritura directa
--    obliga a pasar por la función (defensa en profundidad).
--  - Las tablas con escritura directa desde el frontend (empleados,
--    notificaciones) sí reciben políticas de INSERT/UPDATE acotadas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Trigger de defensa adicional: admin_area NUNCA puede cambiar el area_id de
-- un empleado directamente (ni por RLS ni por RPC), solo administrador_general
-- (vía mover_empleado_area o al resolver una solicitud aprobada).
-- ---------------------------------------------------------------------------
create or replace function trg_fn_bloquear_cambio_area_admin_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.area_id is distinct from old.area_id and not es_admin_general() then
    raise exception 'Solo el administrador general puede cambiar el área de un empleado.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_empleados_bloquear_cambio_area on empleados;
create trigger trg_empleados_bloquear_cambio_area
  before update on empleados
  for each row execute function trg_fn_bloquear_cambio_area_admin_area();

-- ---------------------------------------------------------------------------
-- Trigger: admin_area solo puede cambiar el estado (activo/inactivo) de
-- empleados de su área; el resto de campos quedan reservados al admin general.
-- ---------------------------------------------------------------------------
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

-- ============================================================================
-- Base defensiva: revocar TODO privilegio de tabla por defecto para `anon` y
-- `authenticated` antes de conceder explícitamente solo lo necesario abajo.
-- Esto hace que la migración no dependa de qué privilegios por defecto haya
-- configurado Supabase al crear las tablas: el resultado final es siempre el
-- mismo, autocontenido en este archivo.
-- ============================================================================
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY (obligatorio en TODAS las tablas de negocio)
-- ============================================================================
alter table areas enable row level security;
alter table historial_cuotas enable row level security;
alter table perfiles enable row level security;
alter table empleados enable row level security;
alter table historial_area_empleado enable row level security;
alter table horario_diario enable row level security;
alter table asistencia_diaria enable row level security;
alter table pagos_cuota enable row level security;
alter table solicitudes_cambio_area enable row level security;
alter table notificaciones enable row level security;
alter table logs_auditoria enable row level security;
alter table cierres_periodo enable row level security;

-- ============================================================================
-- areas — catálogo pequeño, lectura abierta a autenticados; escritura
-- reservada a administrador_general (cuota_fija se actualiza normalmente vía
-- cambiar_cuota, pero se permite UPDATE directo para nombre/activo).
-- ============================================================================
drop policy if exists areas_select_autenticados on areas;
drop policy if exists areas_update_admin_general on areas;

grant select on areas to authenticated;
grant update on areas to authenticated;

create policy areas_select_autenticados on areas
  for select to authenticated
  using (true);

create policy areas_update_admin_general on areas
  for update to authenticated
  using (es_admin_general())
  with check (es_admin_general());

-- ============================================================================
-- historial_cuotas — solo lectura desde el cliente (INSERT vía cambiar_cuota).
-- ============================================================================
drop policy if exists historial_cuotas_select on historial_cuotas;

grant select on historial_cuotas to authenticated;

create policy historial_cuotas_select on historial_cuotas
  for select to authenticated
  using (es_admin_general() or es_supervision() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- perfiles — cada quien ve su propio perfil; administrador_general ve todos
-- (necesario para el panel de gestión de usuarios). Sin INSERT/UPDATE/DELETE
-- desde el cliente: los perfiles se gestionan por Edge Function (service_role).
-- ============================================================================
drop policy if exists perfiles_select_propio on perfiles;

grant select on perfiles to authenticated;

create policy perfiles_select_propio on perfiles
  for select to authenticated
  using (id = auth.uid() or es_admin_general());

-- ============================================================================
-- empleados — admin_area ve/edita solo su área; administrador_general todo;
-- supervision solo lectura. anon NO tiene acceso directo (usa RPC pública).
-- ============================================================================
drop policy if exists empleados_select on empleados;
drop policy if exists empleados_insert on empleados;
drop policy if exists empleados_update on empleados;

grant select, insert, update on empleados to authenticated;

-- admin_area puede leer empleados de todas las áreas (p. ej. solicitar incorporación);
-- insert/update siguen limitados a su propia área.
create policy empleados_select on empleados
  for select to authenticated
  using (es_admin_general() or es_supervision() or es_admin_area());

create policy empleados_insert on empleados
  for insert to authenticated
  with check (es_admin_general() or (es_admin_area() and area_id = mi_area_id()));

create policy empleados_update on empleados
  for update to authenticated
  using (es_admin_general() or (es_admin_area() and area_id = mi_area_id()))
  with check (es_admin_general() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- historial_area_empleado — solo lectura; admin_area ve movimientos que
-- involucren su área, administrador_general y supervision ven todo.
-- ============================================================================
drop policy if exists historial_area_empleado_select on historial_area_empleado;

grant select on historial_area_empleado to authenticated;

create policy historial_area_empleado_select on historial_area_empleado
  for select to authenticated
  using (
    es_admin_general() or es_supervision()
    or (es_admin_area() and mi_area_id() in (area_anterior_id, area_nueva_id))
  );

-- ============================================================================
-- horario_diario — todas las escrituras van por RPC (registrar_horario,
-- quitar_horario, registrar_asistencia_desde_horario). Solo SELECT directo.
-- ============================================================================
drop policy if exists horario_diario_select on horario_diario;

grant select on horario_diario to authenticated;

create policy horario_diario_select on horario_diario
  for select to authenticated
  using (es_admin_general() or es_supervision() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- asistencia_diaria — todas las escrituras van por RPC. admin_area NUNCA ve
-- filas eliminadas (ni siquiera en solo lectura); administrador_general y
-- supervision sí, para efectos de auditoría.
-- ============================================================================
drop policy if exists asistencia_select_admin_area on asistencia_diaria;
drop policy if exists asistencia_select_general_supervision on asistencia_diaria;

grant select on asistencia_diaria to authenticated;

create policy asistencia_select_admin_area on asistencia_diaria
  for select to authenticated
  using (es_admin_area() and area_id = mi_area_id() and eliminado = false);

create policy asistencia_select_general_supervision on asistencia_diaria
  for select to authenticated
  using (es_admin_general() or es_supervision());

-- ============================================================================
-- pagos_cuota — todas las escrituras van por RPC (marcar_pago_empleado,
-- validar_pago, rechazar_pago, registrar_pago_manual, revertir_validacion).
-- Ningún rol tiene INSERT/UPDATE/DELETE directo, ni siquiera administrador_general.
-- ============================================================================
drop policy if exists pagos_cuota_select on pagos_cuota;

grant select on pagos_cuota to authenticated;

create policy pagos_cuota_select on pagos_cuota
  for select to authenticated
  using (es_admin_general() or es_supervision() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- solicitudes_cambio_area — escritura vía RPC. admin_area ve las que solicitó
-- o las dirigidas a su área; administrador_general y supervision ven todas.
-- ============================================================================
drop policy if exists solicitudes_area_select on solicitudes_cambio_area;

grant select on solicitudes_cambio_area to authenticated;

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

-- ============================================================================
-- notificaciones — cada perfil ve únicamente las suyas. Marcar como leída
-- pasa por la función marcar_notificacion_leida (SECURITY DEFINER).
-- ============================================================================
drop policy if exists notificaciones_select_propias on notificaciones;

grant select on notificaciones to authenticated;

create policy notificaciones_select_propias on notificaciones
  for select to authenticated
  using (destinatario_id = auth.uid());

-- ============================================================================
-- logs_auditoria — admin_area NO tiene acceso (sección 4: "NO logs completos
-- de auditoría de eliminados"). Solo administrador_general y supervision.
-- ============================================================================
drop policy if exists logs_auditoria_select on logs_auditoria;

grant select on logs_auditoria to authenticated;

create policy logs_auditoria_select on logs_auditoria
  for select to authenticated
  using (es_admin_general() or es_supervision());

-- ============================================================================
-- cierres_periodo — insert-only vía RPC cerrar_periodo. Lectura: admin_area
-- (solo su área), administrador_general y supervision (todas). Sin UPDATE ni
-- DELETE para ningún rol (ninguna política = denegado por defecto).
-- ============================================================================
drop policy if exists cierres_periodo_select on cierres_periodo;

grant select on cierres_periodo to authenticated;

create policy cierres_periodo_select on cierres_periodo
  for select to authenticated
  using (es_admin_general() or es_supervision() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- Rol anon: SIN acceso directo a ninguna tabla (ya revocado arriba). Su única
-- puerta son las funciones marcar_pago_empleado(), listar_empleados_publicos()
-- y balance_publico_hoy() (0005), que ya tienen su propio GRANT EXECUTE y son
-- SECURITY DEFINER (el GRANT USAGE sobre el esquema ya se hizo arriba).
-- ============================================================================

-- VERIFICACIÓN
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='perfiles';
