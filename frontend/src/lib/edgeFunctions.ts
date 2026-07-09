import { supabase, EDGE_FUNCTIONS_URL } from "./supabaseClient";

interface RespuestaEdgeFunction {
  exito: boolean;
  mensaje: string;
  [clave: string]: unknown;
}

/**
 * Invoca una Edge Function pasando el JWT del usuario actual. Las Edge
 * Functions verifican internamente que el llamante sea administrador_general
 * antes de usar la llave service_role.
 */
export async function llamarEdgeFunction<T extends RespuestaEdgeFunction = RespuestaEdgeFunction>(
  nombre: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data: sesion } = await supabase.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) throw new Error("Debes iniciar sesión de nuevo.");

  const respuesta = await fetch(`${EDGE_FUNCTIONS_URL}/${nombre}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const cuerpo = (await respuesta.json()) as T;
  if (!respuesta.ok || !cuerpo.exito) {
    throw new Error(cuerpo.mensaje || "Ocurrió un error al comunicarse con el servidor.");
  }
  return cuerpo;
}
