export type RolPerfil = "admin_area" | "administrador_general" | "supervision";

export interface Perfil {
  id: string;
  nombre_usuario: string;
  nombre_completo: string;
  rol: RolPerfil;
  area_id: string | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface Area {
  id: string;
  nombre: string;
  cuota_fija: number;
  activo: boolean;
}

export type EstadoEmpleado = "activo" | "inactivo";
export type PreferenciaNombre = "primer" | "segundo" | "ambos";

export interface Empleado {
  id: string;
  numero_empleado: string;
  primer_nombre: string;
  segundo_nombre: string | null;
  primer_apellido: string;
  segundo_apellido: string | null;
  pref_nombre_publico: PreferenciaNombre;
  pref_apellido_publico: PreferenciaNombre;
  area_id: string;
  estado: EstadoEmpleado;
  creado_en: string;
  actualizado_en: string;
}

export interface EmpleadoOtraArea extends Empleado {
  area_nombre: string;
}

export interface BuscarEmpleadoRespuesta {
  existe: boolean;
  id?: string;
  numero_empleado?: string;
  primer_nombre?: string;
  segundo_nombre?: string | null;
  primer_apellido?: string;
  segundo_apellido?: string | null;
  area_id?: string;
  area_nombre?: string;
  estado?: EstadoEmpleado;
  en_mi_area?: boolean;
}

export type EstadoPago = "pendiente" | "marcado_pendiente_validacion" | "validado" | "cancelado";
export type OrigenPago = "flujo_normal" | "manual_admin";

export interface PagoCuota {
  id: string;
  empleado_id: string;
  area_id: string;
  fecha: string;
  monto_esperado: number;
  marcado_por_empleado: boolean;
  marcado_empleado_en: string | null;
  validado: boolean;
  validado_por: string | null;
  validado_en: string | null;
  origen: OrigenPago;
  estado: EstadoPago;
  motivo_reversion: string | null;
  notas: string | null;
  creado_en: string;
  actualizado_en: string;
  // Campos adicionales cuando se hace join con empleados en el cliente
  empleados?: {
    numero_empleado: string;
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  };
}

export interface AsistenciaDiaria {
  id: string;
  empleado_id: string;
  area_id: string;
  fecha: string;
  registrado_por: string | null;
  creado_en: string;
  eliminado: boolean;
  eliminado_en: string | null;
  eliminado_por: string | null;
  motivo_eliminacion: string | null;
  empleados?: {
    numero_empleado: string;
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  };
}

export interface HorarioDiario {
  id: string;
  empleado_id: string;
  area_id: string;
  fecha: string;
  registrado_por: string | null;
  creado_en: string;
  empleados?: {
    numero_empleado: string;
    primer_nombre: string;
    segundo_nombre: string | null;
    primer_apellido: string;
    segundo_apellido: string | null;
  };
}

export type EstadoSolicitudArea = "pendiente" | "aprobada" | "rechazada";

export interface SolicitudCambioArea {
  id: string;
  empleado_id: string;
  area_actual_id: string;
  area_solicitada_id: string;
  solicitado_por: string;
  estado: EstadoSolicitudArea;
  resuelto_por: string | null;
  motivo: string | null;
  creado_en: string;
  resuelto_en: string | null;
  empleados?: { numero_empleado: string; primer_nombre: string; primer_apellido: string };
}

export type TipoNotificacion =
  | "pago_fuera_horario"
  | "solicitud_cambio_area"
  | "pago_en_revision_estancado"
  | "empleado_nuevo_sin_horario";

export interface Notificacion {
  id: string;
  destinatario_id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  leida: boolean;
  entidad: string | null;
  entidad_id: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
}

export interface CierrePeriodo {
  id: string;
  area_id: string;
  desde: string;
  hasta: string;
  cerrado_por: string;
  cerrado_en: string;
  monto_esperado_total: number;
  monto_validado_total: number;
  diferencia: number;
  detalle: DetalleCierreFila[];
  notas: string | null;
}

export interface DetalleCierreFila {
  fecha: string;
  area: string;
  numero_empleado: string;
  id_publico: string;
  nombre_publico: string;
  monto_esperado: number;
  estado: EstadoPago;
  marcado_por_empleado: boolean;
  marcado_empleado_en: string | null;
  validado_por: string | null;
  validado_en: string | null;
  origen: OrigenPago;
  notas: string | null;
  motivo_reversion: string | null;
}

export interface EmpleadoPublico {
  id: string;
  id_publico: string;
  nombre_publico: string;
  area_nombre: string;
}

export interface HistorialCuota {
  id: string;
  area_id: string;
  monto: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  registrado_por: string | null;
}

export interface RespuestaRpc {
  exito: boolean;
  mensaje: string;
  [clave: string]: unknown;
}

/** Cabecera de un lote de importación automática desde PDF. */
export interface ImportacionHorario {
  id: string;
  aplicado_en: string;
  aplicado_por: string | null;
  filas: number;
  perfiles?: {
    nombre_completo: string;
    nombre_usuario: string;
  } | null;
}

/** Detalle de una fila aplicada en un lote de importación. */
export interface ImportacionHorarioDetalle {
  id: string;
  importacion_id: string;
  empleado_id: string | null;
  fecha: string | null;
  area_id: string | null;
  ps: string | null;
  nombre: string | null;
  monto: number | null;
  creo_horario: boolean | null;
  asistencia_id: string | null;
}
