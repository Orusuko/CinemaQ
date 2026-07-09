-- ============================================================================
-- 02a2_historial_cuotas.sql — opcional, ejecutar después de 02a
-- (antes estaba en 02a y podía revertir perfiles si fallaba aquí)
-- ============================================================================

create table if not exists historial_cuotas (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id),
  monto numeric(10,2) not null check (monto >= 0),
  vigente_desde date not null,
  vigente_hasta date null,
  registrado_por uuid null references auth.users(id),
  creado_en timestamptz not null default now(),
  constraint historial_cuotas_rango_valido check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create index if not exists idx_historial_cuotas_area_vigencia
  on historial_cuotas(area_id, vigente_desde, vigente_hasta);

select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'historial_cuotas'
) as historial_ok;
