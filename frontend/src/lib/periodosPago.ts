import { aUtc, deUtc, MS_DIA, semanaDe } from "./reporteCuotas";

export type TipoPeriodo = "semanal" | "catorcenal";

/** Primer jueves del año: ahí arranca la semana 1 (en 2026, el 1 de enero). */
function primerJueves(anio: number): string {
  const ene1 = Date.UTC(anio, 0, 1);
  const dia = new Date(ene1).getUTCDay();
  return deUtc(ene1 + ((4 - dia + 7) % 7) * MS_DIA);
}

export interface PeriodoNumerado {
  anio: number;
  numero: number;
  desde: string;
  hasta: string;
}

/** Número de semana tal como sale en la portada del horario (33, 2026-08-13 - 2026-08-19). */
export function semanaNumerada(fechaIso: string): PeriodoNumerado {
  const semana = semanaDe(fechaIso);
  const anio = Number(semana.desde.slice(0, 4));
  const numero = Math.round((aUtc(semana.desde) - aUtc(primerJueves(anio))) / (7 * MS_DIA)) + 1;
  return { anio, numero, ...semana };
}

export interface CatorcenaNumerada extends PeriodoNumerado {
  semanaDesde: number;
  semanaHasta: number;
}

/** Catorcena = semanas impar y par consecutivas (37 y 38). El número es el de la portada, no una fecha. */
export function catorcenaNumerada(fechaIso: string): CatorcenaNumerada {
  const sem = semanaNumerada(fechaIso);
  const inicio = sem.numero % 2 === 1 ? sem : semanaNumerada(deUtc(aUtc(sem.desde) - 7 * MS_DIA));
  const hasta = deUtc(aUtc(inicio.desde) + 13 * MS_DIA);
  return {
    anio: inicio.anio,
    numero: Math.ceil(inicio.numero / 2),
    desde: inicio.desde,
    hasta,
    semanaDesde: inicio.numero,
    semanaHasta: semanaNumerada(hasta).numero,
  };
}

/** Jueves donde empieza la semana o catorcena `numero` de ese año. */
export function fechaDeNumero(tipo: TipoPeriodo, anio: number, numero: number): string {
  const pasos = (numero < 1 ? 1 : numero) - 1;
  return deUtc(aUtc(primerJueves(anio)) + pasos * (tipo === "semanal" ? 7 : 14) * MS_DIA);
}

/** Periodo (semana jue–mié o catorcena = 2 semanas) que contiene la fecha. */
export function periodoDe(tipo: TipoPeriodo, fechaIso: string): { desde: string; hasta: string } {
  if (tipo === "semanal") return semanaDe(fechaIso);
  const c = catorcenaNumerada(fechaIso);
  return { desde: c.desde, hasta: c.hasta };
}

/** Fecha equivalente `pasos` periodos adelante (o atrás si es negativo). */
export function moverPeriodo(tipo: TipoPeriodo, fechaIso: string, pasos: number): string {
  return deUtc(aUtc(fechaIso) + pasos * (tipo === "semanal" ? 7 : 14) * MS_DIA);
}
