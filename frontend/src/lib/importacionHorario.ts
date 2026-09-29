/**
 * importacionHorario.ts
 *
 * Resuelve, contra el estado EN VIVO de Supabase, qué acción corresponde a
 * cada fila del "contrato crudo" que produce `parse_horario_v2.py` a partir
 * del PDF semanal de horarios.
 *
 * Por qué vive aquí y no en el script Python: la pregunta "¿ya existe este
 * horario/asistencia?" solo se puede responder con datos frescos de
 * CinemaQ. Si esa comparación se hiciera con un snapshot tomado cuando se
 * generó el PDF, cualquier registro manual hecho después (en Horario o
 * Asistencia) quedaría invisible y se duplicaría. Por eso esta función se
 * corre en el navegador, en el momento de subir el JSON, con datos
 * recién consultados.
 *
 * Este archivo es puro (sin llamadas a Supabase): recibe los datos ya
 * cargados y regresa el resultado. Las consultas viven en la pantalla
 * `ImportarHorario.tsx`.
 */

import type { Area, AsistenciaDiaria, Empleado, HistorialCuota, HorarioDiario, PagoCuota } from "./tipos";

/* ------------------------------------------------------------------ */
/* Tipos                                                                */
/* ------------------------------------------------------------------ */

export type ClasificacionCruda =
  | "revisar"
  | "ignorar_area"
  | "sin_cuota_omitir"
  | "candidato_cuota"
  | "ignorar";

/** Una fila del JSON "crudo" producido por parse_horario_v2.py. */
export interface FilaContratoCrudo {
  ps: string;
  nombre_pdf: string;
  fecha: string; // YYYY-MM-DD
  hora_inicio: string | null;
  hora_fin: string | null;
  area_pdf: string | null;
  area_cinema: "comanderos" | "corredores" | null;
  estado: string;
  genera_cuota: boolean;
  clasificacion: ClasificacionCruda;
  motivos: string[];
  confidence: number;
  raw_cell: string;
}

export type AccionImportacion =
  | "crear"
  | "skip_ya_existe"
  | "conflicto"
  | "revisar"
  | "ignorar"
  | "ignorar_area"
  | "sin_cuota_omitir"
  | "empleado_no_encontrado";

export interface FilaResuelta extends FilaContratoCrudo {
  accion: AccionImportacion;
  motivos_resolucion: string[];
  empleado_id: string | null;
  nombre_empleado_bd: string | null;
  advertencia_nombre: boolean;
  area_id: string | null;
  nombre_area: string | null;
  monto_esperado: number | null;
  monto_esperado_es_fallback: boolean;
  ya_tiene_horario: boolean;
  ya_tiene_asistencia: boolean;
  pago_validado: boolean;
}

/** Datos frescos de CinemaQ necesarios para resolver la importación. */
export interface ContextoImportacion {
  empleados: Empleado[];
  areas: Area[];
  historialCuotas: HistorialCuota[];
  horarios: Pick<HorarioDiario, "empleado_id" | "area_id" | "fecha">[];
  asistencias: Pick<AsistenciaDiaria, "empleado_id" | "area_id" | "fecha" | "eliminado">[];
  pagos: Pick<PagoCuota, "empleado_id" | "area_id" | "fecha" | "estado">[];
}

