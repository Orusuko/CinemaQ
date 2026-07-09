-- ============================================================================
-- ARREGLO RÁPIDO: ejecuta esto si la parte 03 dice "perfiles does not exist"
-- Requiere haber ejecutado la parte 01 (ENUMs) antes.
-- ============================================================================

-- 1) Diagnóstico: ¿qué tablas existen ahora?
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

-- 2) Crear solo perfiles (y dependencias mínimas si faltan)
create table if not exists areas (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  cuota_fija   numeric(10,2) not null check (cuota_fija >= 0),
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table if not exists perfiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  nombre_usuario   text not null,
  nombre_completo  text not null,
  rol              rol_perfil not null,
  area_id          uuid null references areas(id),
  activo           boolean not null default true,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  constraint perfiles_area_solo_admin_area check (
    (rol = 'admin_area' and area_id is not null) or
    (rol <> 'admin_area' and area_id is null)
  ),
  constraint perfiles_nombre_usuario_formato check (
    nombre_usuario ~ '^[a-zA-Z0-9_]{2,32}$'
  )
);

create unique index if not exists uq_perfiles_nombre_usuario_lower on perfiles (lower(nombre_usuario));

-- 3) Confirmar
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'perfiles'
) as tabla_perfiles_existe;
