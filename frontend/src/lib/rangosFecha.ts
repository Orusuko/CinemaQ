import { fechaHoyInputCdmx } from "./formato";

export type PeriodoBalance = "dia" | "semana" | "mes" | "rango";

function aIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function calcularRango(periodo: PeriodoBalance, rangoManual: { desde: string; hasta: string }): { desde: string; hasta: string } {
  const hoy = fechaHoyInputCdmx();
  const hoyDate = new Date(`${hoy}T00:00:00`);

  if (periodo === "dia") {
    return { desde: hoy, hasta: hoy };
  }

  if (periodo === "semana") {
    const diaSemana = hoyDate.getDay(); // 0 = domingo
    const offsetLunes = diaSemana === 0 ? 6 : diaSemana - 1;
    const lunes = new Date(hoyDate);
    lunes.setDate(hoyDate.getDate() - offsetLunes);
    return { desde: aIso(lunes), hasta: hoy };
  }

  if (periodo === "mes") {
    const primerDia = new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 1);
    return { desde: aIso(primerDia), hasta: hoy };
  }

  return rangoManual;
}