export interface TotalesImportacion {
  totalFilas: number;
  deberiaEstarRecaudado: number;
  yaRegistrado: number;
  yaValidado: number;
  porCrear: number;
  montoPorCrear: number;
  conflictos: number;
  revisar: number;
  empleadosNoEncontrados: number;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

/** Igual heurística que `claseChipArea` en formato.ts, para mantener consistencia. */
function resolverArea(areaCinema: "comanderos" | "corredores" | null, areas: Area[]): Area | null {
  if (!areaCinema) return null;
  const necesita = areaCinema === "comanderos" ? "COMAND" : "CORRED";
  return areas.find((a) => normalizarTexto(a.nombre).includes(necesita)) ?? null;
}

function resolverEmpleado(ps: string, empleados: Empleado[]): Empleado | null {
  return empleados.find((e) => e.numero_empleado === ps) ?? null;
}

/** Cuota vigente en `areaId` para `fecha` (YYYY-MM-DD). Si no hay historial, cae en `area.cuota_fija` actual. */
function resolverMontoEsperado(
  areaId: string,
  fecha: string,
  historial: HistorialCuota[],
  area: Area,
): { monto: number; esFallback: boolean } {
  const vigentes = historial.filter(
    (h) => h.area_id === areaId && h.vigente_desde <= fecha && (h.vigente_hasta === null || fecha <= h.vigente_hasta),
  );
  if (vigentes.length === 0) {
    return { monto: area.cuota_fija, esFallback: true };
  }
  // Si hay más de una vigencia solapada (no debería), toma la más reciente.
  const mejor = vigentes.reduce((a, b) => (a.vigente_desde > b.vigente_desde ? a : b));
  return { monto: mejor.monto, esFallback: false };
}

function nombresParecen(nombrePdf: string, empleado: Empleado): boolean {
  const pdfTokens = new Set(normalizarTexto(nombrePdf).split(/\s+/).filter(Boolean));
  const bdTokens = normalizarTexto(
    [empleado.primer_nombre, empleado.segundo_nombre, empleado.primer_apellido, empleado.segundo_apellido]
      .filter(Boolean)
      .join(" "),
  )
    .split(/\s+/)
    .filter(Boolean);
  if (pdfTokens.size === 0 || bdTokens.length === 0) return true; // sin datos suficientes, no marcar advertencia
  const coincidencias = bdTokens.filter((t) => pdfTokens.has(t)).length;
  return coincidencias >= 1;
}

/* ------------------------------------------------------------------ */
/* Resolución principal                                                */
/* ------------------------------------------------------------------ */

export function resolverFilaImportacion(fila: FilaContratoCrudo, ctx: ContextoImportacion): FilaResuelta {
  const base: FilaResuelta = {
    ...fila,
    accion: "ignorar",
    motivos_resolucion: [],
    empleado_id: null,
    nombre_empleado_bd: null,
    advertencia_nombre: false,
    area_id: null,
    nombre_area: null,
    monto_esperado: null,
    monto_esperado_es_fallback: false,
    ya_tiene_horario: false,
    ya_tiene_asistencia: false,
    pago_validado: false,
  };

  if (fila.clasificacion === "ignorar") return { ...base, accion: "ignorar" };
  if (fila.clasificacion === "ignorar_area") return { ...base, accion: "ignorar_area" };
  if (fila.clasificacion === "sin_cuota_omitir") return { ...base, accion: "sin_cuota_omitir" };
  if (fila.clasificacion === "revisar") return { ...base, accion: "revisar", motivos_resolucion: fila.motivos };

  // clasificacion === "candidato_cuota"
  const empleado = resolverEmpleado(fila.ps, ctx.empleados);
  if (!empleado) {
    return {
      ...base,
      accion: "empleado_no_encontrado",
      motivos_resolucion: [`No existe ningún empleado con número ${fila.ps} en CinemaQ.`],
    };
  }

  const advertenciaNombre = !nombresParecen(fila.nombre_pdf, empleado);
  const nombreEmpleadoBd = [empleado.primer_nombre, empleado.segundo_nombre, empleado.primer_apellido, empleado.segundo_apellido]
    .filter(Boolean)
    .join(" ");

  const area = resolverArea(fila.area_cinema, ctx.areas);
  if (!area) {
    return {
      ...base,
      empleado_id: empleado.id,
      nombre_empleado_bd: nombreEmpleadoBd,
      advertencia_nombre: advertenciaNombre,
      accion: "revisar",
      motivos_resolucion: [`No se pudo resolver el área "${fila.area_pdf}" contra la tabla areas.`],
    };
  }

  const { monto, esFallback } = resolverMontoEsperado(area.id, fila.fecha, ctx.historialCuotas, area);

  const horarioExistente = ctx.horarios.find((h) => h.empleado_id === empleado.id && h.fecha === fila.fecha);
  const asistenciaExistente = ctx.asistencias.find(
    (a) => a.empleado_id === empleado.id && a.fecha === fila.fecha && !a.eliminado,
  );
  const pagoExistente = ctx.pagos.find((p) => p.empleado_id === empleado.id && p.fecha === fila.fecha);
  const pagoValidado = pagoExistente?.estado === "validado";

  const comun = {
    empleado_id: empleado.id,
    nombre_empleado_bd: nombreEmpleadoBd,
    advertencia_nombre: advertenciaNombre,
    area_id: area.id,
    nombre_area: area.nombre,
    monto_esperado: monto,
    monto_esperado_es_fallback: esFallback,
    ya_tiene_horario: Boolean(horarioExistente),
    ya_tiene_asistencia: Boolean(asistenciaExistente),
    pago_validado: pagoValidado,
  };

  // ¿El área ya registrada (horario o pago) difiere de la que dice el PDF hoy?
  const areaRegistradaDifiere =
    (horarioExistente && horarioExistente.area_id !== area.id) ||
    (pagoExistente && pagoExistente.area_id !== area.id);

  if (asistenciaExistente) {
    if (areaRegistradaDifiere) {
      return {
        ...base,
        ...comun,
        accion: "conflicto",
        motivos_resolucion: [
          pagoValidado
            ? "Ya existe un pago VALIDADO para ese día con un área distinta a la del PDF: no se sobreescribe."
            : "Ya existe asistencia/pago para ese día con un área distinta a la del PDF: requiere revisión manual.",
        ],
      };
    }
    return {
      ...base,
      ...comun,
      accion: "skip_ya_existe",
      motivos_resolucion: ["Ya existe horario y asistencia para ese día (registrado a mano o por una importación previa)."],
    };
  }

  if (horarioExistente && areaRegistradaDifiere) {
    return {
      ...base,
      ...comun,
      accion: "conflicto",
      motivos_resolucion: ["Existe horario para ese día con un área distinta a la del PDF: requiere revisión manual."],
    };
  }

  return {
    ...base,
    ...comun,
    accion: "crear",
    motivos_resolucion: [
      comun.ya_tiene_horario
        ? "Ya tiene horario ese día; falta registrar asistencia."
        : "No tiene horario ni asistencia ese día: se crearán ambos.",
    ],
  };
}

export function resolverImportacion(filas: FilaContratoCrudo[], ctx: ContextoImportacion): FilaResuelta[] {
  return filas.map((f) => resolverFilaImportacion(f, ctx));
}

export function calcularTotales(filas: FilaResuelta[]): TotalesImportacion {
  const totales: TotalesImportacion = {
    totalFilas: filas.length,
    deberiaEstarRecaudado: 0,
    yaRegistrado: 0,
    yaValidado: 0,
    porCrear: 0,
    montoPorCrear: 0,
    conflictos: 0,
    revisar: 0,
    empleadosNoEncontrados: 0,
  };

  for (const f of filas) {
    if (f.monto_esperado !== null && (f.accion === "crear" || f.accion === "skip_ya_existe" || f.accion === "conflicto")) {
      totales.deberiaEstarRecaudado += f.monto_esperado;
    }
    switch (f.accion) {
      case "skip_ya_existe":
        totales.yaRegistrado += 1;
        if (f.pago_validado) totales.yaValidado += 1;
        break;
      case "crear":
        totales.porCrear += 1;
        totales.montoPorCrear += f.monto_esperado ?? 0;
        break;
      case "conflicto":
        totales.conflictos += 1;
        break;
      case "revisar":
        totales.revisar += 1;
        break;
      case "empleado_no_encontrado":
        totales.empleadosNoEncontrados += 1;
        break;
      default:
        break;
    }
  }

  return totales;
}
