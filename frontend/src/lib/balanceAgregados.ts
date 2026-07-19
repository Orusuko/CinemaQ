import type { PagoCuota } from "./tipos";
import { sumarDiaIso } from "./periodoAbierto";

export interface TotalesDia {
  fecha: string;
  esperado: number;
  recaudado: number;
  pendiente: number;
  enRevision: number;
}

export interface TotalesPeriodo {
  esperado: number;
  recaudado: number;
  enRevision: number;
  faltaPorCobrar: number;
  pendientes: number;
}

export interface TotalesDiaOperacion {
  pendientes: number;
  enRevision: number;
  validados: number;
  recaudado: number;
  esperado: number;
}

/** Totales acumulados del periodo abierto. */
export function calcularTotalesPeriodo(pagos: PagoCuota[]): TotalesPeriodo {
  let esperado = 0;
  let recaudado = 0;
  let enRevision = 0;
  let faltaPorCobrar = 0;
  let pendientes = 0;

  for (const p of pagos) {
    if (p.estado !== "cancelado") esperado += Number(p.monto_esperado);
    if (p.estado === "validado") recaudado += Number(p.monto_esperado);
    if (p.estado === "marcado_pendiente_validacion") enRevision += Number(p.monto_esperado);
    if (p.estado === "pendiente") {
      faltaPorCobrar += Number(p.monto_esperado);
      pendientes++;
    }
  }

  return { esperado, recaudado, enRevision, faltaPorCobrar, pendientes };
}

/** Totales de un solo día (conteo + montos). */
export function calcularTotalesDia(pagos: PagoCuota[]): TotalesDiaOperacion {
  let pendientes = 0;
  let enRevision = 0;
  let validados = 0;
  let recaudado = 0;
  let esperado = 0;

  for (const p of pagos) {
    if (p.estado !== "cancelado") esperado += Number(p.monto_esperado);
    if (p.estado === "pendiente") pendientes++;
    if (p.estado === "marcado_pendiente_validacion") enRevision++;
    if (p.estado === "validado") {
      validados++;
      recaudado += Number(p.monto_esperado);
    }
  }

  return { pendientes, enRevision, validados, recaudado, esperado };
}

/** Serie diaria del periodo (incluye días sin movimiento en cero). */
export function calcularEvolucionDiaria(
  pagos: PagoCuota[],
  rango: { desde: string; hasta: string },
): TotalesDia[] {
  const mapa = new Map<string, TotalesDia>();

  if (rango.desde && rango.hasta) {
    let cursor = rango.desde;
    while (cursor <= rango.hasta) {
      mapa.set(cursor, { fecha: cursor, esperado: 0, recaudado: 0, pendiente: 0, enRevision: 0 });
      cursor = sumarDiaIso(cursor);
    }
  }

  for (const p of pagos) {
    let dia = mapa.get(p.fecha);
    if (!dia) {
      dia = { fecha: p.fecha, esperado: 0, recaudado: 0, pendiente: 0, enRevision: 0 };
      mapa.set(p.fecha, dia);
    }
    if (p.estado !== "cancelado") dia.esperado += Number(p.monto_esperado);
    if (p.estado === "validado") dia.recaudado += Number(p.monto_esperado);
    if (p.estado === "pendiente") dia.pendiente += Number(p.monto_esperado);
    if (p.estado === "marcado_pendiente_validacion") dia.enRevision += Number(p.monto_esperado);
  }

  return Array.from(mapa.values()).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/** Fecha ISO de ayer respecto a `hoy` (YYYY-MM-DD). */
export function diaAnteriorIso(hoy: string): string {
  const d = new Date(`${hoy}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
