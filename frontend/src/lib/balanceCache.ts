import type { PagoCuota } from "./tipos";

/** Caché en memoria del Balance para no “refrescar” al volver a la ruta. */
interface EntradaCacheBalance {
  clave: string;
  pagos: PagoCuota[];
  rango: { desde: string; hasta: string };
}

let entrada: EntradaCacheBalance | null = null;

export function claveCacheBalance(areaIdsFiltro: string[] | null): string {
  if (!areaIdsFiltro) return "todas";
  return [...areaIdsFiltro].sort().join(",");
}

export function leerCacheBalance(clave: string): EntradaCacheBalance | null {
  if (!entrada || entrada.clave !== clave) return null;
  return entrada;
}

export function guardarCacheBalance(
  clave: string,
  pagos: PagoCuota[],
  rango: { desde: string; hasta: string },
) {
  entrada = { clave, pagos, rango };
}
