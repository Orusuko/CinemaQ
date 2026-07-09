-- ============================================================================
-- esquema_completo.sql
-- Sistema de Seguimiento de Cuotas de Propinas — TODO EN UN SOLO ARCHIVO.
--
-- Incluye: extensiones, tablas, funciones, triggers, RPC, RLS, seed de áreas,
-- pg_cron y el usuario administrador de prueba (Orusuko / 1234).
--
-- Uso: Supabase Dashboard → SQL Editor → pegar TODO este archivo → Run.
--
-- Antes de ejecutar, en Authentication → Providers → Email pon
-- Minimum password length = 4 (para la contraseña de prueba "1234").
--
-- Es idempotente: usa create or replace, if not exists, on conflict, etc.
-- ============================================================================


-- ############################################################################
-- 0001_extensions_enums.sql
-- ############################################################################

-- ============================================================================
-- 0001_extensions_enums.sql
-- Extensiones y tipos ENUM usados en todo el sistema.
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "btree_gist";    -- requerido por EXCLUDE en cierres_periodo
create extension if not exists "pg_cron";       -- tareas programadas (revisar_pagos_estancados)

-- Zona horaria de referencia para toda la lógica de "día operativo".
-- Nota: esto NO cambia el timezone del cluster; las funciones de la sección
-- 0003 usan explícitamente 'America/Mexico_City' en cada conversión, que es
-- la forma correcta y portable de garantizar la zona horaria sin depender de
-- la configuración global del servidor.

do $$ begin
  create type rol_perfil as enum ('admin_area', 'administrador_general', 'supervision');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_empleado as enum ('activo', 'inactivo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type preferencia_nombre as enum ('primer', 'segundo', 'ambos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_pago as enum ('pendiente', 'marcado_pendiente_validacion', 'validado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origen_pago as enum ('flujo_normal', 'manual_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_solicitud_area as enum ('pendiente', 'aprobada', 'rechazada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_notificacion as enum (
    'pago_fuera_horario',
    'solicitud_cambio_area',
    'pago_en_revision_estancado',
    'empleado_nuevo_sin_horario'
  );
exception when duplicate_object then null; end $$;


-- ############################################################################
-- 0002_tables.sql
-- ############################################################################

-- ============================================================================
-- 0002_tables.sql
-- Modelo de datos completo (sección 5 de la especificación).
-- ============================================================================

-- 5.1 areas ------------------------------------------------------------------
create table if not exists areas (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  cuota_fija   numeric(10,2) not null check (cuota_fija >= 0),
  activo       boolean not null default true,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- 5.2 historial_cuotas ---------------------------------------------------------
create table if not exists historial_cuotas (
  id              uuid primary key default gen_random_uuid(),
  area_id         uuid not null references areas(id),
  monto           numeric(10,2) not null check (monto >= 0),
  vigente_desde   date not null,
  vigente_hasta   date null,
  registrado_por  uuid null references auth.users(id),
  creado_en       timestamptz not null default now(),
  constraint historial_cuotas_rango_valido check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create index if not exists idx_historial_cuotas_area_vigencia on historial_cuotas(area_id, vigente_desde, vigente_hasta);

-- 5.3 perfiles (roles administrativos, ligados a auth.users) -----------------
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


-- ############################################################################
-- 0003_funciones_auxiliares.sql
-- ############################################################################

-- ============================================================================
-- 0003_funciones_auxiliares.sql
-- Funciones de apoyo: zona horaria CDMX, identidad/rol del usuario actual,
-- helpers de nombre público. Todas SECURITY DEFINER cuando leen `perfiles`
-- para evitar recursión de RLS (sección 9 de la especificación).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Zona horaria y ventana operativa
-- ---------------------------------------------------------------------------

create or replace function hora_cdmx()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

-- Fecha calendario "de hoy" en America/Mexico_City. Nunca usar el reloj del
-- cliente para esto: toda la lógica de "qué día es hoy" vive aquí.
create or replace function fecha_operativa_cdmx()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Mexico_City')::date;
$$;

-- Hora local CDMX (solo la parte de tiempo), útil para comparar contra 23:30.
create or replace function hora_local_cdmx()
returns time
language sql
stable
as $$
  select (now() at time zone 'America/Mexico_City')::time;
$$;

-- Ventana en la que el empleado puede marcar "Ya pagué": hasta las 23:30 CDMX
-- del día operativo actual.
create or replace function ventana_empleado_abierta()
returns boolean
language sql
stable
as $$
  select hora_local_cdmx() <= time '23:30:00';
$$;

-- ---------------------------------------------------------------------------
-- Identidad / rol del usuario autenticado (SECURITY DEFINER para evitar
-- recursión de RLS cuando otras políticas consultan `perfiles`).
-- ---------------------------------------------------------------------------

create or replace function mi_perfil()
returns perfiles
language sql
stable
security definer
set search_path = public
as $$
  select * from perfiles where id = auth.uid();
$$;

create or replace function mi_rol()
returns rol_perfil
language sql
stable
security definer
set search_path = public
as $$
  select rol from perfiles where id = auth.uid() and activo = true;
$$;

create or replace function mi_area_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select area_id from perfiles where id = auth.uid() and activo = true;
$$;

create or replace function es_admin_general()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and activo = true and rol = 'administrador_general'
  );
$$;

create or replace function es_admin_area()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and activo = true and rol = 'admin_area'
  );
$$;

create or replace function es_supervision()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and activo = true and rol = 'supervision'
  );
$$;

-- Verdadero si el usuario autenticado tiene rol admin_area o
-- administrador_general Y (si es admin_area) el area_id coincide.
create or replace function tengo_acceso_area(p_area_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    es_admin_general()
    or (es_admin_area() and mi_area_id() = p_area_id);
$$;

-- ---------------------------------------------------------------------------
-- Cuota vigente de un área en una fecha dada (usa historial_cuotas si existe
-- una fila vigente para esa fecha; si no, cae a areas.cuota_fija).
-- ---------------------------------------------------------------------------

create or replace function cuota_vigente(p_area_id uuid, p_fecha date)
returns numeric
language sql
stable
as $$
  select coalesce(
    (
      select hc.monto
      from historial_cuotas hc
      where hc.area_id = p_area_id
        and hc.vigente_desde <= p_fecha
        and (hc.vigente_hasta is null or hc.vigente_hasta >= p_fecha)
      order by hc.vigente_desde desc
      limit 1
    ),
    (select a.cuota_fija from areas a where a.id = p_area_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Nombre público del empleado según sus preferencias (sección 4.2).
-- ---------------------------------------------------------------------------

create or replace function nombre_publico(e empleados)
returns text
language sql
stable
as $$
  select trim(
    (
      case e.pref_nombre_publico
        when 'primer' then e.primer_nombre
        when 'segundo' then coalesce(e.segundo_nombre, e.primer_nombre)
        when 'ambos' then trim(e.primer_nombre || ' ' || coalesce(e.segundo_nombre, ''))
      end
    ) || ' ' ||
    (
      case e.pref_apellido_publico
        when 'primer' then e.primer_apellido
        when 'segundo' then coalesce(e.segundo_apellido, e.primer_apellido)
        when 'ambos' then trim(e.primer_apellido || ' ' || coalesce(e.segundo_apellido, ''))
      end
    )
  );
$$;

-- Primeros 4 dígitos del número de empleado (identificador público corto).
-- Uso base para reportes/CSV; la desambiguación automática ante colisiones
-- entre empleados activos (ampliar a 5 dígitos) vive en
-- listar_empleados_publicos() (0005_rpc_publico.sql), no aquí.
create or replace function id_publico(numero_empleado text)
returns text
language sql
immutable
as $$
  select left(numero_empleado, 4);
$$;


-- ############################################################################
-- 0004_triggers.sql
-- ############################################################################

-- ============================================================================
-- 0004_triggers.sql
-- Triggers de negocio (generación automática de obligación de pago) y de
-- auditoría (poblar logs_auditoria sin depender del frontend).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Mantenimiento de actualizado_en
-- ---------------------------------------------------------------------------
create or replace function set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_areas_actualizado_en on areas;
create trigger trg_areas_actualizado_en before update on areas
  for each row execute function set_actualizado_en();

drop trigger if exists trg_perfiles_actualizado_en on perfiles;
create trigger trg_perfiles_actualizado_en before update on perfiles
  for each row execute function set_actualizado_en();

drop trigger if exists trg_empleados_actualizado_en on empleados;
create trigger trg_empleados_actualizado_en before update on empleados
  for each row execute function set_actualizado_en();

drop trigger if exists trg_pagos_cuota_actualizado_en on pagos_cuota;
create trigger trg_pagos_cuota_actualizado_en before update on pagos_cuota
  for each row execute function set_actualizado_en();

-- ---------------------------------------------------------------------------
-- 6.1 Generación automática de la obligación de pago
-- Al insertar asistencia (no eliminada) se crea pagos_cuota si no existe,
-- con la cuota vigente del área en esa fecha. Garantizado a nivel de BD.
-- ---------------------------------------------------------------------------
create or replace function trg_fn_crear_pago_desde_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.eliminado then
    return new;
  end if;

  insert into pagos_cuota (empleado_id, area_id, fecha, monto_esperado, origen, estado)
  values (
    new.empleado_id,
    new.area_id,
    new.fecha,
    cuota_vigente(new.area_id, new.fecha),
    'flujo_normal',
    'pendiente'
  )
  on conflict (empleado_id, fecha) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_asistencia_crea_pago on asistencia_diaria;
create trigger trg_asistencia_crea_pago
  after insert on asistencia_diaria
  for each row execute function trg_fn_crear_pago_desde_asistencia();

-- ---------------------------------------------------------------------------
-- Auditoría genérica: registra INSERT/UPDATE relevantes en logs_auditoria.
-- Se usa row_to_json para capturar antes/después sin depender del frontend.
-- ---------------------------------------------------------------------------
create or replace function trg_fn_auditoria_generica()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accion text;
  v_detalle jsonb;
begin
  if tg_op = 'INSERT' then
    v_accion := lower(tg_table_name) || '_creado';
    v_detalle := jsonb_build_object('nuevo', to_jsonb(new));
    insert into logs_auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), v_accion, tg_table_name, new.id, v_detalle);
    return new;
  elsif tg_op = 'UPDATE' then
    v_accion := lower(tg_table_name) || '_actualizado';
    v_detalle := jsonb_build_object('anterior', to_jsonb(old), 'nuevo', to_jsonb(new));
    insert into logs_auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), v_accion, tg_table_name, new.id, v_detalle);
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_auditoria_empleados on empleados;
create trigger trg_auditoria_empleados
  after insert or update on empleados
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_asistencia on asistencia_diaria;
create trigger trg_auditoria_asistencia
  after insert or update on asistencia_diaria
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_pagos on pagos_cuota;
create trigger trg_auditoria_pagos
  after insert or update on pagos_cuota
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_perfiles on perfiles;
create trigger trg_auditoria_perfiles
  after insert or update on perfiles
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_areas on areas;
create trigger trg_auditoria_areas
  after insert or update on areas
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_historial_cuotas on historial_cuotas;
create trigger trg_auditoria_historial_cuotas
  after insert on historial_cuotas
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_solicitudes_area on solicitudes_cambio_area;
create trigger trg_auditoria_solicitudes_area
  after insert or update on solicitudes_cambio_area
  for each row execute function trg_fn_auditoria_generica();

