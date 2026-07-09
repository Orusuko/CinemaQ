-- ============================================================================
-- 02a_areas_perfiles (2/13)
-- Si perfiles YA existe como tabla, este script solo verifica y no la toca.
-- ============================================================================

create schema if not exists public;
set search_path to public;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'rol_perfil') then
    raise exception 'Falta rol_perfil. Ejecuta 01_extensiones_enums.sql primero.';
  end if;
end $$;

-- Limpiar solo vistas/tipos fantasma (NUNCA hacer DROP VIEW si es una tabla)
do $$
declare v_kind "char";
begin
  select c.relkind into v_kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'perfiles';

  if v_kind = 'v' then
    execute 'drop view public.perfiles cascade';
  elsif v_kind = 'm' then
    execute 'drop materialized view public.perfiles cascade';
  elsif v_kind = 'c' then
    execute 'drop type public.perfiles cascade';
  elsif v_kind = 'r' then
    raise notice 'perfiles ya existe como tabla — se omite la creación';
  end if;
end $$;

create table if not exists areas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  cuota_fija numeric(10,2) not null check (cuota_fija >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre_usuario text not null,
  nombre_completo text not null,
  rol rol_perfil not null,
  area_id uuid null references areas (id),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint perfiles_area_solo_admin_area check (
    (rol = 'admin_area' and area_id is not null) or (rol <> 'admin_area' and area_id is null)
  ),
  constraint perfiles_nombre_usuario_formato check (
    nombre_usuario ~ '^[a-zA-Z0-9_]{2,32}$'
  )
);

create unique index if not exists uq_perfiles_nombre_usuario_lower
  on perfiles (lower(nombre_usuario));

-- VERIFICACIÓN — si es true, pasa a la parte 03
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'perfiles'
) as perfiles_ok;
