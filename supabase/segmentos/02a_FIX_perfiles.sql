-- ============================================================================
-- 02a_FIX_perfiles.sql — usa SOLO si 02a sigue en false
-- ============================================================================

-- 1) Estado actual de todo lo llamado "perfiles"
select n.nspname, c.relname, c.relkind,
  case c.relkind when 'r' then 'tabla' when 'v' then 'vista' when 'c' then 'tipo' else c.relkind::text end as tipo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'perfiles';

-- 2) ¿notificaciones ya existe y apunta a perfiles?
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'notificaciones'
) as notificaciones_existe;

-- 3) Si NOTIFICACIONES existe, PERFILES debe existir. Confirma con pg_catalog:
select c.relname, c.relkind, n.nspname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('perfiles', 'notificaciones') and n.nspname = 'public'
order by c.relname;

-- 4) Si perfiles_ok sigue false pero notificaciones SÍ existe,
--    la tabla perfiles ya está creada — puedes saltar a la parte 03.
--    Si ninguna existe, ejecuta el bloque de abajo:

-- --- DESCOMENTA Y EJECUTA SOLO SI perfiles NO existe (relkind 'r' no aparece arriba) ---

/*
drop view if exists public.perfiles cascade;
drop type if exists public.perfiles cascade;

create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  cuota_fija numeric(10,2) not null check (cuota_fija >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_usuario text not null,
  nombre_completo text not null,
  rol public.rol_perfil not null,
  area_id uuid null references areas(id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'perfiles'
) as perfiles_ok;
*/