drop trigger if exists trg_auditoria_cierres_periodo on cierres_periodo;
create trigger trg_auditoria_cierres_periodo
  after insert on cierres_periodo
  for each row execute function trg_fn_auditoria_generica();


-- ############################################################################
-- 0005_rpc_publico.sql
-- ############################################################################

-- ============================================================================
-- 0005_rpc_publico.sql
-- RPCs accesibles por el rol `anon` (sin autenticación). Son la ÚNICA puerta
-- abierta del sistema para el rol empleado. Ambas son SECURITY DEFINER porque
-- `anon` no tiene acceso directo de lectura/escritura a las tablas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- listar_empleados_publicos()
-- Lectura mínima para el selector de la página pública: solo empleados
-- activos, con un identificador corto (4 dígitos, ampliado automáticamente
-- si hay colisión entre activos) y su nombre público según preferencias.
-- ---------------------------------------------------------------------------
create or replace function listar_empleados_publicos()
returns table (
  id uuid,
  id_publico text,
  nombre_publico text,
  area_nombre text
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      e.id,
      e.numero_empleado,
      nombre_publico(e) as nombre_publico,
      a.nombre as area_nombre,
      left(e.numero_empleado, 4) as pref4
    from empleados e
    join areas a on a.id = e.area_id
    where e.estado = 'activo'
  ),
  conteo as (
    select pref4, count(*) as n
    from base
    group by pref4
  )
  select
    b.id,
    case when c.n > 1 then left(b.numero_empleado, 5) else b.pref4 end as id_publico,
    b.nombre_publico,
    b.area_nombre
  from base b
  join conteo c using (pref4)
  order by b.nombre_publico;
$$;

revoke all on function listar_empleados_publicos() from public;
grant execute on function listar_empleados_publicos() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- marcar_pago_empleado(empleado_id)
-- Único punto de escritura anónima del sistema. Operación atómica: solo
-- actualiza si el pago del día operativo sigue en estado 'pendiente'. Esto
-- evita condiciones de carrera (doble clic, doble marcado).
-- No requiere PIN ni contraseña: el segundo filtro humano (validación del
-- admin) es lo que sostiene la fiabilidad del dato, no la identidad de quien
-- marcó (riesgo aceptado, ver sección 2 de la especificación).
-- ---------------------------------------------------------------------------
create or replace function marcar_pago_empleado(p_empleado_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fecha date := fecha_operativa_cdmx();
  v_empleado empleados;
  v_pago pagos_cuota;
begin
  select * into v_empleado from empleados where id = p_empleado_id;

  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if v_empleado.estado <> 'activo' then
    raise exception 'Este registro de empleado no está activo.' using errcode = 'P0001';
  end if;

  if not ventana_empleado_abierta() then
    raise exception 'El horario para marcar tu pago cerró a las 11:30 p.m. Acude con tu administrador.' using errcode = 'P0001';
  end if;

  select * into v_pago
    from pagos_cuota
   where empleado_id = p_empleado_id
     and fecha = v_fecha;

  if v_pago.id is not null and v_pago.estado in ('marcado_pendiente_validacion', 'validado') then
    raise exception 'Ya se marcó tu pago de hoy.' using errcode = 'P0001';
  end if;

  if v_pago.id is null then
    insert into pagos_cuota (empleado_id, area_id, fecha, monto_esperado, origen, estado)
    values (
      p_empleado_id,
      v_empleado.area_id,
      v_fecha,
      cuota_vigente(v_empleado.area_id, v_fecha),
      'flujo_normal',
      'pendiente'
    )
    returning * into v_pago;
  elsif v_pago.estado = 'cancelado' then
    update pagos_cuota
       set monto_esperado = cuota_vigente(v_empleado.area_id, v_fecha),
           origen = 'flujo_normal',
           estado = 'pendiente',
           marcado_por_empleado = false,
           marcado_empleado_en = null,
           validado = false,
           validado_por = null,
           validado_en = null
     where id = v_pago.id
    returning * into v_pago;
  end if;

  update pagos_cuota
     set marcado_por_empleado = true,
         marcado_empleado_en = now(),
         estado = 'marcado_pendiente_validacion'
   where id = v_pago.id
     and estado = 'pendiente'
  returning * into v_pago;

  if v_pago.id is null then
    raise exception 'No se pudo registrar tu pago de hoy. Intenta de nuevo o consulta con tu administrador.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'exito', true,
    'mensaje', 'Tu pago quedó marcado como reportado. Un administrador lo validará en breve.',
    'pago_id', v_pago.id
  );
