import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

/**
 * Crea un cliente Supabase con la llave service_role. SOLO se usa dentro de
 * Edge Functions, NUNCA en el frontend. Se salta RLS por diseño, así que
 * cada función debe validar permisos manualmente antes de operar.
 */
export function crearClienteServiceRole(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Verifica que la petición traiga un JWT válido de un usuario autenticado
 * cuyo perfil sea `administrador_general` y esté activo. Lanza un objeto
 * { status, mensaje } (para responder directo al cliente) si falla.
 */
export async function exigirAdministradorGeneral(
  req: Request,
  admin: SupabaseClient,
): Promise<{ id: string; email: string | undefined }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw { status: 401, mensaje: "Falta el token de autenticación." };
  }

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    throw { status: 401, mensaje: "Sesión inválida o expirada." };
  }

  const { data: perfil, error: perfilError } = await admin
    .from("perfiles")
    .select("rol, activo")
    .eq("id", userData.user.id)
    .single();

  if (perfilError || !perfil) {
    throw { status: 403, mensaje: "No se encontró un perfil administrativo para este usuario." };
  }

  if (perfil.rol !== "administrador_general" || !perfil.activo) {
    throw { status: 403, mensaje: "Solo el Administrador general puede realizar esta acción." };
  }

  return { id: userData.user.id, email: userData.user.email };
}
