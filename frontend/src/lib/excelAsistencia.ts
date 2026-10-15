import { descargarBlob } from "./csv";

export interface HojaAsistencia {
  nombre: string;
  titulo: string;
  dias: string[]; // YYYY-MM-DD
  filas: { nombre: string; montos: (number | null)[] }[];
  totales: (number | null)[];
}

const FORMATO_MONTO = '"$"#,##0';
const BORDE = { style: "thin" as const, color: { argb: "FF9CA3AF" } };

/** Lista de asistencia lista para imprimir: una hoja por área, horizontal, ancho ajustado a una página. */
export async function descargarExcelAsistencia(nombreArchivo: string, hojas: HojaAsistencia[]): Promise<boolean> {
  try {
    // exceljs pesa ~1 MB: se carga solo al exportar.
    const { default: ExcelJS } = await import("exceljs");
    const libro = new ExcelJS.Workbook();

    for (const h of hojas) {
      const hoja = libro.addWorksheet(h.nombre.replace(/[[\]:*?/\\]/g, "").slice(0, 31) || "Hoja", {
        pageSetup: {
          orientation: "landscape",
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          horizontalCentered: true,
          margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
        },
      });
      const columnas = h.dias.length + 2; // empleado + días + total
      hoja.getColumn(1).width = 36;
      for (let c = 2; c <= columnas; c++) hoja.getColumn(c).width = 11;

      hoja.mergeCells(1, 1, 1, columnas);
      hoja.getCell(1, 1).value = h.titulo;
      hoja.getCell(1, 1).font = { bold: true, size: 14 };
      hoja.getRow(1).height = 24;

      const fechas = h.dias.map((d) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(2, 4)}`);
      hoja.addRow(["Empleado", ...fechas, "Total"]);
      hoja.getRow(2).font = { bold: true };
      hoja.getRow(2).alignment = { horizontal: "center" };
      hoja.getRow(2).eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      });

      const suma = (m: (number | null)[]) => m.reduce<number>((a, x) => a + (x ?? 0), 0);
      for (const f of h.filas) hoja.addRow([f.nombre, ...f.montos, suma(f.montos)]);
      const total = hoja.addRow(["Total", ...h.totales, suma(h.totales)]);
      total.font = { bold: true };

      hoja.eachRow((fila, n) => {
        if (n === 1) return;
        fila.eachCell({ includeEmpty: true }, (c, col) => {
          c.border = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
          if (col > 1 && n > 2) {
            c.numFmt = FORMATO_MONTO;
            c.alignment = { horizontal: "right" };
          }
        });
      });
      hoja.pageSetup.printTitlesRow = "1:2"; // el encabezado se repite en cada página
    }

    const datos = await libro.xlsx.writeBuffer();
    descargarBlob(
      nombreArchivo,
      new Blob([datos], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    );
    return true;
  } catch {
    return false;
  }
}
