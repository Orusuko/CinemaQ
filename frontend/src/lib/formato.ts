import type { Empleado, EstadoPago } from "./tipos";

export function formatoMoneda(valor: number | null | undefined): string {
  const numero = typeof valor === "number" ? valor : 0;
  return numero.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatoFecha(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  // fecha viene como 'YYYY-MM-DD' desde Postgres; evitar desfase de zona
  // horaria al construir el Date directamente con new Date('YYYY-MM-DD').
  const [anio, mes, dia] = fecha.split("-");
  return `${dia}/${mes}/${anio}`;
}

export function formatoFechaHora(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fechaHoyInputCdmx(): string {
  // Aproximación en el cliente solo para valores por defecto de formularios.
  // La validación real de "qué día es hoy" siempre ocurre en el servidor.
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const obtener = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

export function nombreCompletoEmpleado(e: Pick<Empleado, "primer_nombre" | "segundo_nombre" | "primer_apellido" | "segundo_apellido">): string {
  return [e.primer_nombre, e.segundo_nombre, e.primer_apellido, e.segundo_apellido]
    .filter(Boolean)
    .join(" ");
}

export const ETIQUETAS_ESTADO_PAGO: Record<EstadoPago, string> = {
  pendiente: "Pendiente",
  marcado_pendiente_validacion: "En revisión",
  validado: "Validado",
  cancelado: "Cancelado",
};

export function claseEstadoPago(estado: EstadoPago): string {
  switch (estado) {
    case "validado":
      return "etiqueta etiqueta-exito";
    case "marcado_pendiente_validacion":
      return "etiqueta etiqueta-advertencia";
    case "cancelado":
      return "etiqueta etiqueta-neutral";
    default:
      return "etiqueta etiqueta-pendiente";
  }
}
