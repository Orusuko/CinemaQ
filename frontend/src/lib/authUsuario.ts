/** Dominio interno para Auth; el usuario nunca lo ve ni lo escribe. */
export const DOMINIO_LOGIN_INTERNO = "cuotas.interno";

export function normalizarNombreUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

/** Traduce "Orusuko" → "orusuko@cuotas.interno" para signInWithPassword. */
export function usuarioAEmailInterno(usuario: string): string {
  return `${normalizarNombreUsuario(usuario)}@${DOMINIO_LOGIN_INTERNO}`;
}
