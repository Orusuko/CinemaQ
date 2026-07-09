-- ============================================================================
-- 02c_pagos_notificaciones (4/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

-- 5.8 pagos_cuota (núcleo del sistema) --------------------------------------------
create table if not exists pagos_cuota (
  id                     uuid primary key default gen_random_uuid(),
  empleado_id            uuid not null references empleados(id),
  area_id                uuid not null references areas(id),
  fecha                  date not null,
  monto_esperado         numeric(10,2) not null check (monto_esperado >= 0),
  marcado_por_empleado   boolean not null default false,
  marcado_empleado_en    timestamptz null,
  validado               boolean not null default false,
  validado_por           uuid null references auth.users(id),
  validado_en            timestamptz null,
  origen                 origen_pago not null default 'flujo_normal',
  estado                 estado_pago not null default 'pendiente',
  motivo_reversion       text null,
  notas                  text null,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  unique (empleado_id, fecha)
);
create index if not exists idx_pagos_cuota_area_fecha on pagos_cuota(area_id, fecha);
create index if not exists idx_pagos_cuota_estado on pagos_cuota(estado);
create index if not exists idx_pagos_cuota_marcado_empleado_en on pagos_cuota(marcado_empleado_en) where estado = 'marcado_pendiente_validacion';

-- 5.9 solicitudes_cambio_area -----------------------------------------------------
create table if not exists solicitudes_cambio_area (
  id                  uuid primary key default gen_random_uuid(),
  empleado_id         uuid not null references empleados(id),
  area_actual_id      uuid not null references areas(id),
  area_solicitada_id  uuid not null references areas(id),
  solicitado_por      uuid not null references auth.users(id),
  estado              estado_solicitud_area not null default 'pendiente',
  resuelto_por        uuid null references auth.users(id),
  motivo              text null,
  creado_en           timestamptz not null default now(),
  resuelto_en         timestamptz null,
  constraint solicitud_areas_distintas check (area_actual_id <> area_solicitada_id)
);
create index if not exists idx_solicitudes_area_estado on solicitudes_cambio_area(estado);

-- 5.10 notificaciones ---------------------------------------------------------------
create table if not exists notificaciones (
  id             uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references perfiles(id),
  tipo           tipo_notificacion not null,
  titulo         text not null,
  mensaje        text not null,
  leida          boolean not null default false,
  entidad        text null,
  entidad_id     uuid null,
  metadata       jsonb null,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_notificaciones_destinatario_leida on notificaciones(destinatario_id, leida);
-- Evita duplicar la notificación de "pago estancado" para el mismo pago/destinatario.
create unique index if not exists uq_notificaciones_estancado_por_destino
  on notificaciones(destinatario_id, tipo, entidad, entidad_id)
  where tipo = 'pago_en_revision_estancado';

-- VERIFICACIÓN
select table_name from information_schema.tables where table_schema='public' and table_name in ('pagos_cuota','notificaciones') order by table_name;
