import { descargarBlob } from "./csv";

export interface HojaAsistencia {
  nombre: string;
  periodo: string; // "Catorcena 17", "Semana 34", "Día 10/09/2026"…
  titulo: string;
  dias: string[]; // YYYY-MM-DD
  filas: { nombre: string; montos: (number | null)[] }[];
  totales: (number | null)[];
}

const FILA_ENCABEZADO = 3;
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

      // Fila 1: catorcena/semana/día (para ubicar la hoja impresa); fila 2: área y fechas; fila 3: encabezado.
      [h.periodo, h.titulo].forEach((texto, i) => {
        hoja.mergeCells(i + 1, 1, i + 1, columnas);
        hoja.getCell(i + 1, 1).value = texto;
        hoja.getCell(i + 1, 1).font = { bold: true, size: i === 0 ? 18 : 12 };
        hoja.getRow(i + 1).height = i === 0 ? 28 : 20;
      });

      const fechas = h.dias.map((d) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(2, 4)}`);
      hoja.addRow(["Empleado", ...fechas, "Total"]);
      hoja.getRow(FILA_ENCABEZADO).font = { bold: true };
      hoja.getRow(FILA_ENCABEZADO).alignment = { horizontal: "center" };
      hoja.getRow(FILA_ENCABEZADO).eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      });

      const suma = (m: (number | null)[]) => m.reduce<number>((a, x) => a + (x ?? 0), 0);
      for (const f of h.filas) hoja.addRow([f.nombre, ...f.montos, suma(f.montos)]);
      const total = hoja.addRow(["Total", ...h.totales, suma(h.totales)]);
      total.font = { bold: true };

      hoja.eachRow((fila, n) => {
        if (n < FILA_ENCABEZADO) return;
        fila.eachCell({ includeEmpty: true }, (c, col) => {
          c.border = { top: BORDE, bottom: BORDE, left: BORDE, right: BORDE };
          if (col > 1 && n > FILA_ENCABEZADO) {
            c.numFmt = FORMATO_MONTO;
            c.alignment = { horizontal: "right" };
          }
        });
      });
      hoja.pageSetup.printTitlesRow = `1:${FILA_ENCABEZADO}`; // se repite en cada página impresa
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
