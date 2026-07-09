-- ============================================================================
-- 10_seed_orusuko (13/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
-- ============================================================================

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

-- VERIFICACIÓN
select p.nombre_usuario,p.rol from perfiles p where lower(p.nombre_usuario)='orusuko';
