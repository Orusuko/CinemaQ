import { supabase } from "./supabaseClient";

/**
 * Invoca una función RPC de Supabase y normaliza los errores a un mensaje en
 * español legible (las funciones SQL usan RAISE EXCEPTION con mensajes ya en
 * español; esto simplemente evita que se pierda ese texto).
 */
export async function llamarRpc<T = unknown>(nombre: string, parametros?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nombre, parametros ?? {});
  if (error) {
    throw new Error(error.message || "Ocurrió un error al procesar la solicitud.");
  }
  return data as T;
}
