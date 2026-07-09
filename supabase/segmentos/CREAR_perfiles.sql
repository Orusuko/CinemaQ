-- ============================================================================
-- CREAR_perfiles.sql — ejecuta 00_reparar_public.sql antes si hace falta
-- ============================================================================

-- 0) Asegurar que existe el schema public
create schema if not exists public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
set search_path to public;

-- 1) Prerrequisitos
select exists (select 1 from pg_type where typname = 'rol_perfil') as enum_rol_perfil_ok;

select exists (
  select 1 from information_schema.tables
  where table_schema = 'auth' and table_name = 'users'
) as auth_users_ok;

-- 2) Limpiar solo vistas/tipos fantasma (no tocar si ya es tabla)
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
    raise notice 'perfiles ya es tabla — no se elimina';
  end if;
end $$;

-- 3) areas
create table if not exists areas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null unique,
  cuota_fija     numeric(10,2) not null check (cuota_fija >= 0),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- 4) perfiles (solo crear si no existe)
create table if not exists perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre_usuario  text not null,
  nombre_completo text not null,
  rol             rol_perfil not null,
  area_id         uuid null references areas (id),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint perfiles_area_solo_admin_area check (
    (rol = 'admin_area' and area_id is not null) or
    (rol <> 'admin_area' and area_id is null)
  ),
  constraint perfiles_nombre_usuario_formato check (
    nombre_usuario ~ '^[a-zA-Z0-9_]{2,32}$'
  )
);

create unique index if not exists uq_perfiles_nombre_usuario_lower
  on perfiles (lower(nombre_usuario));

-- VERIFICACIÓN
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'perfiles'
) as perfiles_ok;
