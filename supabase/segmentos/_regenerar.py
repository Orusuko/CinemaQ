import pathlib

src = pathlib.Path(__file__).parent.parent / "esquema_completo.sql"
lines = src.read_text(encoding="utf-8").splitlines()
dir = pathlib.Path(__file__).parent

pg_cron_safe = r"""create schema if not exists public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, service_role;
set search_path to public;

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

do $$ begin
  execute 'create extension if not exists pg_cron';
exception
  when insufficient_privilege then
    raise notice 'pg_cron omitido: sin permisos';
  when undefined_file then
    raise notice 'pg_cron omitido: extension no disponible';
  when others then
    raise notice 'pg_cron omitido: %', sqlerrm;
end $$;"""

part01_lines = [*lines[16:25], pg_cron_safe, "", *lines[29:67]]

prereq02a = r"""
do $$ begin
  if not exists (select 1 from pg_type where typname = 'rol_perfil') then
    raise exception 'Falta rol_perfil. Ejecuta primero 01_extensiones_enums.sql';
  end if;
end $$;
"""

guard03 = r"""
do $$ begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'perfiles'
  ) then
    raise exception 'Falta public.perfiles. Ejecuta CREAR_perfiles.sql (o 02a_areas_perfiles.sql) y confirma perfiles_ok = true.';
  end if;
end $$;
"""

# Cada archivo = una ejecución en SQL Editor = una transacción.
# Si un archivo falla, los anteriores YA quedaron guardados.
segments = [
    ("01_extensiones_enums.sql", part01_lines,
     "select extname from pg_extension where extname in ('pgcrypto','btree_gist','pg_cron') order by extname;\n"
     "select typname from pg_type where typname in ('rol_perfil','estado_empleado') order by typname;"),
    ("02a_areas_perfiles.sql", None,  # contenido fijo en archivo (con limpieza de conflictos)
     "select exists (select 1 from information_schema.tables where table_schema='public' and table_name='perfiles') as perfiles_ok;"),
    ("02b_empleados_asistencia.sql", lines[121:180],
     "select table_name from information_schema.tables where table_schema='public' and table_name in ('empleados','asistencia_diaria') order by table_name;"),
    ("02c_pagos_notificaciones.sql", lines[181:239],
     "select table_name from information_schema.tables where table_schema='public' and table_name in ('pagos_cuota','notificaciones') order by table_name;"),
    ("02d_cierres.sql", lines[240:274],
     "select table_name from information_schema.tables where table_schema='public' and table_name in ('logs_auditoria','cierres_periodo') order by table_name;"),
    ("03_funciones_auxiliares.sql", [guard03.strip(), *lines[276:478]],
     "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('mi_perfil','fecha_operativa_cdmx') order by proname;"),
    ("04_triggers.sql", lines[480:625],
     "select tgname from pg_trigger where not tgisinternal and tgname like 'trg_%' order by tgname limit 5;"),
    ("05_rpc_publico.sql", lines[627:786],
     "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='listar_empleados_publicos';"),
    ("06_rpc_admin.sql", lines[788:1621],
     "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname='validar_pago';"),
    ("07_rls.sql", lines[1623:1876],
     "select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='perfiles';"),
    ("08_email_interno.sql", lines[1878:1889],
     "select email_interno_desde_usuario('Orusuko');"),
    ("09_seed_areas_cron.sql", lines[1891:1941],
     "select nombre,cuota_fija from areas order by nombre;"),
    ("10_seed_orusuko.sql", lines[1942:2013],
     "select p.nombre_usuario,p.rol from perfiles p where lower(p.nombre_usuario)='orusuko';"),
]

order_str = "00 → 01 → 02a → 02b → 02c → 02d → 03 → … → 10"
total = len(segments)

for old in ["02_tablas_core.sql", "02b_tablas_cierres.sql"]:
    p = dir / old
    if p.exists():
        p.unlink()

for i, (fname, body_lines, verify) in enumerate(segments, 1):
    if body_lines is None:
        continue  # 02a_areas_perfiles.sql se edita a mano
    header = f"""-- ============================================================================
-- {fname.replace('.sql','')} ({i}/{total})
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: {order_str}
-- ============================================================================

"""
    content = header + "\n".join(body_lines) + "\n\n-- VERIFICACIÓN\n" + verify + "\n"
    (dir / fname).write_text(content, encoding="utf-8")

print(f"OK {total} archivos")
