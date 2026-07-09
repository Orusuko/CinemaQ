import { formatoFecha, formatoMoneda, ETIQUETAS_ESTADO_PAGO } from "./formato";
import type { Area } from "./tipos";

export interface PerfilAuditoria {
  id: string;
  nombre_completo: string;
  nombre_usuario: string;
}

export interface LogAuditoria {
  id: string;
  usuario_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: Record<string, unknown> | null;
  creado_en: string;
}

const ETIQUETAS_ENTIDAD: Record<string, string> = {
  pagos_cuota: "Pago de cuota",
  perfiles: "Usuario",
  empleados: "Empleado",
  asistencia_diaria: "Asistencia",
  areas: "Área",
  historial_cuotas: "Cuota",
  solicitudes_cambio_area: "Solicitud de área",
  cierres_periodo: "Cierre de periodo",
  notificaciones: "Notificación",
};

const ETIQUETAS_VERBO: Record<string, string> = {
  creado: "creado",
  insertado: "registrado",
  actualizado: "modificado",
  eliminado: "eliminado",
  revertido: "revertido",
  validado: "validado",
  rechazado: "rechazado",
};

export type TipoAccionAuditoria = "creacion" | "edicion" | "eliminacion" | "otro";

export function tipoAccionAuditoria(accion: string): TipoAccionAuditoria {
  if (accion.includes("eliminado") || accion.includes("rechazado")) return "eliminacion";
  if (accion.includes("creado") || accion.includes("insertado")) return "creacion";
  if (accion.includes("actualizado") || accion.includes("validado") || accion.includes("revertido")) return "edicion";
  return "otro";
}

export function claseEtiquetaAccion(accion: string): string {
  switch (tipoAccionAuditoria(accion)) {
    case "creacion":
      return "etiqueta etiqueta-exito";
    case "eliminacion":
      return "etiqueta etiqueta-peligro";
    case "edicion":
      return "etiqueta etiqueta-advertencia";
    default:
      return "etiqueta etiqueta-neutral";
  }
}

export function etiquetaAccion(accion: string): string {
  const conocidas: Record<string, string> = {
    pagos_cuota_creado: "Pago registrado",
    pagos_cuota_actualizado: "Pago modificado",
    pagos_cuota_eliminado: "Pago eliminado",
    perfiles_creado: "Usuario creado",
    perfiles_actualizado: "Usuario modificado",
    empleados_creado: "Empleado registrado",
    empleados_actualizado: "Empleado modificado",
    asistencia_diaria_creado: "Asistencia registrada",
    asistencia_diaria_actualizado: "Asistencia modificada",
    asistencia_diaria_eliminado: "Asistencia eliminada",
  };
  if (conocidas[accion]) return conocidas[accion];

  const partes = accion.split("_");
  const verbo = partes.pop() ?? "";
  const entidad = partes.join("_");
  const nombreEntidad = ETIQUETAS_ENTIDAD[entidad] ?? entidad.replace(/_/g, " ");
  const nombreVerbo = ETIQUETAS_VERBO[verbo] ?? verbo;
  return `${nombreEntidad} ${nombreVerbo}`;
}

export function etiquetaEntidad(entidad: string): string {
  return ETIQUETAS_ENTIDAD[entidad] ?? entidad.replace(/_/g, " ");
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function objetoPrincipal(detalle: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detalle) return null;
  for (const clave of ["eliminado", "insertado", "creado", "nuevo", "actualizado", "anterior", "revertido"]) {
    const valor = detalle[clave];
    if (esObjeto(valor)) return valor;
  }
  return detalle;
}

function nombreDesdeRegistro(reg: Record<string, unknown>): string | null {
  const partes = [
    reg.primer_nombre,
    reg.segundo_nombre,
    reg.primer_apellido,
    reg.segundo_apellido,
  ].filter((p) => typeof p === "string" && p);
  if (partes.length > 0) return partes.join(" ");
  if (typeof reg.nombre_completo === "string") return reg.nombre_completo;
  if (typeof reg.nombre_usuario === "string") return reg.nombre_usuario;
  if (typeof reg.numero_empleado === "string") return `Empleado #${reg.numero_empleado}`;
  return null;
}

