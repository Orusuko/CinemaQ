import { expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const descargas: { nombre: string; blob: Blob }[] = [];
vi.mock("./csv", () => ({ descargarBlob: (nombre: string, blob: Blob) => descargas.push({ nombre, blob }) }));

import { descargarExcelAsistencia } from "./excelAsistencia";

it("genera una hoja por area con huecos, totales y configuracion de impresion", async () => {
  const ok = await descargarExcelAsistencia("r.xlsx", [
    {
      nombre: "Comanderos",
      periodo: "Semana 34",
      titulo: "Cuotas Comanderos",
      dias: ["2026-09-10", "2026-09-11", "2026-09-12"],
      filas: [
        { nombre: "Pedro", montos: [21, null, 21] },
        { nombre: "Ana", montos: [null, 21, null] },
      ],
      totales: [21, 21, 21],
    },
    { nombre: "Corredores", periodo: "Semana 34", titulo: "Cuotas Corredores", dias: ["2026-09-10"], filas: [], totales: [null] },
  ]);
  expect(ok).toBe(true);
  expect(descargas[0].nombre).toBe("r.xlsx");

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await descargas[0].blob.arrayBuffer());
  expect(libro.worksheets.map((h) => h.name)).toEqual(["Comanderos", "Corredores"]);

  const hoja = libro.getWorksheet("Comanderos")!;
  expect(hoja.getCell(3, 2).value).toBe("Jue");
  expect(hoja.getCell(3, 4).value).toBe("Sáb");
  expect(hoja.getCell(4, 2).value).toBe("10/09");
  expect(hoja.getRow(5).getCell(2).value).toBe(21);
  expect(hoja.getRow(5).getCell(3).value).toBeNull();
  expect(hoja.getRow(5).getCell(5).value).toBe(42);
  expect(hoja.getRow(6).getCell(1).fill).toMatchObject({ fgColor: { argb: "FFF3F4F6" } });
  expect(hoja.getRow(7).getCell(1).value).toBe("Total");
  expect(hoja.getRow(7).getCell(5).value).toBe(63);
  expect(hoja.getRow(7).getCell(1).border?.top?.style).toBe("medium");
  expect(hoja.getRow(5).getCell(2).border?.left?.color).toMatchObject({ argb: "FF4B5563" });
  expect(hoja.getCell(1, 1).value).toBe("Semana 34");
  expect(hoja.getCell(2, 1).value).toBe("Cuotas Comanderos");
  expect(hoja.pageSetup.orientation).toBe("landscape");
  expect(hoja.pageSetup.fitToWidth).toBe(1);
});

