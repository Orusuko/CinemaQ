// Edge Function: deactivate-admin-user
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Desactiva (o reactiva) un usuario administrativo sin borrar su historial.
// Solo invocable por administrador_general. No permite auto-desactivarse
// para evitar que el sistema se quede sin administradores generales activos.
import { corsHeaders } from "../_shared/cors.ts";
import { crearClienteServiceRole, exigirAdministradorGeneral } from "../_shared/auth.ts";

interface Payload {
  id: string;
  activo: boolean;
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
    const solicitante = await exigirAdministradorGeneral(req, admin);

    const body = (await req.json()) as Payload;

    if (!body.id || typeof body.activo !== "boolean") {
      throw { status: 400, mensaje: "Faltan campos obligatorios: id, activo." };
    }

    if (body.id === solicitante.id && body.activo === false) {
      throw { status: 400, mensaje: "No puedes desactivar tu propia cuenta." };
    }

    const { error } = await admin.from("perfiles").update({ activo: body.activo }).eq("id", body.id);
    if (error) {
      throw { status: 400, mensaje: `No se pudo actualizar el estado del usuario: ${error.message}` };
    }

    return new Response(
      JSON.stringify({
        exito: true,
        mensaje: body.activo ? "Usuario reactivado." : "Usuario desactivado.",
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
