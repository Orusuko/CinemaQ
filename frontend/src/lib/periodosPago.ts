import { aUtc, deUtc, MS_DIA, semanaDe } from "./reporteCuotas";

export type TipoPeriodo = "semanal" | "catorcenal";

/** shortcut: ancla fija (jueves donde arranca una catorcena); si el corte real difiere, cambiar solo esta fecha. */
export const ANCLA_CATORCENA = "2026-09-10";

/** Periodo (semana jue–mié o catorcena = 2 semanas) que contiene la fecha. */
export function periodoDe(tipo: TipoPeriodo, fechaIso: string): { desde: string; hasta: string } {
  const semana = semanaDe(fechaIso);
  if (tipo === "semanal") return semana;
  const semanasDesdeAncla = Math.round((aUtc(semana.desde) - aUtc(ANCLA_CATORCENA)) / (7 * MS_DIA));
  const desdeMs = aUtc(semana.desde) - (((semanasDesdeAncla % 2) + 2) % 2) * 7 * MS_DIA;
  return { desde: deUtc(desdeMs), hasta: deUtc(desdeMs + 13 * MS_DIA) };
}

/** Fecha equivalente `pasos` periodos adelante (o atrás si es negativo). */
export function moverPeriodo(tipo: TipoPeriodo, fechaIso: string, pasos: number): string {
  return deUtc(aUtc(fechaIso) + pasos * (tipo === "semanal" ? 7 : 14) * MS_DIA);
}
