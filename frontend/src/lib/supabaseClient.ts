import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const anonKeyInvalida =
  !anonKey ||
  anonKey.includes("PEGA_AQUI") ||
  anonKey === "tu-anon-key-publica" ||
  anonKey.length < 20;

if (!url || anonKeyInvalida) {
  // eslint-disable-next-line no-console
  console.error(
    "Configura frontend/.env con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (Dashboard → Settings → API → anon public).",
  );
}

export const supabaseConfigurado = Boolean(url && !anonKeyInvalida);

// La anon key es pública por diseño (ver README, sección de seguridad): la
// protección real de los datos vive en las políticas RLS de Supabase, no en
// ocultar esta llave.
export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export const EDGE_FUNCTIONS_URL = url ? `${url}/functions/v1` : "";
