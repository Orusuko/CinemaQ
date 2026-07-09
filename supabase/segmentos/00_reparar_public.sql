-- ============================================================================
-- 00_reparar_public.sql — EJECUTA ESTO PRIMERO si ves "schema public does not exist"
-- ============================================================================

create schema if not exists public;

comment on schema public is 'standard public schema';

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

alter default privileges in schema public
  grant all on tables to postgres, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, service_role;
alter default privileges in schema public
  grant all on functions to postgres, service_role;

set search_path to public;

-- VERIFICACIÓN
select schema_name
from information_schema.schemata
where schema_name = 'public';
