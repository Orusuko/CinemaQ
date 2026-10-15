import { expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const descargas: { nombre: string; blob: Blob }[] = [];
vi.mock("./csv", () => ({ descargarBlob: (nombre: string, blob: Blob) => descargas.push({ nombre, blob }) }));

import { descargarExcelAsistencia } from "./excelAsistencia";

it("genera una hoja por area con huecos, totales y configuracion de impresion", async () => {
  const ok = await descargarExcelAsistencia("r.xlsx", [
    {
      nombre: "Comanderos",
      titulo: "Cuotas Comanderos",
      dias: ["2026-09-10", "2026-09-11", "2026-09-12"],
      filas: [{ nombre: "Pedro", montos: [21, null, 21] }],
      totales: [21, null, 21],
    },
    { nombre: "Corredores", titulo: "Cuotas Corredores", dias: ["2026-09-10"], filas: [], totales: [null] },
  ]);
  expect(ok).toBe(true);
  expect(descargas[0].nombre).toBe("r.xlsx");

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await descargas[0].blob.arrayBuffer());
  expect(libro.worksheets.map((h) => h.name)).toEqual(["Comanderos", "Corredores"]);

  const hoja = libro.getWorksheet("Comanderos")!;
  expect(hoja.getRow(2).values).toEqual([undefined, "Empleado", "10/09/26", "11/09/26", "12/09/26", "Total"]);
  expect(hoja.getRow(3).getCell(2).value).toBe(21);
  expect(hoja.getRow(3).getCell(3).value).toBeNull();
  expect(hoja.getRow(3).getCell(5).value).toBe(42);
  expect(hoja.getRow(4).getCell(1).value).toBe("Total");
  expect(hoja.getRow(4).getCell(5).value).toBe(42);
  expect(hoja.pageSetup.orientation).toBe("landscape");
  expect(hoja.pageSetup.fitToWidth).toBe(1);
});
