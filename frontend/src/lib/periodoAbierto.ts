import { fechaHoyInputCdmx } from "./formato";

/* ------------------------------------------------------------------ */
/* Helpers puros para el periodo contable abierto                      */
/* ------------------------------------------------------------------ */

/** Suma 1 día a una fecha ISO `YYYY-MM-DD`. */
export function sumarDiaIso(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Primer día del mes de `hoy` como fecha ISO. */
export function primerDiaMesActual(hoy: string): string {
  const [anio, mes] = hoy.split("-");
  return `${anio}-${mes}-01`;
}

/**
 * Calcula el rango del periodo contable abierto.
 *
 * - Con cierre previo: desde = último cierre.hasta + 1 día → hoy.
 * - Sin cierre previo: desde = primer día del mes actual → hoy.
 */
export function calcularPeriodoAbierto(
  ultimoCierre: { hasta: string } | null,
  hoy: string,
): { desde: string; hasta: string } {
  const desde = ultimoCierre
    ? sumarDiaIso(ultimoCierre.hasta)
    : primerDiaMesActual(hoy);
  return { desde, hasta: hoy };
}

/**
 * Obtiene el `hasta` más antiguo entre un conjunto de últimos cierres
 * por área. Esto garantiza que al filtrar «ambas áreas», el periodo
 * abierto incluya la deuda más vieja de cualquier área.
 *
 * Si alguna área no tiene cierre, devuelve `null` → fallback al mes.
 */
export function cierreMasAntiguoEntre(
  cierres: { hasta: string }[],
): { hasta: string } | null {
  if (cierres.length === 0) return null;
  let menor = cierres[0].hasta;
  for (const c of cierres) {
    if (c.hasta < menor) menor = c.hasta;
  }
  return { hasta: menor };
}

/**
 * Formato legible del rango del periodo para el subtítulo del Balance.
 * Ejemplo: «1 jul – 14 jul 2026»
 */
export function formatoRangoPeriodo(desde: string, hasta: string): string {
  const opciones: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  };
  const fmt = new Intl.DateTimeFormat("es-MX", opciones);
  const dDesde = new Date(`${desde}T12:00:00`);
  const dHasta = new Date(`${hasta}T12:00:00`);
  return `${fmt.format(dDesde)} – ${fmt.format(dHasta)}`;
}

/** Hoy en CDMX (re-exporta para conveniencia del Dashboard). */
export function hoyCdmx(): string {
  return fechaHoyInputCdmx();
}