function nombreArea(areaId: unknown, areas: Area[]): string | null {
  if (typeof areaId !== "string") return null;
  return areas.find((a) => a.id === areaId)?.nombre ?? null;
}

function textoEstado(estado: unknown): string | null {
  if (typeof estado !== "string") return null;
  return ETIQUETAS_ESTADO_PAGO[estado as keyof typeof ETIQUETAS_ESTADO_PAGO] ?? estado;
}

export function resumirLogAuditoria(
  log: LogAuditoria,
  areas: Area[],
): string {
  const reg = objetoPrincipal(log.detalle);
  const fragmentos: string[] = [];

  if (reg) {
    const sujeto = nombreDesdeRegistro(reg);
    if (sujeto) fragmentos.push(sujeto);

    const area = nombreArea(reg.area_id, areas);
    if (area) fragmentos.push(`Área: ${area}`);

    if (typeof reg.fecha === "string") fragmentos.push(`Fecha del movimiento: ${formatoFecha(reg.fecha)}`);

    if (reg.monto_esperado !== undefined && reg.monto_esperado !== null) {
      fragmentos.push(`Monto: ${formatoMoneda(Number(reg.monto_esperado))}`);
    }

    const estado = textoEstado(reg.estado);
    if (estado) fragmentos.push(`Estado: ${estado}`);

    if (typeof reg.rol === "string") fragmentos.push(`Rol: ${reg.rol.replace(/_/g, " ")}`);

    if (typeof reg.motivo_eliminacion === "string" && reg.motivo_eliminacion) {
      fragmentos.push(`Motivo: ${reg.motivo_eliminacion}`);
    }
    if (typeof reg.motivo_reversion === "string" && reg.motivo_reversion) {
      fragmentos.push(`Motivo: ${reg.motivo_reversion}`);
    }
    if (typeof reg.notas === "string" && reg.notas) {
      fragmentos.push(`Notas: ${reg.notas}`);
    }
  }

  if (log.detalle && esObjeto(log.detalle.anterior) && esObjeto(log.detalle.nuevo)) {
    const ant = log.detalle.anterior;
    const nue = log.detalle.nuevo;
    if (ant.estado !== nue.estado) {
      fragmentos.push(`Estado: ${textoEstado(ant.estado) ?? ant.estado} → ${textoEstado(nue.estado) ?? nue.estado}`);
    }
  }

  if (fragmentos.length === 0) {
    return `Registro sobre ${etiquetaEntidad(log.entidad).toLowerCase()}.`;
  }

  return fragmentos.join(" · ");
}

export function nombreActor(log: LogAuditoria, perfiles: Map<string, PerfilAuditoria>): string {
  if (!log.usuario_id) return "Sistema";
  const perfil = perfiles.get(log.usuario_id);
  if (!perfil) return "Usuario desconocido";
  return perfil.nombre_completo || perfil.nombre_usuario;
}

export function detalleTecnicoFormateado(detalle: Record<string, unknown> | null): string {
  if (!detalle) return "Sin detalle adicional.";
  return JSON.stringify(detalle, null, 2);
}

/**
 * Intenta extraer un area_id del detalle JSON del log de auditoría.
 * Busca en el objeto principal y sub-objetos comunes (insertado, eliminado, nuevo, anterior).
 */
export function extraerAreaIdLog(log: LogAuditoria): string | null {
  if (!log.detalle) return null;
  // Buscar area_id en el nivel raíz o en sub-objetos comunes
  const fuentes = [
    log.detalle,
    ...(["insertado", "eliminado", "creado", "nuevo", "anterior", "actualizado", "revertido"] as const)
      .map((k) => log.detalle?.[k])
      .filter(esObjeto),
  ];
  for (const fuente of fuentes) {
    if (typeof fuente.area_id === "string") return fuente.area_id;
  }
  return null;
}

