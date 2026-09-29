/**
 * horarioPdf.ts
 *
 * Lee en el navegador el PDF semanal de horarios y lo convierte al contrato
 * crudo (`FilaContratoCrudo`) que consume `importacionHorario.ts`.
 * pdfjs-dist se carga bajo demanda para no engordar el bundle principal.
 */

import type { FilaContratoCrudo } from "./importacionHorario";
import { buildContractRecord } from "./horarioReglas";
import { buildGridFromItems, type FilaGrid, type ItemTexto } from "./horarioPdfGrid";

type Pdfjs = typeof import("pdfjs-dist");
export type PdfjsLike = Pick<Pdfjs, "getDocument">;

export interface ResumenArchivo {
  nombre: string;
  semana: number | null;
  desde: string | null;
  hasta: string | null;
  empleados: number;
  generadoEn: string | null;
}

export interface LecturaHorarioPdf {
  filas: FilaContratoCrudo[];
  avisos: string[];
  diagnostico: FilaGrid[];
  archivos: ResumenArchivo[];
}

/** Extrae los fragmentos de texto de todas las páginas, con coordenadas. */
export async function extraerItemsPdf(pdfjs: PdfjsLike, datos: ArrayBuffer): Promise<ItemTexto[]> {
  const tarea = pdfjs.getDocument({ data: new Uint8Array(datos) });
  const doc = await tarea.promise;
  const items: ItemTexto[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const contenido = await pagina.getTextContent();
      for (const it of contenido.items) {
        if (!("str" in it) || it.str.trim() === "") continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, pagina: n });
      }
    }
  } finally {
    await tarea.destroy();
  }
  return items;
}

async function cargarPdfjs(): Promise<Pdfjs> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

export async function leerHorarioPdf(archivos: File[]): Promise<LecturaHorarioPdf> {
  const pdfjs = await cargarPdfjs();
  const avisos: string[] = [];
  const diagnostico: FilaGrid[] = [];
  const resumenes: ResumenArchivo[] = [];
  const vistos = new Set<string>();

  for (const archivo of archivos) {
    let items: ItemTexto[];
    try {
      items = await extraerItemsPdf(pdfjs, await archivo.arrayBuffer());
    } catch (e) {
      avisos.push(`${archivo.name}: no se pudo abrir el PDF (${e instanceof Error ? e.message : "error desconocido"}).`);
      continue;
    }
    const grid = buildGridFromItems(items);
    for (const a of grid.avisos) avisos.push(`${archivo.name}: ${a}`);
    resumenes.push({
      nombre: archivo.name,
      semana: grid.meta.semana,
      desde: grid.meta.desde,
      hasta: grid.meta.hasta,
      empleados: grid.empleados,
      generadoEn: grid.meta.generadoEn,
    });

    let repetidas = 0;
    for (const fila of grid.filas) {
      const clave = `${fila.ps}|${fila.fecha}`;
      if (vistos.has(clave)) {
        repetidas++;
        continue;
      }
      vistos.add(clave);
      diagnostico.push(fila);
    }
    if (repetidas > 0) {
      avisos.push(`${archivo.name}: ${repetidas} celdas ya venían en otro PDF (misma persona y fecha); se conservó la primera.`);
    }
  }

  return { filas: diagnostico.map(buildContractRecord), avisos, diagnostico, archivos: resumenes };
}
