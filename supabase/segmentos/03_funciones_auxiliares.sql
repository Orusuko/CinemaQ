-- ============================================================================
-- 03_funciones_auxiliares (6/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

do $$ begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'perfiles'
  ) then
    raise exception 'Falta public.perfiles. Ejecuta CREAR_perfiles.sql (o 02a_areas_perfiles.sql) y confirma perfiles_ok = true.';
  end if;
end $$;
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

-- VERIFICACIÓN
select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('mi_perfil','fecha_operativa_cdmx') order by proname;
