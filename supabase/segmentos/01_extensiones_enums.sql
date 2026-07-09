-- ============================================================================
-- 01_extensiones_enums (1/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 00 → 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

create schema if not exists public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
set search_path to public;

-- ############################################################################
-- 0001_extensions_enums.sql
-- ############################################################################

-- ============================================================================
-- 0001_extensions_enums.sql
-- Extensiones y tipos ENUM usados en todo el sistema.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

do $$ begin
  execute 'create extension if not exists pg_cron';
exception
  when insufficient_privilege then
    raise notice 'pg_cron omitido: sin permisos';
  when undefined_file then
    raise notice 'pg_cron omitido: extension no disponible';
  when others then
    raise notice 'pg_cron omitido: %', sqlerrm;
end $$;

-- Zona horaria de referencia para toda la lógica de "día operativo".
-- Nota: esto NO cambia el timezone del cluster; las funciones de la sección
-- 0003 usan explícitamente 'America/Mexico_City' en cada conversión, que es
-- la forma correcta y portable de garantizar la zona horaria sin depender de
-- la configuración global del servidor.

do $$ begin
  create type rol_perfil as enum ('admin_area', 'administrador_general', 'supervision');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_empleado as enum ('activo', 'inactivo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type preferencia_nombre as enum ('primer', 'segundo', 'ambos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_pago as enum ('pendiente', 'marcado_pendiente_validacion', 'validado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origen_pago as enum ('flujo_normal', 'manual_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_solicitud_area as enum ('pendiente', 'aprobada', 'rechazada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_notificacion as enum (
    'pago_fuera_horario',
    'solicitud_cambio_area',
    'pago_en_revision_estancado',
    'empleado_nuevo_sin_horario'
  );
exception when duplicate_object then null; end $$;

-- VERIFICACIÓN
select extname from pg_extension where extname in ('pgcrypto','btree_gist','pg_cron') order by extname;
select typname from pg_type where typname in ('rol_perfil','estado_empleado') order by typname;
