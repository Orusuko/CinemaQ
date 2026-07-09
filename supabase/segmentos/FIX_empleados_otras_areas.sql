-- ============================================================================
-- FIX: admin_area debe poder LEER empleados de otras áreas
-- (para la sección "Solicitar empleados de otras áreas" y detectar duplicados)
-- Ejecuta TODO este archivo en el SQL Editor de Supabase (Run).
-- ============================================================================

drop policy if exists empleados_select on empleados;

create policy empleados_select on empleados
  for select to authenticated
  using (es_admin_general() or es_supervision() or es_admin_area());

-- Verificación rápida (debe mostrar empleados de ambas áreas si existen):
-- select e.numero_empleado, e.primer_nombre, a.nombre as area
-- from empleados e join areas a on a.id = e.area_id
-- where e.estado = 'activo'
-- order by a.nombre, e.primer_nombre;
