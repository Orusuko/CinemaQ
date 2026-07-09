// Edge Function: update-admin-user
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Edita nombre/rol/área de un usuario administrativo existente, y
// opcionalmente le asigna una nueva contraseña temporal. Solo invocable por
// administrador_general.
import { corsHeaders } from "../_shared/cors.ts";
import { crearClienteServiceRole, exigirAdministradorGeneral } from "../_shared/auth.ts";

interface Payload {
  id: string;
  nombre_completo?: string;
  rol?: "admin_area" | "administrador_general" | "supervision";
  area_id?: string | null;
  nueva_password?: string;
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

    if (!body.id) {
      throw { status: 400, mensaje: "Falta el id del usuario a editar." };
    }

    if (body.rol === "admin_area" && !body.area_id) {
      throw { status: 400, mensaje: "Un admin_area requiere un área asignada." };
    }
    if (body.rol && body.rol !== "admin_area" && body.area_id) {
      throw { status: 400, mensaje: "Solo admin_area debe tener un área asignada." };
    }

    if (body.nueva_password) {
      if (body.nueva_password.length < 4) {
        throw { status: 400, mensaje: "La nueva contraseña debe tener al menos 4 caracteres." };
      }
      const { error: errorPassword } = await admin.auth.admin.updateUserById(body.id, {
        password: body.nueva_password,
      });
      if (errorPassword) {
        throw { status: 400, mensaje: `No se pudo actualizar la contraseña: ${errorPassword.message}` };
      }
    }

    const cambios: Record<string, unknown> = {};
    if (body.nombre_completo !== undefined) cambios.nombre_completo = body.nombre_completo;
    if (body.rol !== undefined) cambios.rol = body.rol;
    if (body.area_id !== undefined) cambios.area_id = body.area_id;

    if (Object.keys(cambios).length > 0) {
      const { error: errorPerfil } = await admin.from("perfiles").update(cambios).eq("id", body.id);
      if (errorPerfil) {
        throw { status: 400, mensaje: `No se pudo actualizar el perfil: ${errorPerfil.message}` };
      }
    }

    return new Response(JSON.stringify({ exito: true, mensaje: "Usuario actualizado correctamente." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    const mensaje = (err as { mensaje?: string })?.mensaje ?? "Error inesperado en el servidor.";
    return new Response(JSON.stringify({ exito: false, mensaje }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });
  }
});
