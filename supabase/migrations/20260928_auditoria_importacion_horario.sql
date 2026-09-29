-- auditoria_importacion_horario
--
-- Ejecutar DESPUÉS de 20260928_importar_horario_asistencia.sql.
--
-- 1) Amplía importar_horario_asistencia a supervision y admin_area
--    (admin_area solo puede su propia área; sin límite de 7 días).
-- 2) Tablas de auditoría de lotes de importación + RLS de lectura.
-- 3) RPC registrar_lote_importacion: aplica el lote, registra cabecera/detalle
--    y no aborta el lote entero si una fila falla.

-- ---------------------------------------------------------------------------
-- 1. importar_horario_asistencia (roles ampliados)
-- ---------------------------------------------------------------------------
create or replace function public.importar_horario_asistencia(
  p_empleado_id uuid,
  p_fecha date,
  p_area_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol text;
  v_area_perfil uuid;
  v_empleado empleados;
  v_horario horario_diario;
  v_existente asistencia_diaria;
  v_pago pagos_cuota;
  v_creo_horario boolean := false;
  v_asistencia_id uuid;
begin
  select rol::text, area_id into v_rol, v_area_perfil
    from perfiles where id = auth.uid() and activo;

  if v_rol is null
     or v_rol not in ('administrador_general', 'supervision', 'admin_area') then
    raise exception 'No tienes permiso para importar horarios.' using errcode = 'P0001';
  end if;

  if v_rol = 'admin_area' then
    if v_area_perfil is null or v_area_perfil is distinct from p_area_id then
      raise exception 'Solo puedes importar filas del área asignada a tu perfil.'
        using errcode = 'P0001';
    end if;
  end if;

  if p_fecha > fecha_operativa_cdmx() then
    raise exception 'No se puede registrar asistencia en una fecha futura.' using errcode = 'P0001';
  end if;

  select * into v_empleado from empleados where id = p_empleado_id;
  if v_empleado.id is null then
    raise exception 'Empleado no encontrado.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from areas where id = p_area_id) then
    raise exception 'Área no encontrada.' using errcode = 'P0001';
  end if;

  select * into v_existente from asistencia_diaria
   where empleado_id = p_empleado_id and fecha = p_fecha;

  if v_existente.id is not null and not v_existente.eliminado then
    raise exception 'Ya existe asistencia registrada para ese día.' using errcode = 'P0001';
  end if;

  -- Horario: se crea con el área del PDF; si ya existe con otra área no se pisa.
  select * into v_horario from horario_diario
   where empleado_id = p_empleado_id and fecha = p_fecha;

  if v_horario.id is null then
    insert into horario_diario (empleado_id, area_id, fecha, registrado_por)
    values (p_empleado_id, p_area_id, p_fecha, auth.uid());
    v_creo_horario := true;
  elsif v_horario.area_id <> p_area_id then
    raise exception 'Ya existe un horario de ese día con un área distinta a la del PDF.' using errcode = 'P0001';
  end if;

  -- Asistencia previamente eliminada (p. ej. tras "Deshacer"): se reactiva.
  if v_existente.id is not null and v_existente.eliminado then
    perform revertir_eliminacion_asistencia(v_existente.id);
    v_asistencia_id := v_existente.id;
  else
    insert into asistencia_diaria (empleado_id, area_id, fecha, registrado_por)
    values (p_empleado_id, p_area_id, p_fecha, auth.uid())
    returning id into v_asistencia_id;
  end if;

  -- Red de seguridad: el pago debe existir con el área pedida.
  select * into v_pago from pagos_cuota
   where empleado_id = p_empleado_id and fecha = p_fecha
   limit 1;

  if v_pago.id is null then
    raise exception 'No se generó el pago de cuota para ese día (¿hay cuota vigente para el área?).' using errcode = 'P0001';
  end if;

  if v_pago.area_id is distinct from p_area_id then
    raise exception 'El pago de cuota quedó con un área distinta a la solicitada; se cancela la importación de ese día.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'exito', true,
    'mensaje', 'Horario y asistencia registrados.',
    'asistencia_id', v_asistencia_id,
    'creo_horario', v_creo_horario
  );
end;
$function$;

