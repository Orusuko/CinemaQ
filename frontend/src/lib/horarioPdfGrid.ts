/**
 * horarioPdfGrid.ts
 *
 * Reconstruye la tabla del PDF semanal (PS | Nombre | 7 fechas) a partir de
 * fragmentos de texto con coordenadas. Función pura: no lee el PDF.
 *
 * Estructura real del PDF (verificada con un horario semanal):
 *  - Encabezado de columnas con fechas ISO (YYYY-MM-DD); la página 2 lo repite.
 *  - El texto de cada celda está centrado horizontalmente y alineado arriba.
 *  - Una celda son 2 líneas (hora / área); "LIMPIEZA ENTRE FUNCIONES" usa 3.
 *  - Cada página trae un pie con "... PAG. x/y".
 */

import { normalizePs, parseFechaIso } from "./horarioReglas";

/** x,y = inicio del texto; w = ancho; y crece hacia arriba (convención PDF). */
export interface ItemTexto {
  str: string;
  x: number;
  y: number;
  w: number;
  pagina: number;
}

export interface FilaGrid {
  ps: string;
  nombre_pdf: string;
  fecha: string;
  raw_cell: string;
}

export interface MetaSemana {
  ubicacion: string | null;
  semana: number | null;
  desde: string | null;
  hasta: string | null;
  generadoEn: string | null;
}

export interface ResultadoGrid {
  filas: FilaGrid[];
  avisos: string[];
  meta: MetaSemana;
  empleados: number;
}

const TOL_LINEA = 2; // puntos: fragmentos con y parecida son la misma línea
const TOL_FILA = 6; // el contenido va alineado arriba: la 1a línea de cada celda queda a <= yPs + 6
const MAX_ALTO_FILA = 45; // más abajo del último PS que esto es pie de página
const HUECO_PALABRA = 1.5; // hueco menor a esto entre fragmentos = misma palabra (kerning)

