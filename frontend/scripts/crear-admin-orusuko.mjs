/**
 * Crea el administrador de prueba Orusuko / 1234 en Supabase Auth + perfiles.
 *
 * Requisitos en .env (raíz del repo):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (Dashboard → Settings → API → service_role)
 *
 * Supabase Auth debe permitir contraseñas de 4 caracteres:
 *   Authentication → Providers → Email → Minimum password length → 4
 *
 * Uso: npm run seed:admin   (desde frontend/)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", "..", ".env");

function cargarEnv(ruta) {
  if (!existsSync(ruta)) return {};
  const vars = {};
  for (const linea of readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return vars;
}

const env = { ...process.env, ...cargarEnv(envPath) };
const url = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env (raíz).\n" +
      "Obtén la service_role en Dashboard → Settings → API.",
  );
  process.exit(1);
}

const USUARIO = "Orusuko";
const PASSWORD = "1234";
const EMAIL_INTERNO = `${USUARIO.toLowerCase()}@cuotas.interno`;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existente } = await admin.auth.admin.listUsers({ perPage: 1000 });
const yaExiste = existente?.users?.find(
  (u) => u.email?.toLowerCase() === EMAIL_INTERNO,
);

let userId = yaExiste?.id;

if (!userId) {
  const { data: creado, error } = await admin.auth.admin.createUser({
    email: EMAIL_INTERNO,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { nombre_usuario: USUARIO.toLowerCase() },
  });
  if (error) {
    console.error("No se pudo crear el usuario Auth:", error.message);
    console.error(
      "Si dice 'password' o 'weak', baja el mínimo a 4 en Authentication → Email.",
    );
    process.exit(1);
  }
  userId = creado.user.id;
  console.log("Usuario Auth creado:", EMAIL_INTERNO);
} else {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) {
    console.error("No se pudo actualizar contraseña:", error.message);
    process.exit(1);
  }
  console.log("Usuario Auth ya existía; contraseña actualizada a 1234.");
}

const { error: perfilError } = await admin.from("perfiles").upsert(
  {
    id: userId,
    nombre_usuario: USUARIO.toLowerCase(),
    nombre_completo: "Orusuko",
    rol: "administrador_general",
    area_id: null,
    activo: true,
  },
  { onConflict: "id" },
);

if (perfilError) {
  console.error("No se pudo crear/actualizar perfil:", perfilError.message);
  console.error(
    "¿Ejecutaste 0009_login_por_usuario.sql (o 00_esquema_completo.sql actualizado)?",
  );
  process.exit(1);
}

console.log("");
console.log("Listo. Credenciales de prueba:");
console.log("  Usuario:    Orusuko");
console.log("  Contraseña: 1234");
console.log("  Rol:        administrador_general");