revoke all on function public.importar_horario_asistencia(uuid, date, uuid) from public, anon;
grant execute on function public.importar_horario_asistencia(uuid, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tablas de auditoría
-- ---------------------------------------------------------------------------
create table if not exists public.importaciones_horario (
  id uuid primary key default gen_random_uuid(),
  aplicado_en timestamptz not null default now(),
  aplicado_por uuid references public.perfiles(id),
  filas int not null
);

create table if not exists public.importaciones_horario_detalle (
  id uuid primary key default gen_random_uuid(),
  importacion_id uuid not null references public.importaciones_horario(id) on delete cascade,
  empleado_id uuid,
  fecha date,
  area_id uuid,
  ps text,
  nombre text,
  monto numeric,
  creo_horario boolean,
  asistencia_id uuid
);

create index if not exists idx_importaciones_horario_aplicado_en
  on public.importaciones_horario (aplicado_en desc);

create index if not exists idx_importaciones_horario_detalle_importacion
  on public.importaciones_horario_detalle (importacion_id);

alter table public.importaciones_horario enable row level security;
alter table public.importaciones_horario_detalle enable row level security;

drop policy if exists lectura_importaciones_horario_admin_supervision
  on public.importaciones_horario;
create policy lectura_importaciones_horario_admin_supervision
  on public.importaciones_horario
  for select
  to authenticated
  using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
        and p.activo
        and p.rol::text in ('administrador_general', 'supervision')
    )
  );

drop policy if exists lectura_importaciones_horario_detalle_admin_supervision
  on public.importaciones_horario_detalle;
create policy lectura_importaciones_horario_detalle_admin_supervision
  on public.importaciones_horario_detalle
  for select
  to authenticated
  using (
    exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
        and p.activo
        and p.rol::text in ('administrador_general', 'supervision')
    )
  );

-- Insert/update/delete solo vía RPC security definer (sin políticas de escritura).

grant select on public.importaciones_horario to authenticated;
grant select on public.importaciones_horario_detalle to authenticated;

-- ---------------------------------------------------------------------------
-- 3. registrar_lote_importacion
-- ---------------------------------------------------------------------------
create or replace function public.registrar_lote_importacion(p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rol text;
  v_importacion_id uuid;
  v_creadas int := 0;
  v_errores jsonb := '[]'::jsonb;
  v_item jsonb;
  v_empleado_id uuid;
  v_fecha date;
  v_area_id uuid;
  v_ps text;
  v_nombre text;
  v_monto numeric;
  v_resultado jsonb;
  v_asistencia_id uuid;
  v_creo_horario boolean;
begin
  select rol::text into v_rol from perfiles where id = auth.uid() and activo;

  if v_rol is null
     or v_rol not in ('administrador_general', 'supervision', 'admin_area') then
    raise exception 'No tienes permiso para importar horarios.' using errcode = 'P0001';
  end if;

  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'Debes enviar al menos una fila para importar.' using errcode = 'P0001';
  end if;

  insert into public.importaciones_horario (aplicado_por, filas)
  values (auth.uid(), 0)
  returning id into v_importacion_id;

  for v_item in select * from jsonb_array_elements(p_filas)
  loop
    begin
      v_empleado_id := nullif(v_item->>'empleado_id', '')::uuid;
      v_fecha := nullif(v_item->>'fecha', '')::date;
      v_area_id := nullif(v_item->>'area_id', '')::uuid;
      v_ps := v_item->>'ps';
      v_nombre := v_item->>'nombre';
      v_monto := nullif(v_item->>'monto', '')::numeric;

      if v_empleado_id is null or v_fecha is null or v_area_id is null then
        raise exception 'Fila incompleta: faltan empleado, fecha o área.' using errcode = 'P0001';
      end if;

      v_resultado := public.importar_horario_asistencia(v_empleado_id, v_fecha, v_area_id);
      v_asistencia_id := (v_resultado->>'asistencia_id')::uuid;
      v_creo_horario := coalesce((v_resultado->>'creo_horario')::boolean, false);

      insert into public.importaciones_horario_detalle (
        importacion_id, empleado_id, fecha, area_id, ps, nombre, monto, creo_horario, asistencia_id
      ) values (
        v_importacion_id, v_empleado_id, v_fecha, v_area_id, v_ps, v_nombre, v_monto, v_creo_horario, v_asistencia_id
      );

      v_creadas := v_creadas + 1;
    exception when others then
      v_errores := v_errores || jsonb_build_array(
        jsonb_build_object(
          'fecha', coalesce(v_item->>'fecha', ''),
          'ps', coalesce(v_item->>'ps', ''),
          'error', SQLERRM
        )
      );
    end;
  end loop;

  update public.importaciones_horario
     set filas = v_creadas
   where id = v_importacion_id;

  return jsonb_build_object(
    'importacion_id', v_importacion_id,
    'creadas', v_creadas,
    'errores', v_errores
  );
end;
$function$;

revoke all on function public.registrar_lote_importacion(jsonb) from public, anon;
grant execute on function public.registrar_lote_importacion(jsonb) to authenticated;