const RE_PIE = /PAG\.\s*\d+\s*\/\s*\d+/i;
const RE_SEMANA = /^\s*(\d+)\s*,\s*(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/;
const RE_GENERADO = /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*,/;

interface Columna {
  fecha: string;
  cx: number;
}

/** Agrupa por y (tolerancia TOL_LINEA), de arriba hacia abajo; dentro de cada línea, por x. */
function agruparLineas(items: ItemTexto[]): ItemTexto[][] {
  const ordenados = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas: ItemTexto[][] = [];
  for (const it of ordenados) {
    const ultima = lineas[lineas.length - 1];
    if (ultima && Math.abs(ultima[0].y - it.y) <= TOL_LINEA) ultima.push(it);
    else lineas.push([it]);
  }
  return lineas.map((l) => l.sort((a, b) => a.x - b.x));
}

function unirLinea(linea: ItemTexto[]): string {
  let texto = "";
  linea.forEach((it, i) => {
    if (i > 0) {
      const prev = linea[i - 1];
      texto += it.x - (prev.x + prev.w) < HUECO_PALABRA ? "" : " ";
    }
    texto += it.str;
  });
  return texto.replace(/\s+/g, " ").trim();
}

function textoDe(items: ItemTexto[], separador: string): string {
  return agruparLineas(items)
    .map(unirLinea)
    .filter(Boolean)
    .join(separador);
}

function procesarPagina(
  pagina: number,
  items: ItemTexto[],
  meta: MetaSemana,
  filas: FilaGrid[],
  avisos: string[],
  psVistos: Set<string>,
): number {
  // Metadatos del pie (antes de descartarlo).
  for (const it of items) {
    if (!meta.generadoEn) {
      const g = RE_GENERADO.exec(it.str);
      if (g && RE_PIE.test(it.str)) meta.generadoEn = g[1];
    }
  }
  const util = items.filter((it) => it.str.trim() !== "" && !RE_PIE.test(it.str));

  // Encabezado: la línea con más fragmentos que son fechas ISO.
  const fechasItems = util.filter((it) => parseFechaIso(it.str) !== null);
  const grupos = agruparLineas(fechasItems);
  const lineaFechas = grupos.sort((a, b) => b.length - a.length)[0];
  if (!lineaFechas || lineaFechas.length < 2) {
    avisos.push(`Página ${pagina}: no se encontró el encabezado de fechas (se omite).`);
    return 0;
  }
  const yEnc = lineaFechas[0].y;
  const columnas: Columna[] = lineaFechas
    .map((it) => ({ fecha: parseFechaIso(it.str) as string, cx: it.x + it.w / 2 }))
    .sort((a, b) => a.cx - b.cx);
  const separacion = columnas[1].cx - columnas[0].cx;
  const limiteIzq = columnas[0].cx - separacion / 2; // a la izquierda: PS y nombre

  // Metadatos del título (fragmentos sobre el encabezado).
  const titulo = agruparLineas(util.filter((it) => it.y > yEnc + TOL_LINEA)).map(unirLinea);
  if (!meta.ubicacion && titulo[0] && !RE_SEMANA.test(titulo[0])) meta.ubicacion = titulo[0];
  for (const linea of titulo) {
    const m = RE_SEMANA.exec(linea);
    if (m && meta.semana === null) {
      meta.semana = Number(m[1]);
      meta.desde = m[2];
      meta.hasta = m[3];
    }
  }
  if (meta.desde && meta.hasta) {
    for (const c of columnas) {
      if (c.fecha < meta.desde || c.fecha > meta.hasta) {
        avisos.push(`Página ${pagina}: la columna ${c.fecha} está fuera del rango del título (${meta.desde} a ${meta.hasta}).`);
      }
    }
  }

  // Filas: un PS de 6 dígitos en la zona izquierda, antes de la columna "Nombre".
  const nombreEnc = util.find((it) => Math.abs(it.y - yEnc) <= TOL_LINEA && it.str.trim().toLowerCase() === "nombre");
  const cuerpo = util.filter((it) => it.y < yEnc - TOL_LINEA);
  const psItems = cuerpo
    .filter((it) => {
      const centro = it.x + it.w / 2;
      return centro < limiteIzq && (!nombreEnc || centro < nombreEnc.x) && normalizePs(it.str) !== null;
    })
    .sort((a, b) => b.y - a.y);
  if (psItems.length === 0) {
    avisos.push(`Página ${pagina}: tiene encabezado pero ninguna fila de empleado.`);
    return 0;
  }

  const ultimoY = psItems[psItems.length - 1].y;
  const filasPs: { ps: string; y: number; item: ItemTexto; repetido: boolean }[] = psItems.map((item) => {
    const ps = normalizePs(item.str) as string;
    const repetido = psVistos.has(ps);
    if (repetido) avisos.push(`Página ${pagina}: el PS ${ps} ya apareció antes; se conserva la primera fila.`);
    psVistos.add(ps);
    return { ps, y: item.y, item, repetido };
  });

  // Reparto de fragmentos a (fila, zona).
  const nombres: ItemTexto[][] = filasPs.map(() => []);
  const celdas: ItemTexto[][][] = filasPs.map(() => columnas.map(() => []));
  const psSet = new Set(psItems);
  for (const it of cuerpo) {
    if (psSet.has(it) || it.y < ultimoY - MAX_ALTO_FILA) continue;
    let idx = -1;
    for (let i = 0; i < filasPs.length; i++) if (filasPs[i].y + TOL_FILA >= it.y) idx = i;
    if (idx < 0) continue;
    const centro = it.x + it.w / 2;
    if (centro < limiteIzq) {
      nombres[idx].push(it);
      continue;
    }
    let mejor = 0;
    for (let c = 1; c < columnas.length; c++) {
      if (Math.abs(columnas[c].cx - centro) < Math.abs(columnas[mejor].cx - centro)) mejor = c;
    }
    celdas[idx][mejor].push(it);
  }

  let nuevos = 0;
  filasPs.forEach((fila, i) => {
    if (fila.repetido) return;
    nuevos++;
    const nombre = textoDe(nombres[i], " ");
    columnas.forEach((col, c) => {
      filas.push({ ps: fila.ps, nombre_pdf: nombre, fecha: col.fecha, raw_cell: textoDe(celdas[i][c], "\n") });
    });
  });
  return nuevos;
}

export function buildGridFromItems(items: ItemTexto[]): ResultadoGrid {
  const meta: MetaSemana = { ubicacion: null, semana: null, desde: null, hasta: null, generadoEn: null };
  const filas: FilaGrid[] = [];
  const avisos: string[] = [];
  const psVistos = new Set<string>();
  let empleados = 0;

  const paginas = [...new Set(items.map((i) => i.pagina))].sort((a, b) => a - b);
  for (const p of paginas) {
    empleados += procesarPagina(p, items.filter((i) => i.pagina === p), meta, filas, avisos, psVistos);
  }
  if (paginas.length === 0) avisos.push("El PDF no contiene texto seleccionable (¿es una imagen escaneada?).");
  return { filas, avisos, meta, empleados };
}
