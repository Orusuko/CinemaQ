/**
 * pagosSemanalesCorredores.ts
 *
 * Esqueleto de tipos y funciones para el régimen de cobro semanal
 * de Corredores (6 de 7 días laborales). Este archivo es 100% aislado
 * del resto de la app — NO importar desde rutas, páginas ni App.tsx.
 *
 * Ver: docs/especificacion-pagos-semanales-corredores.md
 */

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** Días laborales estándar por semana para Corredores. */
export const DIAS_LABORALES_SEMANA = 6;

/** Zona horaria de negocio. */
export const ZONA_HORARIA = "America/Mexico_City";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Modo de cobro por empleado o área. */
export type ModoCobroArea = "diario" | "semanal";

/** Representación de una semana laboral. */
export interface SemanaLaboral {
  /** Fecha ISO del lunes de la semana. */
  inicioSemana: string;
  /** Fecha ISO del domingo de la semana. */
  finSemana: string;
  /** Días que el empleado debería trabajar esta semana (usualmente 6). */
  diasLaboralesEsperados: number;
}

/** Estado de una obligación semanal. */
export type EstadoObligacionSemanal =
  | "pendiente"    // Sin pagos validados
  | "parcial"      // Algunos pagos validados pero no alcanzan el total
  | "completada"   // Total validado ≥ monto esperado
  | "incompleta";  // Semana cerrada sin completar

/** Pago diario simplificado (sin dependencias externas). */
export interface PagoDiarioResumen {
  id: string;
  empleadoId: string;
  areaId: string;
  fecha: string;
  montoEsperado: number;
  estado: "pendiente" | "marcado_pendiente_validacion" | "validado" | "cancelado";
}

/** Obligación semanal calculada a partir de pagos diarios. */
export interface ObligacionSemanal {
  empleadoId: string;
  areaId: string;
  semana: SemanaLaboral;
  montoEsperado: number;
  montoValidado: number;
  estado: EstadoObligacionSemanal;
  pagos: PagoDiarioResumen[];
}

/* ------------------------------------------------------------------ */
/* Funciones stub                                                      */
/* ------------------------------------------------------------------ */

/**
 * Calcula la fecha del lunes (inicio de semana laboral) para una fecha dada.
 *
 * @param fecha - Fecha ISO `YYYY-MM-DD`
 * @param _zonaHoraria - Zona horaria (por defecto CDMX)
 * @returns Fecha ISO del lunes correspondiente
 *
 * Lógica esperada:
 * - Si `fecha` es lunes, devuelve la misma fecha.
 * - Si es otro día, retrocede al lunes anterior.
 * - Domingo se considera fin de la semana anterior (retrocede 6 días).
 */
export function obtenerInicioSemanaLaboral(
  _fecha: string,
  _zonaHoraria: string = ZONA_HORARIA,
): string {
  throw new Error("No implementado — fase 11c");
}

/**
 * Cuenta los días laborales del empleado en una semana, basándose en
 * registros de asistencia.
 *
 * @param _asistencias - Fechas ISO en las que el empleado asistió
 * @param _semana - Semana laboral a evaluar
 * @returns Número de días laborales (0–7)
 *
 * Lógica esperada:
 * - Contar cuántas fechas de `asistencias` caen dentro de `semana`.
 * - Si no hay datos de asistencia, asumir `DIAS_LABORALES_SEMANA`.
 */
export function contarDiasLaboralesEnSemana(
  _asistencias: string[],
  _semana: SemanaLaboral,
): number {
  throw new Error("No implementado — fase 11c");
}

/**
 * Calcula el monto esperado semanal.
 *
 * @param cuotaDiaria - Monto de la cuota fija diaria del área
 * @param diasLaborales - Número de días laborales de la semana
 * @returns Monto total esperado para la semana
 *
 * Fórmula: `cuotaDiaria × diasLaborales`
 * Si en el futuro se define un monto semanal fijo distinto, esta función
 * sería el punto de cambio.
 */
export function calcularMontoEsperadoSemanal(
  cuotaDiaria: number,
  diasLaborales: number = DIAS_LABORALES_SEMANA,
): number {
  return cuotaDiaria * diasLaborales;
}

/**
 * Agrupa un array de pagos diarios en obligaciones semanales por empleado.
 *
 * @param _pagos - Lista de pagos diarios
 * @returns Array de obligaciones semanales
 *
 * Lógica esperada:
 * 1. Agrupar pagos por (empleadoId, semana laboral).
 * 2. Para cada grupo, calcular monto esperado y validado.
 * 3. Determinar el estado de la obligación.
 */
export function agruparPagosDiariosEnObligacionSemanal(
  _pagos: PagoDiarioResumen[],
): ObligacionSemanal[] {
  throw new Error("No implementado — fase 11d");
}

/**
 * Determina el estado de una obligación semanal basándose en los pagos
 * validados y si la semana ya cerró.
 *
 * @param _obligacion - Obligación semanal a evaluar
 * @returns Estado calculado
 *
 * Lógica esperada:
 * - Si `montoValidado >= montoEsperado` → `completada`
 * - Si `montoValidado > 0` → `parcial`
 * - Si la semana ya pasó y `montoValidado < montoEsperado` → `incompleta`
 * - Si no → `pendiente`
 */
export function estadoObligacionSemanal(
  _obligacion: Pick<ObligacionSemanal, "montoEsperado" | "montoValidado" | "semana">,
): EstadoObligacionSemanal {
  throw new Error("No implementado — fase 11d");
}
