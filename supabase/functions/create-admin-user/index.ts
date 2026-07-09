// Edge Function: create-admin-user
/// <reference path="../env.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Crea un nuevo usuario administrativo (auth.users) y su fila en `perfiles`.
// El login es por nombre_usuario; Auth usa email interno lower(usuario)@cuotas.interno
import { corsHeaders } from "../_shared/cors.ts";
import { crearClienteServiceRole, exigirAdministradorGeneral } from "../_shared/auth.ts";

const DOMINIO_LOGIN = "cuotas.interno";

interface Payload {
  nombre_usuario: string;
  password: string;
  nombre_completo: string;
  rol: "admin_area" | "administrador_general" | "supervision";
  area_id?: string | null;
}

function emailInterno(usuario: string): string {
  return `${usuario.trim().toLowerCase()}@${DOMINIO_LOGIN}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      throw { status: 405, mensaje: "Método no permitido." };
    }

    const admin = crearClienteServiceRole();
    await exigirAdministradorGeneral(req, admin);

    const body = (await req.json()) as Payload;

    if (!body.nombre_usuario || !body.password || !body.nombre_completo || !body.rol) {
      throw { status: 400, mensaje: "Faltan campos obligatorios: nombre_usuario, password, nombre_completo, rol." };
    }

    const usuarioNormalizado = body.nombre_usuario.trim().toLowerCase();

    if (!/^[a-z0-9_]{2,32}$/.test(usuarioNormalizado)) {
      throw { status: 400, mensaje: "El usuario solo puede tener letras, números y guión bajo (2–32 caracteres)." };
    }

    if (body.password.length < 4) {
      throw { status: 400, mensaje: "La contraseña temporal debe tener al menos 4 caracteres." };
    }

    if (body.rol === "admin_area" && !body.area_id) {
      throw { status: 400, mensaje: "Un admin_area requiere un área asignada." };
    }

    if (body.rol !== "admin_area" && body.area_id) {
      throw { status: 400, mensaje: "Solo admin_area debe tener un área asignada." };
    }

    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email: emailInterno(usuarioNormalizado),
      password: body.password,
      email_confirm: true,
      user_metadata: { nombre_usuario: usuarioNormalizado },
    });

    if (errorCrear || !creado?.user) {
      throw { status: 400, mensaje: `No se pudo crear el usuario: ${errorCrear?.message ?? "error desconocido"}` };
    }

    const { error: errorPerfil } = await admin.from("perfiles").insert({
      id: creado.user.id,
      nombre_usuario: usuarioNormalizado,
      nombre_completo: body.nombre_completo,
      rol: body.rol,
      area_id: body.area_id ?? null,
      activo: true,
    });

    if (errorPerfil) {
      await admin.auth.admin.deleteUser(creado.user.id);
      throw { status: 400, mensaje: `No se pudo crear el perfil: ${errorPerfil.message}` };
    }

    return new Response(
      JSON.stringify({
        exito: true,
        mensaje: "Usuario creado correctamente.",
        id: creado.user.id,
        nombre_usuario: usuarioNormalizado,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    const mensaje = (err as { mensaje?: string })?.mensaje ?? "Error inesperado en el servidor.";
    return new Response(JSON.stringify({ exito: false, mensaje }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
