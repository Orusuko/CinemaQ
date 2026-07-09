-- ============================================================================
-- 08_email_interno (11/13)
-- Ejecuta TODO este archivo con Run. Un archivo = una transacción.
-- Si falla, copia el mensaje ROJO de error (no solo el resultado del SELECT).
-- Orden: 01 → 02a → 02b → 02c → 02d → 03 → … → 10
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

-- VERIFICACIÓN
select email_interno_desde_usuario('Orusuko');
