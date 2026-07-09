// Utilidades de exportación CSV — generadas 100% en el cliente (sin backend
// propio), UTF-8 con BOM para compatibilidad con Excel en español.

function escaparCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (texto.includes(",") || texto.includes('"') || texto.includes("\n")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

export function filaCsv(valores: unknown[]): string {
  return valores.map(escaparCelda).join(",");
}

export function descargarCsv(nombreArchivo: string, lineas: string[]): boolean {
  try {
    const contenido = lineas.join("\r\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + contenido], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export const ENCABEZADOS_HISTORIAL = [
  "Fecha",
  "Área",
  "Número de empleado",
  "ID público",
  "Nombre público",
  "Monto esperado",
  "Estado",
  "Marcado por empleado",
  "Marcado el",
  "Validado por",
  "Validado el",
  "Origen",
  "Notas",
  "Motivo de reversión",
];

export interface FilaHistorialCsv {
  fecha: string;
  area: string;
  numero_empleado: string;
  id_publico: string;
  nombre_publico: string;
  monto_esperado: number;
  estado: string;
  marcado_por_empleado: boolean;
  marcado_empleado_en: string | null;
  validado_por_nombre: string | null;
  validado_en: string | null;
  origen: string;
  notas: string | null;
  motivo_reversion: string | null;
}

export function filaDesdeHistorial(f: FilaHistorialCsv): string {
  return filaCsv([
    f.fecha,
    f.area,
    f.numero_empleado,
    f.id_publico,
    f.nombre_publico,
    f.monto_esperado.toFixed(2),
    f.estado,
    f.marcado_por_empleado ? `Sí (${f.marcado_empleado_en ?? ""})` : "No",
    f.marcado_empleado_en ?? "",
    f.validado_por_nombre ?? "",
    f.validado_en ?? "",
    f.origen,
    f.notas ?? "",
    f.motivo_reversion ?? "",
  ]);
}

export function nombreArchivoCsv(tipo: string, area: string, desde?: string, hasta?: string): string {
  const partes = [tipo, area.toLowerCase()];
  if (desde) partes.push(desde);
  if (hasta && hasta !== desde) partes.push(hasta);
  return `${partes.join("_")}.csv`;
}
