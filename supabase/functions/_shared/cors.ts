// Encabezados CORS compartidos por todas las Edge Functions.
// El valor de origen se restringe con la variable de entorno ALLOWED_ORIGIN
// (configúrala en Supabase con el dominio de GitHub Pages). Si no está
// configurada, se permite cualquier origen (útil en desarrollo local).
const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
