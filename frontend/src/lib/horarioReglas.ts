/**
 * horarioReglas.ts
 *
 * Reglas de negocio puras para interpretar el PDF semanal de horarios
 * (portadas de parse_horario_v2.py). No leen el PDF ni consultan Supabase:
 * reciben texto ya extraído y regresan una clasificación.
 *
 * Regla central: solo Comanderos y Corredores con entrada >= 11:00 AM
 * (hora CDMX impresa en el PDF) generan cuota.
 */

import type { ClasificacionCruda, FilaContratoCrudo } from "./importacionHorario";

export const CORTE_CUOTA_MINUTOS = 11 * 60;

const TIME_RANGE_RE = /^(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i;
const LOOSE_TIME_HINT_RE = /\d{1,2}:\d{2}|\b[AP]M\b/i;

/** Mayúsculas, sin acentos y con espacios colapsados. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Estados sin turno que se conocen y se ignoran sin pedir revisión. */
const ESTADOS_NO_LABORABLES = new Set(
  ["VACACION", "DESCANSO", "INCAPACIDAD", "PERMISO", "FALTA", "BAJA", "SIN GOCE DE SUELDO"].map(normalizarTexto),
);

const ALIAS_AREAS: Record<string, "comanderos" | "corredores" | "otra_reconocida"> = {};
for (const a of ["COMANDEROS"]) ALIAS_AREAS[normalizarTexto(a)] = "comanderos";
for (const a of ["CORREDORES"]) ALIAS_AREAS[normalizarTexto(a)] = "corredores";
for (const a of [
  "APOYO OTRAS AREAS",
  "COCINA",
  "LIMPIEZA PROFUNDA",
  "LIMPIEZA ENTRE FUNCIONES",
  "TAQUILLA",
  "DULCERIA",
  "BAÑOS",
]) {
  ALIAS_AREAS[normalizarTexto(a)] = "otra_reconocida";
}

/** "08:30 AM" -> minutos desde medianoche. Lanza Error si es inválida. */
export function parseTimeToMinutes(hora: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(hora.trim());
  if (!m) throw new Error(`hora no reconocida: ${hora}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 1 || h > 12 || min > 59) throw new Error(`hora fuera de rango: ${hora}`);
  const pm = m[3].toUpperCase() === "PM";
  const h24 = pm ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h;
  return h24 * 60 + min;
}

/** Entrada >= 11:00 genera cuota. */
export function generaCuotaPorCorte(horaInicio: string): boolean {
  return parseTimeToMinutes(horaInicio) >= CORTE_CUOTA_MINUTOS;
}

/** Acepta solo "YYYY-MM-DD" válido; cualquier otro formato regresa null. */
export function parseFechaIso(texto: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** PS de exactamente 6 dígitos (formato de empleados.numero_empleado). */
export function normalizePs(ps: string): string | null {
  const limpio = ps.trim();
  return /^\d{6}$/.test(limpio) ? limpio : null;
}

export interface CeldaClasificada {
  estado: string; // "TRABAJA" | "SIN_TURNO" | "FORMATO_INVALIDO" | texto del estado (p. ej. "VACACIÓN")
  hora_inicio: string | null;
  hora_fin: string | null;
  area_pdf: string | null;
}

export function classifyCell(raw: string | null | undefined): CeldaClasificada {
  const texto = (raw ?? "").trim();
  if (!texto) return { estado: "SIN_TURNO", hora_inicio: null, hora_fin: null, area_pdf: null };

  const lineas = texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const primera = lineas[0];
  const m = TIME_RANGE_RE.exec(primera);
  if (m) {
    try {
      parseTimeToMinutes(m[1]);
      parseTimeToMinutes(m[2]);
    } catch {
      return { estado: "FORMATO_INVALIDO", hora_inicio: null, hora_fin: null, area_pdf: null };
    }
    return {
      estado: "TRABAJA",
      hora_inicio: m[1].toUpperCase(),
      hora_fin: m[2].toUpperCase(),
      area_pdf: lineas.slice(1).join(" "),
    };
  }
  if (LOOSE_TIME_HINT_RE.test(primera)) {
    return { estado: "FORMATO_INVALIDO", hora_inicio: null, hora_fin: null, area_pdf: null };
  }
  return { estado: texto, hora_inicio: null, hora_fin: null, area_pdf: null };
}

export type CategoriaArea = "comanderos" | "corredores" | "otra_reconocida" | "desconocida";

export function mapArea(areaPdf: string | null): {
  areaCinema: "comanderos" | "corredores" | null;
  categoria: CategoriaArea;
} {
  if (!areaPdf) return { areaCinema: null, categoria: "desconocida" };
  const categoria = ALIAS_AREAS[normalizarTexto(areaPdf)] ?? "desconocida";
  const areaCinema = categoria === "comanderos" || categoria === "corredores" ? categoria : null;
  return { areaCinema, categoria };
}

export function buildContractRecord(raw: {
  ps: string;
  nombre_pdf: string;
  fecha: string;
  raw_cell: string;
}): FilaContratoCrudo {
  const celda = classifyCell(raw.raw_cell);
  const motivos: string[] = [];
  let confidence = 1;
  let generaCuota = false;
  let areaCinema: "comanderos" | "corredores" | null = null;
  let clasificacion: ClasificacionCruda = "ignorar";

  if (celda.estado === "FORMATO_INVALIDO") {
    motivos.push("celda con patrón de hora irreconocible: revisar manualmente");
    clasificacion = "revisar";
    confidence = 0.3;
  } else if (celda.estado === "SIN_TURNO") {
    motivos.push("sin turno registrado ese día");
  } else if (celda.estado !== "TRABAJA") {
    if (ESTADOS_NO_LABORABLES.has(normalizarTexto(celda.estado))) {
      motivos.push(`estado no laborable conocido: ${celda.estado}`);
    } else {
      motivos.push(`estado '${celda.estado}' no está en el catálogo conocido: revisar`);
      clasificacion = "revisar";
      confidence = 0.5;
    }
  } else {
    const { areaCinema: ac, categoria } = mapArea(celda.area_pdf);
    areaCinema = ac;
    if (categoria === "desconocida") {
      motivos.push("área del PDF no reconocida (comanderos/corredores/otra): agregar alias o revisar");
      clasificacion = "revisar";
      confidence = 0.4;
    } else if (categoria === "otra_reconocida") {
      motivos.push("área reconocida pero fuera de alcance (no es comanderos/corredores)");
      clasificacion = "ignorar_area";
    } else {
      generaCuota = generaCuotaPorCorte(celda.hora_inicio ?? "");
      if (generaCuota) {
        motivos.push(`área=${categoria}, hora_inicio >= 11:00: candidato a horario+asistencia`);
        clasificacion = "candidato_cuota";
      } else {
        motivos.push("hora_inicio < 11:00 (America/Mexico_City): sin cuota");
        clasificacion = "sin_cuota_omitir";
      }
    }
  }

  return {
    ps: raw.ps,
    nombre_pdf: raw.nombre_pdf,
    fecha: raw.fecha,
    hora_inicio: celda.hora_inicio,
    hora_fin: celda.hora_fin,
    area_pdf: celda.area_pdf,
    area_cinema: areaCinema,
    estado: celda.estado,
    genera_cuota: generaCuota,
    clasificacion,
    motivos,
    confidence,
    raw_cell: raw.raw_cell,
  };
}
