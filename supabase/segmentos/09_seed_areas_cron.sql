-- ============================================================================
-- 09_seed_areas_cron (12/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

-- ############################################################################
-- 0008_seed_y_cron.sql
-- ############################################################################

-- ============================================================================
-- 0008_seed_y_cron.sql
-- Datos iniciales (áreas y cuotas) + tarea programada de pagos estancados.
--
-- NOTA IMPORTANTE sobre usuarios administrativos:
-- Los 4 usuarios iniciales (Andre, Tony, Administrador, Supervisión) NO se
-- crean en esta migración porque insertar directamente en auth.users es
-- frágil (depende de la versión interna de GoTrue/Supabase Auth) y no es la
-- forma soportada de crear usuarios. En su lugar, créalos con el Dashboard de
-- Supabase (Authentication → Users → Add user) o con la Admin API, y luego
-- ejecuta el script supabase/seed/crear_perfiles_iniciales.sql (sustituyendo
-- los UUID reales) para vincularlos a la tabla `perfiles`. Ver README.md.
-- ============================================================================

insert into areas (nombre, cuota_fija, activo)
values
  ('Comanderos', 21.00, true),
  ('Corredores', 10.00, true)
on conflict (nombre) do nothing;

-- Deja un registro inicial en historial_cuotas para que cuota_vigente()
-- tenga una fuente explícita desde el día 1 (en vez de depender solo del
-- valor "de conveniencia" en areas.cuota_fija).
insert into historial_cuotas (area_id, monto, vigente_desde, vigente_hasta, registrado_por)
select id, cuota_fija, date '2020-01-01', null, null
from areas
where not exists (select 1 from historial_cuotas hc where hc.area_id = areas.id);

-- ---------------------------------------------------------------------------
-- pg_cron: revisión diaria de pagos estancados (más de 2 días en revisión).
-- Hora en UTC (pg_cron no usa la zona horaria del proyecto). 13:00 UTC
-- equivale aprox. a las 07:00-08:00 en America/Mexico_City según horario de
-- verano. El propósito es solo correr una vez al día; la hora exacta no es
-- crítica para esta regla de negocio.
-- Si pg_cron no está disponible en tu plan de Supabase, usa el fallback
-- documentado en el README (Edge Function programada con un scheduler externo).
-- ---------------------------------------------------------------------------
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'revisar-pagos-estancados-diario';

select cron.schedule(
  'revisar-pagos-estancados-diario',
  '0 13 * * *',
  $$select revisar_pagos_estancados();$$
);

-- VERIFICACIÓN
select nombre,cuota_fija from areas order by nombre;
