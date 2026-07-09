-- ============================================================================
-- 02b_empleados_asistencia (3/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

-- 5.4 empleados ----------------------------------------------------------------
create table if not exists empleados (
  id                     uuid primary key default gen_random_uuid(),
  numero_empleado        varchar(6) not null unique,
  primer_nombre          text not null,
  segundo_nombre         text null,
  primer_apellido        text not null,
  segundo_apellido       text null,
  pref_nombre_publico    preferencia_nombre not null default 'primer',
  pref_apellido_publico  preferencia_nombre not null default 'primer',
  area_id                uuid not null references areas(id),
  estado                 estado_empleado not null default 'activo',
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  actualizado_por        uuid null references auth.users(id),
  constraint empleados_numero_formato check (numero_empleado ~ '^[0-9]{6}$')
);
create index if not exists idx_empleados_numero on empleados(numero_empleado);
create index if not exists idx_empleados_area_estado on empleados(area_id, estado);

-- 5.5 historial_area_empleado ---------------------------------------------------
create table if not exists historial_area_empleado (
  id               uuid primary key default gen_random_uuid(),
  empleado_id      uuid not null references empleados(id),
  area_anterior_id uuid not null references areas(id),
  area_nueva_id    uuid not null references areas(id),
  fecha_cambio     timestamptz not null default now(),
  realizado_por    uuid null references auth.users(id)
);
create index if not exists idx_historial_area_empleado_empleado on historial_area_empleado(empleado_id);

-- 5.6 horario_diario -------------------------------------------------------------
create table if not exists horario_diario (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid not null references empleados(id),
  area_id        uuid not null references areas(id),
  fecha          date not null,
  registrado_por uuid null references auth.users(id),
  creado_en      timestamptz not null default now(),
  unique (empleado_id, fecha)
);
create index if not exists idx_horario_diario_area_fecha on horario_diario(area_id, fecha);

-- 5.7 asistencia_diaria ----------------------------------------------------------
create table if not exists asistencia_diaria (
  id                 uuid primary key default gen_random_uuid(),
  empleado_id        uuid not null references empleados(id),
  area_id            uuid not null references areas(id),
  fecha              date not null,
  registrado_por     uuid null references auth.users(id),
  creado_en          timestamptz not null default now(),
  eliminado          boolean not null default false,
  eliminado_en       timestamptz null,
  eliminado_por      uuid null references auth.users(id),
  motivo_eliminacion text null,
  unique (empleado_id, fecha)
);
create index if not exists idx_asistencia_area_fecha on asistencia_diaria(area_id, fecha);
create index if not exists idx_asistencia_empleado_fecha on asistencia_diaria(empleado_id, fecha);

-- VERIFICACIÓN
select table_name from information_schema.tables where table_schema='public' and table_name in ('empleados','asistencia_diaria') order by table_name;
