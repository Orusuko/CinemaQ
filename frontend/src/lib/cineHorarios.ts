/**
 * Puente CinemaQuote → app Cine (Generador de Horarios de Descanso).
 * Contrato compartido: localStorage + hash `#cq_seed=` (base64 UTF-8).
 */

export const CINE_SEED_STORAGE_KEY = "cinemaquote_cine_seed_v1";

export interface CineSeedEmpleado {
  numero: string;
  nombre: string;
  area: string;
}

export interface CineSeedPayload {
  source: "cinemaquote";
  version: 1;
  fecha: string;
  area: string;
  empleados: CineSeedEmpleado[];
}

function urlBaseCine(): string {
  const desdeEnv = import.meta.env.VITE_CINE_APP_URL as string | undefined;
  if (desdeEnv?.trim()) return desdeEnv.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.hostname === "orusuko.github.io") {
    return "https://orusuko.github.io/ChairLaw";
  }
  /* CinemaQuote suele ocupar :5173; Cine en paralelo → :5174 */
  return "http://localhost:5174";
}

function encodeUtf8Base64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Abre Cine con la lista precargada (nombres/área; horas las captura el admin allí). */
export function abrirCineConEmpleados(payload: CineSeedPayload): { ok: true } | { ok: false; motivo: string } {
  if (payload.empleados.length === 0) {
    return { ok: false, motivo: "No hay empleados en el horario para enviar." };
  }

  const json = JSON.stringify(payload);
  try {
    localStorage.setItem(CINE_SEED_STORAGE_KEY, json);
  } catch {
    /* origen distinto o cuota: el hash basta */
  }

  const base = urlBaseCine();
  const url = `${base}/#cq_seed=${encodeUtf8Base64(json)}`;
  const ventana = window.open(url, "_blank", "noopener,noreferrer");
  if (!ventana) {
    return {
      ok: false,
      motivo: "El navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.",
    };
  }
  return { ok: true };
}
