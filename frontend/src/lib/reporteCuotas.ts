import type { PagoCuota } from "./tipos";

/** Semana operativa jueves-miércoles (UTC, sin correr el día en México). */

export const MS_DIA = 24 * 60 * 60 * 1000;

export function aUtc(fechaIso: string): number {
  const [a, m, d] = fechaIso.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

export function deUtc(ms: number): string {
  const f = new Date(ms);
  const a = String(f.getUTCFullYear()).padStart(4, "0");
  const m = String(f.getUTCMonth() + 1).padStart(2, "0");
  const d = String(f.getUTCDate()).padStart(2, "0");
  return `${a}-${m}-${d}`;
}

export function semanaDe(fechaIso: string): { desde: string; hasta: string } {
  const ms = aUtc(fechaIso);
  const dia = new Date(ms).getUTCDay();
  const retroceso = (dia - 4 + 7) % 7;
  const desdeMs = ms - retroceso * MS_DIA;
  return { desde: deUtc(desdeMs), hasta: deUtc(desdeMs + 6 * MS_DIA) };
}

/** Suma por estado; los cancelados no cuentan. */
export function totalesPorEstado(pagos: PagoCuota[]): { validado: number; enRevision: number; falta: number } {
  const t = { validado: 0, enRevision: 0, falta: 0 };
  for (const p of pagos) {
    const monto = Number(p.monto_esperado) || 0;
    if (p.estado === "validado") t.validado += monto;
    else if (p.estado === "marcado_pendiente_validacion") t.enRevision += monto;
    else if (p.estado === "pendiente") t.falta += monto;
  }
  return t;
}

export interface ListaAsistenciaArea {
  areaId: string;
  filas: { empleadoId: string; montos: (number | null)[] }[];
  totales: (number | null)[];
}

/** Monto por día (null = sin cuota) de cada empleado, separado por área; los cancelados no cuentan. */
export function listaAsistencia(
  pagos: PagoCuota[],
  desde: string,
  hasta: string,
): { dias: string[]; areas: ListaAsistenciaArea[] } {
  const dias: string[] = [];
  for (let ms = aUtc(desde); ms <= aUtc(hasta); ms += MS_DIA) dias.push(deUtc(ms));
  const columna = new Map(dias.map((d, i) => [d, i]));

  const areas = new Map<string, ListaAsistenciaArea>();
  const filas = new Map<string, ListaAsistenciaArea["filas"][number]>();
  for (const p of pagos) {
    const i = columna.get(p.fecha);
    if (p.estado === "cancelado" || i === undefined) continue;
    let area = areas.get(p.area_id);
    if (!area) {
      area = { areaId: p.area_id, filas: [], totales: dias.map(() => null) };
      areas.set(p.area_id, area);
    }
    const clave = `${p.area_id}|${p.empleado_id}`;
    let fila = filas.get(clave);
    if (!fila) {
      fila = { empleadoId: p.empleado_id, montos: dias.map(() => null) };
      filas.set(clave, fila);
      area.filas.push(fila);
    }
    const monto = Number(p.monto_esperado) || 0;
    fila.montos[i] = (fila.montos[i] ?? 0) + monto;
    area.totales[i] = (area.totales[i] ?? 0) + monto;
  }
  return { dias, areas: [...areas.values()] };
}

export interface FilaEmpleadoReporte {
  empleadoId: string;
  areaId: string;
  dias: number;
  esperado: number;
  validado: number;
  falta: number;
  enRevision: number;
}

export interface SemanaReporte {
  desde: string;
  hasta: string;
  filas: FilaEmpleadoReporte[];
  esperado: number;
  validado: number;
  falta: number;
  enRevision: number;
}

export function agruparReporte(pagos: PagoCuota[]): SemanaReporte[] {
  const semanas = new Map<string, SemanaReporte>();
  const filasPorClave = new Map<string, FilaEmpleadoReporte>();

  for (const p of pagos) {
    if (p.estado === "cancelado") continue;
    const { desde, hasta } = semanaDe(p.fecha);
    let semana = semanas.get(desde);
    if (!semana) {
      semana = { desde, hasta, filas: [], esperado: 0, validado: 0, falta: 0, enRevision: 0 };
      semanas.set(desde, semana);
    }
    const clave = `${desde}|${p.empleado_id}`;
    let fila = filasPorClave.get(clave);
    if (!fila) {
      fila = { empleadoId: p.empleado_id, areaId: p.area_id, dias: 0, esperado: 0, validado: 0, falta: 0, enRevision: 0 };
      filasPorClave.set(clave, fila);
      semana.filas.push(fila);
    }
    const monto = Number(p.monto_esperado) || 0;
    fila.dias += 1;
    if (p.estado === "validado") {
      fila.validado += monto;
      semana.validado += monto;
    } else if (p.estado === "pendiente") {
      fila.falta += monto;
      semana.falta += monto;
    } else if (p.estado === "marcado_pendiente_validacion") {
      fila.enRevision += monto;
      semana.enRevision += monto;
    }
    fila.esperado = fila.validado + fila.falta + fila.enRevision;
    semana.esperado = semana.validado + semana.falta + semana.enRevision;
  }

  const resultado = [...semanas.values()].sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : 0));
  for (const s of resultado) {
    s.filas.sort((a, b) => (a.empleadoId < b.empleadoId ? -1 : a.empleadoId > b.empleadoId ? 1 : 0));
  }
  return resultado;
}