end;
$$;

revoke all on function marcar_pago_empleado(uuid) from public;
grant execute on function marcar_pago_empleado(uuid) to anon;

-- ---------------------------------------------------------------------------
-- balance_publico_hoy()
-- Decisión de diseño (ver README): en la página pública SOLO se muestra el
-- balance AGREGADO del día operativo actual por área (sin desglose por
-- empleado, sin nombres). No requiere autenticación porque no expone datos
-- sensibles individuales, y le da transparencia al equipo sobre cómo va el
-- corte del día.
-- ---------------------------------------------------------------------------
create or replace function balance_publico_hoy()
returns table (
  area_nombre text,
  esperado numeric,
  recaudado numeric,
  en_revision numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.nombre,
    coalesce(sum(pc.monto_esperado) filter (where pc.estado <> 'cancelado'), 0),
    coalesce(sum(pc.monto_esperado) filter (where pc.estado = 'validado'), 0),
    coalesce(sum(pc.monto_esperado) filter (where pc.estado = 'marcado_pendiente_validacion'), 0)
  from areas a
  left join pagos_cuota pc on pc.area_id = a.id and pc.fecha = fecha_operativa_cdmx()
  where a.activo = true
  group by a.id, a.nombre
  order by a.nombre;
$$;

revoke all on function balance_publico_hoy() from public;
-- Sin GRANT a anon/authenticated: el balance solo se consulta en el panel admin (pagos_cuota + RLS).


-- ############################################################################
-- 0006_rpc_admin.sql
-- ############################################################################

-- ============================================================================
-- 0006_rpc_admin.sql
-- RPCs para roles autenticados (admin_area, administrador_general). Cada
-- función valida permisos internamente (defensa en profundidad, además de
-- RLS) porque son SECURITY DEFINER y por lo tanto se saltan RLS al ejecutar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- notificar_pago_fuera_horario(pago_id, mensaje)
-- Helper interno (sección 4.3): cuando un admin_area registra/valida un pago
-- después de las 23:30 CDMX, se notifica SOLO a administrador_general (nunca
-- al empleado ni a otros admin_area). administrador_general no dispara esta
-- notificación porque puede operar sin restricción horaria.
-- ---------------------------------------------------------------------------
create or replace function notificar_pago_fuera_horario(p_pago_id uuid, p_mensaje text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
begin
  if es_admin_area() and not ventana_empleado_abierta() then
    for v_admin_id in select id from perfiles where rol = 'administrador_general' and activo = true loop
      insert into notificaciones (destinatario_id, tipo, titulo, mensaje, entidad, entidad_id)
      values (v_admin_id, 'pago_fuera_horario', 'Pago registrado fuera de horario', p_mensaje, 'pagos_cuota', p_pago_id);
    end loop;
  end if;
end;
$$;

revoke all on function notificar_pago_fuera_horario(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- validar_pago(pago_id)
-- Confirma un pago (pendiente o en revisión) como recaudado. Es el único
-- punto donde estado pasa a 'validado' vía flujo normal.
-- ---------------------------------------------------------------------------
create or replace function validar_pago(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_cuota;
begin
  select * into v_pago from pagos_cuota where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_pago.area_id) then
    raise exception 'No tienes permiso para validar pagos de esta área.' using errcode = 'P0001';
  end if;

  if v_pago.estado not in ('pendiente', 'marcado_pendiente_validacion') then
    raise exception 'Este pago no está en un estado que se pueda validar.' using errcode = 'P0001';
  end if;

  update pagos_cuota
     set validado = true,
         validado_por = auth.uid(),
         validado_en = now(),
         estado = 'validado'
   where id = p_pago_id;

  perform notificar_pago_fuera_horario(p_pago_id, 'Se validó un pago fuera del horario habitual (después de las 11:30 p.m.).');

  return jsonb_build_object('exito', true, 'mensaje', 'Pago validado correctamente.');
end;
$$;

revoke all on function validar_pago(uuid) from public;
grant execute on function validar_pago(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- rechazar_pago(pago_id, motivo)
-- El admin no confirma lo que el empleado reportó. Vuelve a 'pendiente' para
-- que se revise con la persona hasta que realmente pague.
-- ---------------------------------------------------------------------------
create or replace function rechazar_pago(p_pago_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_cuota;
begin
  select * into v_pago from pagos_cuota where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_pago.area_id) then
    raise exception 'No tienes permiso sobre pagos de esta área.' using errcode = 'P0001';
  end if;

  if v_pago.estado <> 'marcado_pendiente_validacion' then
    raise exception 'Solo se pueden rechazar pagos que estén en revisión.' using errcode = 'P0001';
  end if;

  update pagos_cuota
     set estado = 'pendiente',
         marcado_por_empleado = false,
         marcado_empleado_en = null,
         notas = coalesce(p_motivo, notas)
   where id = p_pago_id;

  return jsonb_build_object('exito', true, 'mensaje', 'Pago regresado a pendiente.');
end;
$$;

revoke all on function rechazar_pago(uuid, text) from public;
grant execute on function rechazar_pago(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_pago_manual(empleado_id, fecha, notas)
-- Cobro directo del admin sin pasar por el marcado del empleado. NO crea
-- asistencia_diaria (son independientes por diseño). Solo aplica cuando no
-- existe todavía una obligación para ese día, o si esta fue cancelada.
-- ---------------------------------------------------------------------------
create or replace function registrar_pago_manual(p_empleado_id uuid, p_fecha date, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
  v_existente pagos_cuota;
  v_pago pagos_cuota;
begin
  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_empleado.area_id) then
    raise exception 'No tienes permiso sobre empleados de esta área.' using errcode = 'P0001';
  end if;

  select * into v_existente from pagos_cuota where empleado_id = p_empleado_id and fecha = p_fecha;

  if v_existente.id is not null and v_existente.estado <> 'cancelado' then
    raise exception 'Ya existe un registro de pago para ese día (estado: %). Usa validar o revertir en vez de registrar uno manual.', v_existente.estado using errcode = 'P0001';
  end if;

  if v_existente.id is not null then
    update pagos_cuota
       set monto_esperado = cuota_vigente(v_empleado.area_id, p_fecha),
           marcado_por_empleado = false,
           marcado_empleado_en = null,
           validado = true,
           validado_por = auth.uid(),
           validado_en = now(),
           origen = 'manual_admin',
           estado = 'validado',
           notas = p_notas
     where id = v_existente.id
    returning * into v_pago;
  else
    insert into pagos_cuota (
      empleado_id, area_id, fecha, monto_esperado,
      validado, validado_por, validado_en, origen, estado, notas
    ) values (
      p_empleado_id, v_empleado.area_id, p_fecha, cuota_vigente(v_empleado.area_id, p_fecha),
      true, auth.uid(), now(), 'manual_admin', 'validado', p_notas
    )
    returning * into v_pago;
  end if;

  perform notificar_pago_fuera_horario(v_pago.id, 'Se registró un pago manual fuera del horario habitual (después de las 11:30 p.m.).');

  return jsonb_build_object('exito', true, 'mensaje', 'Pago manual registrado y validado.', 'pago_id', v_pago.id);
end;
$$;

revoke all on function registrar_pago_manual(uuid, date, text) from public;
grant execute on function registrar_pago_manual(uuid, date, text) to authenticated;

-- ---------------------------------------------------------------------------
-- revertir_validacion(pago_id, motivo)
-- Deshace una validación (nunca se borra un pago validado). Motivo
-- obligatorio; queda registrado también vía el trigger genérico de
-- auditoría sobre pagos_cuota.
-- ---------------------------------------------------------------------------
create or replace function revertir_validacion(p_pago_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_cuota;
begin
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'Debes indicar un motivo para revertir la validación.' using errcode = 'P0001';
  end if;

  select * into v_pago from pagos_cuota where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_pago.area_id) then
    raise exception 'No tienes permiso sobre pagos de esta área.' using errcode = 'P0001';
  end if;

  if v_pago.estado <> 'validado' then
    raise exception 'Solo se pueden revertir pagos que estén validados.' using errcode = 'P0001';
  end if;

  update pagos_cuota
     set validado = false,
         validado_por = null,
         validado_en = null,
         marcado_por_empleado = false,
         marcado_empleado_en = null,
         estado = 'pendiente',
         motivo_reversion = p_motivo
   where id = p_pago_id;

  return jsonb_build_object('exito', true, 'mensaje', 'Validación revertida. El pago volvió a estado pendiente.');
end;
$$;

revoke all on function revertir_validacion(uuid, text) from public;
grant execute on function revertir_validacion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- eliminar_pago(pago_id)  [admin_area, administrador_general]
-- Borra un registro de pago (pruebas o corrección de error humano).
-- Deja rastro en logs_auditoria antes del DELETE.
-- ---------------------------------------------------------------------------
create or replace function eliminar_pago(p_pago_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago pagos_cuota;
begin
  if es_supervision() then
    raise exception 'No tienes permiso para eliminar pagos.' using errcode = 'P0001';
  end if;

  select * into v_pago from pagos_cuota where id = p_pago_id;
  if v_pago.id is null then
    raise exception 'Pago no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_pago.area_id) then
    raise exception 'No tienes permiso sobre pagos de esta área.' using errcode = 'P0001';
  end if;

  insert into logs_auditoria (usuario_id, accion, entidad, entidad_id, detalle)
  values (
    auth.uid(),
    'pagos_cuota_eliminado',
    'pagos_cuota',
    p_pago_id,
    jsonb_build_object('eliminado', to_jsonb(v_pago))
  );

  delete from pagos_cuota where id = p_pago_id;

  return jsonb_build_object('exito', true, 'mensaje', 'Pago eliminado.');
end;
$$;

revoke all on function eliminar_pago(uuid) from public;
grant execute on function eliminar_pago(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- soft_delete_asistencia(asistencia_id, motivo)
-- Elimina lógicamente una asistencia. Si el pago vinculado ya estaba
-- validado, el motivo es obligatorio y se deja un rastro explícito en
-- logs_auditoria equivalente a una reversión formal.
-- ---------------------------------------------------------------------------
create or replace function soft_delete_asistencia(p_asistencia_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asistencia asistencia_diaria;
  v_pago pagos_cuota;
  v_estado_anterior estado_pago;
begin
  select * into v_asistencia from asistencia_diaria where id = p_asistencia_id;
  if v_asistencia.id is null then
    raise exception 'Registro de asistencia no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_asistencia.area_id) then
    raise exception 'No tienes permiso sobre asistencia de esta área.' using errcode = 'P0001';
  end if;

  if v_asistencia.eliminado then
    raise exception 'Esta asistencia ya estaba eliminada.' using errcode = 'P0001';
  end if;

  select * into v_pago from pagos_cuota
   where empleado_id = v_asistencia.empleado_id and fecha = v_asistencia.fecha;

  v_estado_anterior := v_pago.estado;

  if v_estado_anterior = 'validado' and (p_motivo is null or length(trim(p_motivo)) = 0) then
    raise exception 'Debes indicar un motivo: este pago ya estaba validado (dinero recaudado).' using errcode = 'P0001';
  end if;

  update asistencia_diaria
     set eliminado = true,
         eliminado_en = now(),
         eliminado_por = auth.uid(),
         motivo_eliminacion = p_motivo
   where id = p_asistencia_id;

  if v_pago.id is not null and v_pago.estado <> 'cancelado' then
    update pagos_cuota set estado = 'cancelado' where id = v_pago.id;
  end if;

  if v_estado_anterior = 'validado' then
    insert into logs_auditoria (usuario_id, accion, entidad, entidad_id, detalle)
    values (
      auth.uid(),
      'reversion_por_eliminacion_asistencia',
      'pagos_cuota',
      v_pago.id,
      jsonb_build_object(
        'estado_anterior', 'validado',
        'estado_nuevo', 'cancelado',
        'motivo', p_motivo,
        'via', 'soft_delete_asistencia',
        'asistencia_id', p_asistencia_id
      )
    );
  end if;

  return jsonb_build_object('exito', true, 'mensaje', 'Se ha eliminado la asistencia.');
end;
$$;

revoke all on function soft_delete_asistencia(uuid, text) from public;
grant execute on function soft_delete_asistencia(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- revertir_eliminacion_asistencia(asistencia_id)
-- Botón "Revertir" del toast de 5 segundos. El pago vinculado (si fue
-- cancelado por la eliminación) regresa a 'pendiente', NUNCA directo a
-- 'validado': re-acreditar dinero automáticamente saltaría el filtro humano.
-- ---------------------------------------------------------------------------
create or replace function revertir_eliminacion_asistencia(p_asistencia_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asistencia asistencia_diaria;
  v_pago pagos_cuota;
begin
  select * into v_asistencia from asistencia_diaria where id = p_asistencia_id;
  if v_asistencia.id is null then
    raise exception 'Registro de asistencia no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_asistencia.area_id) then
    raise exception 'No tienes permiso sobre asistencia de esta área.' using errcode = 'P0001';
  end if;

  if not v_asistencia.eliminado then
    raise exception 'Esta asistencia no está eliminada.' using errcode = 'P0001';
  end if;

  update asistencia_diaria
     set eliminado = false,
         eliminado_en = null,
         eliminado_por = null,
         motivo_eliminacion = null
   where id = p_asistencia_id;

  select * into v_pago from pagos_cuota
   where empleado_id = v_asistencia.empleado_id and fecha = v_asistencia.fecha;

  if v_pago.id is not null and v_pago.estado = 'cancelado' then
    update pagos_cuota
       set estado = 'pendiente',
           validado = false,
           validado_por = null,
           validado_en = null,
           marcado_por_empleado = false,
           marcado_empleado_en = null
     where id = v_pago.id;
  end if;

  return jsonb_build_object('exito', true, 'mensaje', 'Se revirtió la eliminación de la asistencia.');
end;
$$;

revoke all on function revertir_eliminacion_asistencia(uuid) from public;
grant execute on function revertir_eliminacion_asistencia(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_asistencia(empleado_id, fecha)
-- Alta de asistencia (hoy o retroactiva hasta 7 días). El trigger de la
-- migración 0004 crea automáticamente la obligación de pago.
-- ---------------------------------------------------------------------------
create or replace function registrar_asistencia(p_empleado_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
  v_hoy date := fecha_operativa_cdmx();
  v_existente asistencia_diaria;
begin
  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_empleado.area_id) then
    raise exception 'No tienes permiso sobre empleados de esta área.' using errcode = 'P0001';
  end if;

  if p_fecha > v_hoy then
    raise exception 'No se puede registrar asistencia en una fecha futura.' using errcode = 'P0001';
  end if;

  if p_fecha < v_hoy - interval '7 days' then
    raise exception 'Solo se puede registrar asistencia retroactiva hasta 7 días atrás.' using errcode = 'P0001';
  end if;

  select * into v_existente from asistencia_diaria where empleado_id = p_empleado_id and fecha = p_fecha;

  if v_existente.id is not null and not v_existente.eliminado then
    raise exception 'Ya existe asistencia registrada para ese día.' using errcode = 'P0001';
  end if;

  if v_existente.id is not null and v_existente.eliminado then
    return revertir_eliminacion_asistencia(v_existente.id);
  end if;

  insert into asistencia_diaria (empleado_id, area_id, fecha, registrado_por)
  values (p_empleado_id, v_empleado.area_id, p_fecha, auth.uid());

  return jsonb_build_object('exito', true, 'mensaje', 'Asistencia registrada.');
end;
$$;

revoke all on function registrar_asistencia(uuid, date) from public;
grant execute on function registrar_asistencia(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_asistencia_desde_horario(fecha, empleado_ids[])
-- Alta en lote a partir del roster planeado en horario_diario.
-- ---------------------------------------------------------------------------
create or replace function registrar_asistencia_desde_horario(p_fecha date, p_empleado_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_exitos int := 0;
  v_errores jsonb := '[]'::jsonb;
begin
  foreach v_id in array p_empleado_ids loop
    begin
      perform registrar_asistencia(v_id, p_fecha);
      v_exitos := v_exitos + 1;
    exception when others then
      v_errores := v_errores || jsonb_build_object('empleado_id', v_id, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('exito', true, 'registrados', v_exitos, 'errores', v_errores);
end;
$$;

revoke all on function registrar_asistencia_desde_horario(date, uuid[]) from public;
grant execute on function registrar_asistencia_desde_horario(date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- registrar_horario(empleado_id, fecha)  /  quitar_horario(empleado_id, fecha)
-- Módulo de planeación previa (roster del día).
-- ---------------------------------------------------------------------------
create or replace function registrar_horario(p_empleado_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
begin
  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_empleado.area_id) then
    raise exception 'No tienes permiso sobre empleados de esta área.' using errcode = 'P0001';
  end if;

  insert into horario_diario (empleado_id, area_id, fecha, registrado_por)
  values (p_empleado_id, v_empleado.area_id, p_fecha, auth.uid())
  on conflict (empleado_id, fecha) do nothing;

  return jsonb_build_object('exito', true, 'mensaje', 'Empleado agregado al horario.');
end;
$$;

revoke all on function registrar_horario(uuid, date) from public;
grant execute on function registrar_horario(uuid, date) to authenticated;

create or replace function quitar_horario(p_empleado_id uuid, p_fecha date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
begin
  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not tengo_acceso_area(v_empleado.area_id) then
    raise exception 'No tienes permiso sobre empleados de esta área.' using errcode = 'P0001';
  end if;

  delete from horario_diario where empleado_id = p_empleado_id and fecha = p_fecha;

  return jsonb_build_object('exito', true, 'mensaje', 'Empleado quitado del horario.');
end;
$$;

revoke all on function quitar_horario(uuid, date) from public;
grant execute on function quitar_horario(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- solicitar_cambio_area(empleado_id, area_nueva_id)  [admin_area]
-- Solicita traer un empleado de OTRA área hacia el área del administrador.
-- resolver_solicitud_cambio_area(solicitud_id, aprobar, motivo)  [administrador_general]
-- listar_empleados_otras_areas()  [admin_area]
-- buscar_empleado_por_numero(numero)  [admin_area, administrador_general]
-- ---------------------------------------------------------------------------
create or replace function solicitar_cambio_area(p_empleado_id uuid, p_area_nueva_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
  v_solicitud_id uuid;
  v_admin_id uuid;
  v_area_origen text;
  v_area_destino text;
begin
  if not es_admin_area() then
    raise exception 'Solo un administrador de área puede solicitar un cambio de área.' using errcode = 'P0001';
  end if;

  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if p_area_nueva_id <> mi_area_id() then
    raise exception 'Solo puedes solicitar que un empleado se incorpore a tu área.' using errcode = 'P0001';
  end if;

  if v_empleado.area_id = mi_area_id() then
    raise exception 'Este empleado ya pertenece a tu área.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from solicitudes_cambio_area
    where empleado_id = p_empleado_id and estado = 'pendiente'
  ) then
    raise exception 'Ya existe una solicitud pendiente para este empleado.' using errcode = 'P0001';
  end if;

  select nombre into v_area_origen from areas where id = v_empleado.area_id;
  select nombre into v_area_destino from areas where id = p_area_nueva_id;

  insert into solicitudes_cambio_area (empleado_id, area_actual_id, area_solicitada_id, solicitado_por)
  values (p_empleado_id, v_empleado.area_id, p_area_nueva_id, auth.uid())
  returning id into v_solicitud_id;

  for v_admin_id in select id from perfiles where rol = 'administrador_general' and activo = true loop
    insert into notificaciones (destinatario_id, tipo, titulo, mensaje, entidad, entidad_id)
    values (
      v_admin_id,
      'solicitud_cambio_area',
      'Solicitud de incorporación de empleado',
      'Se solicitó incorporar a ' || nombre_publico(v_empleado) || ' de ' || v_area_origen || ' hacia ' || v_area_destino || '.',
      'solicitudes_cambio_area',
      v_solicitud_id
    );
  end loop;

  return jsonb_build_object('exito', true, 'mensaje', 'Solicitud enviada al administrador.', 'solicitud_id', v_solicitud_id);
end;
$$;

revoke all on function solicitar_cambio_area(uuid, uuid) from public;
grant execute on function solicitar_cambio_area(uuid, uuid) to authenticated;

create or replace function listar_empleados_otras_areas()
returns table (
  id uuid,
  numero_empleado varchar,
  primer_nombre text,
  segundo_nombre text,
  primer_apellido text,
  segundo_apellido text,
  pref_nombre_publico preferencia_nombre,
  pref_apellido_publico preferencia_nombre,
  area_id uuid,
  area_nombre text,
  estado estado_empleado
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.numero_empleado,
    e.primer_nombre,
    e.segundo_nombre,
    e.primer_apellido,
    e.segundo_apellido,
    e.pref_nombre_publico,
    e.pref_apellido_publico,
    e.area_id,
    a.nombre,
    e.estado
  from empleados e
  join areas a on a.id = e.area_id
  where es_admin_area()
    and e.area_id <> mi_area_id()
    and e.estado = 'activo'
  order by e.primer_nombre, e.primer_apellido;
$$;

revoke all on function listar_empleados_otras_areas() from public;
grant execute on function listar_empleados_otras_areas() to authenticated;

create or replace function buscar_empleado_por_numero(p_numero text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
  v_area_nombre text;
begin
  if not (es_admin_area() or es_admin_general()) then
    raise exception 'No autorizado.' using errcode = 'P0001';
  end if;

  if p_numero !~ '^[0-9]{6}$' then
    raise exception 'El número de empleado debe tener exactamente 6 dígitos.' using errcode = 'P0001';
  end if;

  select e.* into v_empleado
    from empleados e
   where e.numero_empleado = p_numero;

  if v_empleado.id is null then
    return jsonb_build_object('existe', false);
  end if;

  select nombre into v_area_nombre from areas where id = v_empleado.area_id;

  return jsonb_build_object(
    'existe', true,
    'id', v_empleado.id,
    'numero_empleado', v_empleado.numero_empleado,
    'primer_nombre', v_empleado.primer_nombre,
    'segundo_nombre', v_empleado.segundo_nombre,
    'primer_apellido', v_empleado.primer_apellido,
    'segundo_apellido', v_empleado.segundo_apellido,
    'area_id', v_empleado.area_id,
    'area_nombre', v_area_nombre,
    'estado', v_empleado.estado,
    'en_mi_area', case when es_admin_area() then v_empleado.area_id = mi_area_id() else false end
  );
end;
$$;

revoke all on function buscar_empleado_por_numero(text) from public;
grant execute on function buscar_empleado_por_numero(text) to authenticated;

create or replace function resolver_solicitud_cambio_area(p_solicitud_id uuid, p_aprobar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitud solicitudes_cambio_area;
begin
  if not es_admin_general() then
    raise exception 'Solo el administrador general puede resolver solicitudes de cambio de área.' using errcode = 'P0001';
  end if;

  select * into v_solicitud from solicitudes_cambio_area where id = p_solicitud_id;
  if v_solicitud.id is null then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0001';
  end if;

  if v_solicitud.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya fue resuelta.' using errcode = 'P0001';
  end if;

  if p_aprobar then
    update empleados set area_id = v_solicitud.area_solicitada_id, actualizado_por = auth.uid()
     where id = v_solicitud.empleado_id;

    insert into historial_area_empleado (empleado_id, area_anterior_id, area_nueva_id, realizado_por)
    values (v_solicitud.empleado_id, v_solicitud.area_actual_id, v_solicitud.area_solicitada_id, auth.uid());

    update solicitudes_cambio_area
       set estado = 'aprobada', resuelto_por = auth.uid(), resuelto_en = now(), motivo = p_motivo
     where id = p_solicitud_id;
  else
    update solicitudes_cambio_area
       set estado = 'rechazada', resuelto_por = auth.uid(), resuelto_en = now(), motivo = p_motivo
     where id = p_solicitud_id;
  end if;

  return jsonb_build_object('exito', true, 'mensaje', case when p_aprobar then 'Cambio de área aprobado.' else 'Solicitud rechazada.' end);
end;
$$;

revoke all on function resolver_solicitud_cambio_area(uuid, boolean, text) from public;
grant execute on function resolver_solicitud_cambio_area(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mover_empleado_area(empleado_id, area_nueva_id)  [administrador_general]
-- Movimiento directo, sin pasar por solicitud.
-- ---------------------------------------------------------------------------
create or replace function mover_empleado_area(p_empleado_id uuid, p_area_nueva_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empleado empleados;
begin
  if not es_admin_general() then
    raise exception 'Solo el administrador general puede mover empleados de área directamente.' using errcode = 'P0001';
  end if;

  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if v_empleado.area_id = p_area_nueva_id then
    raise exception 'El empleado ya pertenece a esa área.' using errcode = 'P0001';
  end if;

  update empleados set area_id = p_area_nueva_id, actualizado_por = auth.uid() where id = p_empleado_id;

  insert into historial_area_empleado (empleado_id, area_anterior_id, area_nueva_id, realizado_por)
  values (p_empleado_id, v_empleado.area_id, p_area_nueva_id, auth.uid());

  return jsonb_build_object('exito', true, 'mensaje', 'Empleado movido de área.');
end;
$$;

revoke all on function mover_empleado_area(uuid, uuid) from public;
grant execute on function mover_empleado_area(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cambiar_cuota(area_id, monto, vigente_desde)  [administrador_general]
-- ---------------------------------------------------------------------------
create or replace function cambiar_cuota(p_area_id uuid, p_monto numeric, p_vigente_desde date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not es_admin_general() then
    raise exception 'Solo el administrador general puede cambiar la cuota.' using errcode = 'P0001';
  end if;

  if p_monto < 0 then
    raise exception 'El monto de la cuota no puede ser negativo.' using errcode = 'P0001';
  end if;

  update historial_cuotas
     set vigente_hasta = p_vigente_desde - 1
   where area_id = p_area_id and vigente_hasta is null;

  insert into historial_cuotas (area_id, monto, vigente_desde, vigente_hasta, registrado_por)
  values (p_area_id, p_monto, p_vigente_desde, null, auth.uid());

  update areas set cuota_fija = p_monto where id = p_area_id;

  return jsonb_build_object('exito', true, 'mensaje', 'Cuota actualizada. Aplica a partir de ' || p_vigente_desde);
end;
$$;

revoke all on function cambiar_cuota(uuid, numeric, date) from public;
grant execute on function cambiar_cuota(uuid, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- cerrar_periodo(desde, hasta)  [administrador_general]
-- Snapshot contable por área. Guarda el desglose por empleado en `detalle`
-- para que el CSV se pueda regenerar idéntico más adelante, sin importar
-- cambios posteriores en pagos_cuota (el cierre no bloquea operación).
-- ---------------------------------------------------------------------------
create or replace function cerrar_periodo(p_desde date, p_hasta date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area record;
  v_esperado numeric(12,2);
  v_validado numeric(12,2);
  v_detalle jsonb;
  v_resultado jsonb := '[]'::jsonb;
  v_cierre_id uuid;
begin
  if not es_admin_general() then
    raise exception 'Solo el administrador general puede cerrar un periodo.' using errcode = 'P0001';
  end if;

  if p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.' using errcode = 'P0001';
  end if;

  for v_area in select id, nombre from areas loop
    select coalesce(sum(pc.monto_esperado) filter (where pc.estado <> 'cancelado'), 0),
           coalesce(sum(pc.monto_esperado) filter (where pc.estado = 'validado'), 0)
      into v_esperado, v_validado
      from pagos_cuota pc
     where pc.area_id = v_area.id and pc.fecha between p_desde and p_hasta;

    select coalesce(jsonb_agg(jsonb_build_object(
             'fecha', pc.fecha,
             'area', v_area.nombre,
             'numero_empleado', e.numero_empleado,
             'id_publico', id_publico(e.numero_empleado),
             'nombre_publico', nombre_publico(e),
             'monto_esperado', pc.monto_esperado,
             'estado', pc.estado,
             'marcado_por_empleado', pc.marcado_por_empleado,
             'marcado_empleado_en', pc.marcado_empleado_en,
             'validado_por', pc.validado_por,
             'validado_en', pc.validado_en,
             'origen', pc.origen,
             'notas', pc.notas,
             'motivo_reversion', pc.motivo_reversion
           ) order by pc.fecha, e.numero_empleado), '[]'::jsonb)
      into v_detalle
      from pagos_cuota pc
      join empleados e on e.id = pc.empleado_id
     where pc.area_id = v_area.id and pc.fecha between p_desde and p_hasta;

    insert into cierres_periodo (
      area_id, desde, hasta, cerrado_por, monto_esperado_total, monto_validado_total, detalle
    ) values (
      v_area.id, p_desde, p_hasta, auth.uid(), v_esperado, v_validado, v_detalle
    )
    returning id into v_cierre_id;

    v_resultado := v_resultado || jsonb_build_object(
      'cierre_id', v_cierre_id,
      'area_id', v_area.id,
      'area_nombre', v_area.nombre,
      'esperado', v_esperado,
      'validado', v_validado,
      'diferencia', v_esperado - v_validado
    );
  end loop;

  return jsonb_build_object('exito', true, 'mensaje', 'Periodo cerrado correctamente.', 'cierres', v_resultado);
exception
  when exclusion_violation then
    raise exception 'Ya existe un cierre que se traslapa con este rango de fechas para alguna de las áreas.' using errcode = 'P0001';
end;
$$;

revoke all on function cerrar_periodo(date, date) from public;
grant execute on function cerrar_periodo(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- revisar_pagos_estancados()
-- Función interna invocada por pg_cron (sin GRANT a roles de usuario).
-- Notifica pagos en revisión por más de 2 días sin resolverse.
-- ---------------------------------------------------------------------------
create or replace function revisar_pagos_estancados()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pago record;
  v_destinatario uuid;
begin
  for v_pago in
    select pc.id, pc.area_id, e.numero_empleado, nombre_publico(e) as nombre
    from pagos_cuota pc
    join empleados e on e.id = pc.empleado_id
    where pc.estado = 'marcado_pendiente_validacion'
      and pc.marcado_empleado_en < now() - interval '2 days'
  loop
    for v_destinatario in
      select id from perfiles
      where activo = true
        and (
          (rol = 'admin_area' and area_id = v_pago.area_id)
          or rol = 'administrador_general'
          or rol = 'supervision'
        )
    loop
      insert into notificaciones (destinatario_id, tipo, titulo, mensaje, entidad, entidad_id)
      values (
        v_destinatario,
        'pago_en_revision_estancado',
        'Pago estancado en revisión',
        'El pago de ' || v_pago.nombre || ' lleva más de 2 días en revisión sin resolverse.',
        'pagos_cuota',
        v_pago.id
      )
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

revoke all on function revisar_pagos_estancados() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- marcar_notificacion_leida(notificacion_id)
-- ---------------------------------------------------------------------------
create or replace function marcar_notificacion_leida(p_notificacion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update notificaciones set leida = true
   where id = p_notificacion_id and destinatario_id = auth.uid();

  return jsonb_build_object('exito', true);
end;
$$;

revoke all on function marcar_notificacion_leida(uuid) from public;
grant execute on function marcar_notificacion_leida(uuid) to authenticated;


-- ############################################################################
-- 0007_rls.sql
-- ############################################################################

-- ============================================================================
-- 0007_rls.sql
-- Row Level Security: la fuente real de permisos del sistema (sección 9).
-- La UI solo oculta botones por comodidad; esto es lo que de verdad protege
-- los datos, porque el frontend habla directo con Supabase vía anon key.
--
-- Principio de diseño usado en este archivo:
--  - Las tablas cuya escritura SIEMPRE pasa por una función RPC
--    (SECURITY DEFINER, ver 0005/0006) NO reciben políticas de INSERT/UPDATE
--    para usuarios normales: la función se salta RLS y hace sus propias
--    validaciones, así que dejar la tabla sin política de escritura directa
--    obliga a pasar por la función (defensa en profundidad).
--  - Las tablas con escritura directa desde el frontend (empleados,
--    notificaciones) sí reciben políticas de INSERT/UPDATE acotadas.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Trigger de defensa adicional: admin_area NUNCA puede cambiar el area_id de
-- un empleado directamente (ni por RLS ni por RPC), solo administrador_general
-- (vía mover_empleado_area o al resolver una solicitud aprobada).
-- ---------------------------------------------------------------------------
create or replace function trg_fn_bloquear_cambio_area_admin_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.area_id is distinct from old.area_id and not es_admin_general() then
    raise exception 'Solo el administrador general puede cambiar el área de un empleado.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_empleados_bloquear_cambio_area on empleados;
create trigger trg_empleados_bloquear_cambio_area
  before update on empleados
  for each row execute function trg_fn_bloquear_cambio_area_admin_area();

-- ---------------------------------------------------------------------------
-- Trigger: admin_area solo puede cambiar el estado (activo/inactivo) de
-- empleados de su área; el resto de campos quedan reservados al admin general.
-- ---------------------------------------------------------------------------
create or replace function trg_fn_restringir_edicion_empleado_admin_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if es_admin_area() then
    if new.numero_empleado is distinct from old.numero_empleado
       or new.primer_nombre is distinct from old.primer_nombre
       or new.segundo_nombre is distinct from old.segundo_nombre
       or new.primer_apellido is distinct from old.primer_apellido
       or new.segundo_apellido is distinct from old.segundo_apellido
       or new.pref_nombre_publico is distinct from old.pref_nombre_publico
       or new.pref_apellido_publico is distinct from old.pref_apellido_publico
       or new.area_id is distinct from old.area_id
    then
      raise exception 'Como administrador de área solo puedes cambiar el estado (activo/inactivo) del empleado.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_empleados_restringir_edicion_admin_area on empleados;
create trigger trg_empleados_restringir_edicion_admin_area
  before update on empleados
  for each row execute function trg_fn_restringir_edicion_empleado_admin_area();

-- ============================================================================
-- Base defensiva: revocar TODO privilegio de tabla por defecto para `anon` y
-- `authenticated` antes de conceder explícitamente solo lo necesario abajo.
-- Esto hace que la migración no dependa de qué privilegios por defecto haya
-- configurado Supabase al crear las tablas: el resultado final es siempre el
-- mismo, autocontenido en este archivo.
-- ============================================================================
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY (obligatorio en TODAS las tablas de negocio)
-- ============================================================================
alter table areas enable row level security;
alter table historial_cuotas enable row level security;
alter table perfiles enable row level security;
alter table empleados enable row level security;
alter table historial_area_empleado enable row level security;
alter table horario_diario enable row level security;
alter table asistencia_diaria enable row level security;
alter table pagos_cuota enable row level security;
alter table solicitudes_cambio_area enable row level security;
alter table notificaciones enable row level security;
alter table logs_auditoria enable row level security;
alter table cierres_periodo enable row level security;

-- ============================================================================
-- areas — catálogo pequeño, lectura abierta a autenticados; escritura
-- reservada a administrador_general (cuota_fija se actualiza normalmente vía
-- cambiar_cuota, pero se permite UPDATE directo para nombre/activo).
-- ============================================================================
drop policy if exists areas_select_autenticados on areas;
drop policy if exists areas_update_admin_general on areas;

grant select on areas to authenticated;
grant update on areas to authenticated;

create policy areas_select_autenticados on areas
  for select to authenticated
  using (true);

create policy areas_update_admin_general on areas
  for update to authenticated
  using (es_admin_general())
  with check (es_admin_general());

-- ============================================================================
-- historial_cuotas — solo lectura desde el cliente (INSERT vía cambiar_cuota).
-- ============================================================================
drop policy if exists historial_cuotas_select on historial_cuotas;

grant select on historial_cuotas to authenticated;

create policy historial_cuotas_select on historial_cuotas
  for select to authenticated
  using (es_admin_general() or es_supervision() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- perfiles — cada quien ve su propio perfil; administrador_general ve todos
-- (necesario para el panel de gestión de usuarios). Sin INSERT/UPDATE/DELETE
-- desde el cliente: los perfiles se gestionan por Edge Function (service_role).
-- ============================================================================
drop policy if exists perfiles_select_propio on perfiles;

grant select on perfiles to authenticated;

create policy perfiles_select_propio on perfiles
  for select to authenticated
  using (id = auth.uid() or es_admin_general());

-- ============================================================================
-- empleados — admin_area ve/edita solo su área; administrador_general todo;
-- supervision solo lectura. anon NO tiene acceso directo (usa RPC pública).
-- ============================================================================
drop policy if exists empleados_select on empleados;
drop policy if exists empleados_insert on empleados;
drop policy if exists empleados_update on empleados;

grant select, insert, update on empleados to authenticated;

-- admin_area puede leer empleados de todas las áreas (p. ej. solicitar incorporación);
-- insert/update siguen limitados a su propia área.
create policy empleados_select on empleados
  for select to authenticated
  using (es_admin_general() or es_supervision() or es_admin_area());

create policy empleados_insert on empleados
  for insert to authenticated
  with check (es_admin_general() or (es_admin_area() and area_id = mi_area_id()));

create policy empleados_update on empleados
  for update to authenticated
  using (es_admin_general() or (es_admin_area() and area_id = mi_area_id()))
  with check (es_admin_general() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- historial_area_empleado — solo lectura; admin_area ve movimientos que
-- involucren su área, administrador_general y supervision ven todo.
-- ============================================================================
drop policy if exists historial_area_empleado_select on historial_area_empleado;

grant select on historial_area_empleado to authenticated;

create policy historial_area_empleado_select on historial_area_empleado
  for select to authenticated
  using (
    es_admin_general() or es_supervision()
    or (es_admin_area() and mi_area_id() in (area_anterior_id, area_nueva_id))
  );

-- ============================================================================
-- horario_diario — todas las escrituras van por RPC (registrar_horario,
-- quitar_horario, registrar_asistencia_desde_horario). Solo SELECT directo.
-- ============================================================================
drop policy if exists horario_diario_select on horario_diario;

grant select on horario_diario to authenticated;

create policy horario_diario_select on horario_diario
  for select to authenticated
  using (es_admin_general() or es_supervision() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- asistencia_diaria — todas las escrituras van por RPC. admin_area NUNCA ve
-- filas eliminadas (ni siquiera en solo lectura); administrador_general y
-- supervision sí, para efectos de auditoría.
-- ============================================================================
drop policy if exists asistencia_select_admin_area on asistencia_diaria;
drop policy if exists asistencia_select_general_supervision on asistencia_diaria;

grant select on asistencia_diaria to authenticated;

create policy asistencia_select_admin_area on asistencia_diaria
  for select to authenticated
  using (es_admin_area() and area_id = mi_area_id() and eliminado = false);

create policy asistencia_select_general_supervision on asistencia_diaria
  for select to authenticated
  using (es_admin_general() or es_supervision());

-- ============================================================================
-- pagos_cuota — todas las escrituras van por RPC (marcar_pago_empleado,
-- validar_pago, rechazar_pago, registrar_pago_manual, revertir_validacion).
-- Ningún rol tiene INSERT/UPDATE/DELETE directo, ni siquiera administrador_general.
-- ============================================================================
drop policy if exists pagos_cuota_select on pagos_cuota;

grant select on pagos_cuota to authenticated;

create policy pagos_cuota_select on pagos_cuota
  for select to authenticated
  using (es_admin_general() or es_supervision() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- solicitudes_cambio_area — escritura vía RPC. admin_area ve las que solicitó
-- o las dirigidas a su área; administrador_general y supervision ven todas.
-- ============================================================================
drop policy if exists solicitudes_area_select on solicitudes_cambio_area;

grant select on solicitudes_cambio_area to authenticated;

create policy solicitudes_area_select on solicitudes_cambio_area
  for select to authenticated
  using (
    es_admin_general() or es_supervision()
    or (es_admin_area() and (
      area_solicitada_id = mi_area_id()
      or area_actual_id = mi_area_id()
      or solicitado_por = auth.uid()
    ))
  );

-- ============================================================================
-- notificaciones — cada perfil ve únicamente las suyas. Marcar como leída
-- pasa por la función marcar_notificacion_leida (SECURITY DEFINER).
-- ============================================================================
drop policy if exists notificaciones_select_propias on notificaciones;

grant select on notificaciones to authenticated;

create policy notificaciones_select_propias on notificaciones
  for select to authenticated
  using (destinatario_id = auth.uid());

-- ============================================================================
-- logs_auditoria — admin_area NO tiene acceso (sección 4: "NO logs completos
-- de auditoría de eliminados"). Solo administrador_general y supervision.
-- ============================================================================
drop policy if exists logs_auditoria_select on logs_auditoria;

grant select on logs_auditoria to authenticated;

create policy logs_auditoria_select on logs_auditoria
  for select to authenticated
  using (es_admin_general() or es_supervision());

-- ============================================================================
-- cierres_periodo — insert-only vía RPC cerrar_periodo. Lectura: admin_area
-- (solo su área), administrador_general y supervision (todas). Sin UPDATE ni
-- DELETE para ningún rol (ninguna política = denegado por defecto).
-- ============================================================================
drop policy if exists cierres_periodo_select on cierres_periodo;

grant select on cierres_periodo to authenticated;

create policy cierres_periodo_select on cierres_periodo
  for select to authenticated
  using (es_admin_general() or es_supervision() or (es_admin_area() and area_id = mi_area_id()));

-- ============================================================================
-- Rol anon: SIN acceso directo a ninguna tabla (ya revocado arriba). Su única
-- puerta son las funciones marcar_pago_empleado(), listar_empleados_publicos()
-- y balance_publico_hoy() (0005), que ya tienen su propio GRANT EXECUTE y son
-- SECURITY DEFINER (el GRANT USAGE sobre el esquema ya se hizo arriba).
-- ============================================================================


-- ############################################################################
-- 0009_login_por_usuario.sql (función auxiliar; columna ya en 0002)
-- ############################################################################

create or replace function email_interno_desde_usuario(p_usuario text)
returns text
language sql
immutable
as $$
  select lower(trim(p_usuario)) || '@cuotas.interno';
$$;


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

-- ============================================================================
-- SEED: administrador de prueba (login por usuario, no correo)
--   Usuario:    Orusuko  (o orusuko)
--   Contraseña: 1234
--   Rol:        administrador_general
-- ============================================================================

do $$
declare
  v_user_id   uuid;
  v_email     text := 'orusuko@cuotas.interno';
  v_password  text := '1234';
begin
  select id into v_user_id from auth.users where lower(email) = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, recovery_sent_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token,
      is_sso_user
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id,
      'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nombre_usuario":"orusuko"}'::jsonb,
      now(), now(), '', '', '', '', false
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_email,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'provider', 'email'),
      'email', now(), now(), now()
    );
  else
    update auth.users
       set encrypted_password = crypt(v_password, gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           updated_at = now()
     where id = v_user_id;

    delete from auth.identities where user_id = v_user_id and provider = 'email';

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_email,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'provider', 'email'),
      'email', now(), now(), now()
    );
  end if;

  insert into perfiles (id, nombre_usuario, nombre_completo, rol, area_id, activo)
  values (v_user_id, 'orusuko', 'Orusuko', 'administrador_general', null, true)
  on conflict (id) do update
    set nombre_usuario = excluded.nombre_usuario,
        nombre_completo = excluded.nombre_completo,
        rol = excluded.rol,
        area_id = excluded.area_id,
        activo = excluded.activo;
end $$;

-- ============================================================================
-- FIN — Configura CORS, despliega Edge Functions y arranca el frontend.
-- ============================================================================
