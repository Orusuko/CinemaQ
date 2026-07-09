import type { PostgrestError } from "@supabase/supabase-js";

/** Mensaje legible para errores de consultas Supabase (PostgREST). */
export function mensajeErrorConsulta(
  error: PostgrestError | { message?: string } | null | undefined,
  fallback = "No se pudieron cargar los datos.",
): string {
  const texto = error?.message?.trim();
  return texto || fallback;
}

/** Valida formato YYYY-MM-DD para parámetros de URL. */
export function esFechaIsoValida(valor: string | null): valor is string {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor));
}
