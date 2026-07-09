-- ============================================================================
-- DIAGNÓSTICO — ejecuta esto PRIMERO y revisa todos los resultados
-- ============================================================================

-- 1) Extensiones (necesarias para el esquema)
select extname, extversion
from pg_extension
where extname in ('pgcrypto', 'btree_gist', 'pg_cron')
order by extname;

-- 2) ENUMs (deben existir tras la parte 01)
select t.typname as enum_name
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
  and t.typtype = 'e'
order by t.typname;

-- 3) Tablas public actuales
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

-- 4) ¿Existe perfiles?
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'perfiles'
) as perfiles_existe;

-- 5) ¿Puedes referenciar auth.users? (prueba mínima)
select exists (
  select 1 from information_schema.tables
  where table_schema = 'auth' and table_name = 'users'
) as auth_users_existe;

-- 6) ¿Hay algo llamado perfiles que NO sea tabla? (estado corrupto)
select n.nspname as schema, c.relname, c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'perfiles';
