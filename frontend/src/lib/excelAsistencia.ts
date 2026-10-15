import { descargarBlob } from "./csv";

export interface HojaAsistencia {
  nombre: string;
  periodo: string; // "Catorcena 17", "Semana 34", "Día 10/09/2026"…
  titulo: string;
  dias: string[]; // YYYY-MM-DD
  filas: { nombre: string; montos: (number | null)[] }[];
  totales: (number | null)[];
}

const FILA_DIA = 3;
const FILA_FECHA = 4;
const FORMATO_MONTO = '"$"#,##0';
const NOMBRE_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const BORDE = { style: "thin" as const, color: { argb: "FF4B5563" } };
const BORDE_TOTAL = { style: "medium" as const, color: { argb: "FF111827" } };
const RELLENO_ENCABEZADO = "FFE5E7EB";
const RELLENO_FILA = "FFF3F4F6";

function relleno(argb: string) {
  return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } };
}

function diaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return NOMBRE_DIA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
}

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

      // Fila 1: catorcena/semana/día; fila 2: área; filas 3-4: día de la semana y fecha.
      [h.periodo, h.titulo].forEach((texto, i) => {
        hoja.mergeCells(i + 1, 1, i + 1, columnas);
        hoja.getCell(i + 1, 1).value = texto;
        hoja.getCell(i + 1, 1).font = { bold: true, size: i === 0 ? 18 : 12 };
        hoja.getRow(i + 1).height = i === 0 ? 28 : 20;
      });

      hoja.mergeCells(FILA_DIA, 1, FILA_FECHA, 1);
      hoja.getCell(FILA_DIA, 1).value = "Empleado";
      hoja.getCell(FILA_DIA, 1).alignment = { vertical: "middle" };
      hoja.mergeCells(FILA_DIA, columnas, FILA_FECHA, columnas);
      hoja.getCell(FILA_DIA, columnas).value = "Total";
      hoja.getCell(FILA_DIA, columnas).alignment = { vertical: "middle", horizontal: "center" };
      h.dias.forEach((d, i) => {
        hoja.getCell(FILA_DIA, i + 2).value = diaSemana(d);
        hoja.getCell(FILA_FECHA, i + 2).value = `${d.slice(8)}/${d.slice(5, 7)}`;
      });

      const suma = (m: (number | null)[]) => m.reduce<number>((a, x) => a + (x ?? 0), 0);
      for (const f of h.filas) hoja.addRow([f.nombre, ...f.montos, suma(f.montos)]);
      const total = hoja.addRow(["Total", ...h.totales, suma(h.totales)]);
      const filaTotal = total.number;

      hoja.eachRow((fila, n) => {
        if (n < FILA_DIA) return;
        const esTotal = n === filaTotal;
        const esZebra = n > FILA_FECHA && !esTotal && (n - FILA_FECHA) % 2 === 0;
        fila.eachCell({ includeEmpty: true }, (c, col) => {
          c.border = { top: esTotal ? BORDE_TOTAL : BORDE, bottom: BORDE, left: BORDE, right: BORDE };
          if (n <= FILA_FECHA || esTotal) c.fill = relleno(RELLENO_ENCABEZADO);
          else if (esZebra) c.fill = relleno(RELLENO_FILA);
          if (n <= FILA_FECHA) c.font = { bold: true };
          if (col > 1 && col < columnas && n <= FILA_FECHA) c.alignment = { horizontal: "center" };
          if (col > 1 && n > FILA_FECHA) {
            c.numFmt = FORMATO_MONTO;
            c.alignment = { horizontal: "right" };
          }
        });
      });
      total.font = { bold: true };
      hoja.pageSetup.printTitlesRow = `1:${FILA_FECHA}`; // se repite en cada página impresa
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
