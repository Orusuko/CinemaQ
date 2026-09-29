/**
 * Prueba local con un PDF real de horario (sem37.pdf en la raíz del repo).
 * El PDF NO se versiona (tiene datos de empleados): si no existe, la prueba se omite.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { buildContractRecord } from "./horarioReglas";
import { buildGridFromItems } from "./horarioPdfGrid";
import { extraerItemsPdf, type PdfjsLike } from "./horarioPdf";

const ruta = fileURLToPath(new URL("../../../sem37.pdf", import.meta.url));

it.skipIf(!existsSync(ruta))("lee sem37.pdf con las cifras esperadas", async () => {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsLike;
  const buf = readFileSync(ruta);
  const datos = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const items = await extraerItemsPdf(pdfjs, datos);
  const grid = buildGridFromItems(items);

  expect(grid.avisos).toEqual([]);
  expect(grid.meta).toMatchObject({ semana: 37, desde: "2026-09-10", hasta: "2026-09-16" });
  expect(grid.empleados).toBe(39);
  expect(grid.filas.length).toBe(273);

  const filas = grid.filas.map(buildContractRecord);
  const cuenta = (pred: (f: (typeof filas)[number]) => boolean) => filas.filter(pred).length;
  expect(cuenta((f) => f.clasificacion === "candidato_cuota")).toBe(47);
  expect(cuenta((f) => f.clasificacion === "candidato_cuota" && f.area_cinema === "comanderos")).toBe(22);
  expect(cuenta((f) => f.clasificacion === "candidato_cuota" && f.area_cinema === "corredores")).toBe(25);
  expect(cuenta((f) => f.clasificacion === "sin_cuota_omitir")).toBe(13);
  expect(cuenta((f) => f.clasificacion === "revisar")).toBe(0);
  expect(cuenta((f) => f.estado.normalize("NFD").replace(/\p{Diacritic}/gu, "") === "VACACION")).toBe(11);
});
