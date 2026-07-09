-- ============================================================================
-- 02d_cierres (5/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

-- 5.11 logs_auditoria ------------------------------------------------------------
create table if not exists logs_auditoria (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid null references auth.users(id),
  accion      text not null,
  entidad     text not null,
  entidad_id  uuid null,
  detalle     jsonb null,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_logs_auditoria_entidad on logs_auditoria(entidad, entidad_id);
create index if not exists idx_logs_auditoria_creado_en on logs_auditoria(creado_en desc);

-- 5.12 cierres_periodo -------------------------------------------------------------
-- Snapshot contable, insert-only. `detalle` guarda el desglose por empleado
-- usado para regenerar el CSV sin depender del estado actual de pagos_cuota
-- (que puede seguir cambiando después del cierre, ya que el cierre NO bloquea
-- operación). Ver README para el razonamiento de esta decisión de diseño.
create table if not exists cierres_periodo (
  id                     uuid primary key default gen_random_uuid(),
  area_id                uuid not null references areas(id),
  desde                  date not null,
  hasta                  date not null,
  cerrado_por            uuid not null references auth.users(id),
  cerrado_en             timestamptz not null default now(),
  monto_esperado_total   numeric(12,2) not null,
  monto_validado_total   numeric(12,2) not null,
  diferencia             numeric(12,2) generated always as (monto_esperado_total - monto_validado_total) stored,
  detalle                jsonb not null default '[]'::jsonb,
  notas                  text null,
  constraint cierres_periodo_rango_valido check (hasta >= desde),
  exclude using gist (area_id with =, daterange(desde, hasta, '[]') with &&)
);
create index if not exists idx_cierres_periodo_area_rango on cierres_periodo(area_id, desde, hasta);

-- VERIFICACIÓN
select table_name from information_schema.tables where table_schema='public' and table_name in ('logs_auditoria','cierres_periodo') order by table_name;
