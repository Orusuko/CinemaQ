import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import { descargarCsv, filaCsv } from "../../lib/csv";
import ModalConfirmacion from "../../components/ModalConfirmacion";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import Tabs from "../../components/Tabs";
import ChipArea from "../../components/ChipArea";
import { IconoArchivo, IconoDescarga, IconoDeshacer, IconoSubir } from "../../components/Iconos";
import {
  calcularTotales,
  resolverImportacion,
  type ContextoImportacion,
  type FilaContratoCrudo,
  type FilaResuelta,
} from "../../lib/importacionHorario";
import { leerHorarioPdf, type LecturaHorarioPdf } from "../../lib/horarioPdf";
import type { Area, AsistenciaDiaria, Empleado, HistorialCuota, HorarioDiario, PagoCuota, RespuestaRpc } from "../../lib/tipos";

/** Solo recuerda el id del último lote de este navegador; la fuente de verdad es la BD. */
const CLAVE_LOTE = "cinemaquote_importacion_ultimo_lote_v2";

interface LoteLocal {
  importacion_id: string;
  aplicado_en: string;
  filas: number;
}

interface DetalleLote {
  empleado_id: string | null;
  fecha: string | null;
  area_id: string | null;
  asistencia_id: string | null;
  creo_horario: boolean | null;
}

interface FilaResultadoAplicacion {
  fila: FilaResuelta;
  resultado: "creado" | "error";
  error?: string;
}

interface ResultadoAplicacion {
  aplicado_en: string;
  filas: FilaResultadoAplicacion[];
}

interface RespuestaLoteImportacion {
  importacion_id: string;
  creadas: number;
  errores: { fecha?: string; ps?: string; error?: string }[];
}

type PestanaImportar = "crear" | "conflictos" | "revisar" | "registrado";

function cargarLoteGuardado(): LoteLocal | null {
  try {
    const texto = localStorage.getItem(CLAVE_LOTE);
    if (!texto) return null;
    const parseado = JSON.parse(texto) as LoteLocal;
    if (!parseado?.importacion_id) return null;
    return parseado;
  } catch {
    return null;
  }
}

function guardarLote(lote: LoteLocal | null) {
  try {
    if (lote && lote.importacion_id) {
      localStorage.setItem(CLAVE_LOTE, JSON.stringify(lote));
    } else {
      localStorage.removeItem(CLAVE_LOTE);
    }
  } catch {
    /* localStorage no disponible: el botón de deshacer no persiste entre recargas */
  }
}

function claveErrorFila(fecha: string, ps: string) {
  return `${fecha}__${ps}`;
}

export default function ImportarHorario({ enModal = false }: { enModal?: boolean }) {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const esAdminGeneral = perfil?.rol === "administrador_general";

  const refArchivo = useRef<HTMLInputElement>(null);
  const [archivosPdf, setArchivosPdf] = useState<File[]>([]);
  const [lecturaPdf, setLecturaPdf] = useState<LecturaHorarioPdf | null>(null);
  const [verLectura, setVerLectura] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [filas, setFilas] = useState<FilaResuelta[] | null>(null);
  const [filasCrudas, setFilasCrudas] = useState<FilaContratoCrudo[] | null>(null);
  const [pestana, setPestana] = useState<PestanaImportar>("crear");
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [loteAplicado, setLoteAplicado] = useState<LoteLocal | null>(() => cargarLoteGuardado());
  const [ultimoResultado, setUltimoResultado] = useState<ResultadoAplicacion | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [confirmarAplicar, setConfirmarAplicar] = useState(false);
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false);

  useEffect(() => {
    guardarLote(loteAplicado);
  }, [loteAplicado]);

  /** Lee los PDFs y lanza la comparación contra CinemaQ. */
  async function analizar() {
    if (archivosPdf.length === 0) {
      mostrarToast("Selecciona al menos un PDF del horario semanal.", "error");
      return;
    }
    setAnalizando(true);
    let lectura: LecturaHorarioPdf;
    try {
      lectura = await leerHorarioPdf(archivosPdf);
    } catch (e) {
      setAnalizando(false);
      mostrarToast(e instanceof Error ? `No se pudo leer el PDF: ${e.message}` : "No se pudo leer el PDF.", "error");
      return;
    }
    setLecturaPdf(lectura);
    if (lectura.filas.length === 0) {
      setAnalizando(false);
      mostrarToast("No se encontraron filas de horario en el PDF. Revisa los avisos.", "error");
      return;
    }
    await analizarFilas(lectura.filas);
  }

  /** Resuelve las filas crudas contra el estado en vivo de Supabase. Asume `analizando` ya activo. */
  async function analizarFilas(crudo: FilaContratoCrudo[]) {
    setAnalizando(true);
    try {
      const fechas = Array.from(new Set(crudo.map((f) => f.fecha))).sort();
      const desde = fechas[0];
      const hasta = fechas[fechas.length - 1];

      const [respEmpleados, respAreas, respHistorial, respHorarios, respAsistencias, respPagos] = await Promise.all([
        // Sin filtrar por estado: empleados ya inactivos hoy pudieron trabajar en el rango del PDF.
        supabase.from("empleados").select("*"),
        supabase.from("areas").select("*"),
        supabase.from("historial_cuotas").select("*"),
        supabase.from("horario_diario").select("empleado_id, area_id, fecha").gte("fecha", desde).lte("fecha", hasta),
        supabase
          .from("asistencia_diaria")
          .select("empleado_id, area_id, fecha, eliminado")
          .gte("fecha", desde)
          .lte("fecha", hasta),
        supabase.from("pagos_cuota").select("empleado_id, area_id, fecha, estado").gte("fecha", desde).lte("fecha", hasta),
      ]);

      const error =
        respEmpleados.error ??
        respAreas.error ??
        respHistorial.error ??
        respHorarios.error ??
        respAsistencias.error ??
        respPagos.error;
      if (error) {
        mostrarToast(mensajeErrorConsulta(error, "No se pudo consultar el estado actual en CinemaQ."), "error");
        return;
      }

      const ctx: ContextoImportacion = {
        empleados: (respEmpleados.data as Empleado[]) ?? [],
        areas: (respAreas.data as Area[]) ?? [],
        historialCuotas: (respHistorial.data as HistorialCuota[]) ?? [],
        horarios: (respHorarios.data as Pick<HorarioDiario, "empleado_id" | "area_id" | "fecha">[]) ?? [],
        asistencias:
          (respAsistencias.data as Pick<AsistenciaDiaria, "empleado_id" | "area_id" | "fecha" | "eliminado">[]) ?? [],
        pagos: (respPagos.data as Pick<PagoCuota, "empleado_id" | "area_id" | "fecha" | "estado">[]) ?? [],
      };

      const resueltas = resolverImportacion(crudo, ctx);
      setFilasCrudas(crudo);
      setFilas(resueltas);
      setSeleccion(new Set(resueltas.map((_, i) => i).filter((i) => resueltas[i].accion === "crear")));
      setPestana("crear");
      mostrarToast(`Análisis listo: ${resueltas.length} filas del PDF procesadas.`, "exito");
    } finally {
      setAnalizando(false);
    }
  }

  const erroresAgrupados = (() => {
    const conteo = new Map<string, number>();
    for (const r of ultimoResultado?.filas ?? []) {
      if (r.error) conteo.set(r.error, (conteo.get(r.error) ?? 0) + 1);
    }
    return Array.from(conteo.entries());
  })();

  const totales = filas ? calcularTotales(filas) : null;

  const filasCrear = (filas ?? []).map((f, i) => ({ f, i })).filter(({ f }) => f.accion === "crear");
  const filasConflicto = (filas ?? []).filter((f) => f.accion === "conflicto");
  const filasRevisar = (filas ?? []).filter((f) => f.accion === "revisar" || f.accion === "empleado_no_encontrado");
  const filasRegistrado = (filas ?? []).filter((f) => f.accion === "skip_ya_existe");

  function alternarSeleccion(indice: number) {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (copia.has(indice)) copia.delete(indice);
      else copia.add(indice);
      return copia;
    });
  }

  function alternarTodaSeleccion() {
    if (seleccion.size === filasCrear.length) {
      setSeleccion(new Set());
    } else {
      setSeleccion(new Set(filasCrear.map(({ i }) => i)));
    }
  }

  async function aplicarSeleccionadas() {
    if (!filas || seleccion.size === 0) return;
    setAplicando(true);
    const filasAAplicar = filasCrear.filter(({ i }) => seleccion.has(i)).map(({ f }) => f);
    const resultadoDetalle: FilaResultadoAplicacion[] = [];

    const incompletas = filasAAplicar.filter((f) => !f.empleado_id || !f.area_id);
    for (const f of incompletas) {
      resultadoDetalle.push({ fila: f, resultado: "error", error: "sin empleado o área resueltos" });
    }

    const validas = filasAAplicar.filter((f) => f.empleado_id && f.area_id);
    let creadas = 0;
    let fallidas = incompletas.length;

    if (validas.length > 0) {
      try {
        const payload = validas.map((f) => ({
          empleado_id: f.empleado_id,
          fecha: f.fecha,
          area_id: f.area_id,
          ps: f.ps,
          nombre: f.nombre_empleado_bd ?? f.nombre_pdf,
          monto: f.monto_esperado,
        }));

        const resp = await llamarRpc<RespuestaLoteImportacion>("registrar_lote_importacion", {
          p_filas: payload,
        });

        const mapaErrores = new Map<string, string>();
        for (const err of resp.errores ?? []) {
          mapaErrores.set(claveErrorFila(err.fecha ?? "", err.ps ?? ""), err.error ?? "error desconocido");
        }

        for (const f of validas) {
          const mensajeError = mapaErrores.get(claveErrorFila(f.fecha, f.ps));
          if (mensajeError) {
            fallidas += 1;
            resultadoDetalle.push({ fila: f, resultado: "error", error: mensajeError });
          } else {
            creadas += 1;
            resultadoDetalle.push({ fila: f, resultado: "creado" });
          }
        }

        if (resp.importacion_id && (resp.creadas ?? 0) > 0) {
          setLoteAplicado({
            importacion_id: resp.importacion_id,
            aplicado_en: new Date().toISOString(),
            filas: resp.creadas,
          });
        }

        // Ajuste por si el servidor reportó un conteo distinto al emparejado por PS/fecha.
        if (typeof resp.creadas === "number") creadas = resp.creadas;
      } catch (e) {
        const mensaje = e instanceof Error ? e.message : "desconocido";
        for (const f of validas) {
          fallidas += 1;
          resultadoDetalle.push({ fila: f, resultado: "error", error: mensaje });
        }
        creadas = 0;
      }
    }

    setUltimoResultado({ aplicado_en: new Date().toISOString(), filas: resultadoDetalle });
    setSeleccion(new Set());
    setAplicando(false);
    setConfirmarAplicar(false);

    if (fallidas === 0) {
      mostrarToast(`${creadas} obligación(es) de cuota creada(s).`, "exito");
    } else {
      mostrarToast(`${creadas} creadas; ${fallidas} con error.`, "info");
    }

    if (filasCrudas) await analizarFilas(filasCrudas);
  }

  function exportarResultadoCsv() {
    if (!ultimoResultado || ultimoResultado.filas.length === 0) return;
    const encabezados = ["PS", "Empleado", "Área", "Fecha", "Monto esperado", "Resultado", "Creó horario", "Detalle del error"];
    const lineas = [filaCsv(encabezados)];
    for (const { fila, resultado, error } of ultimoResultado.filas) {
      lineas.push(
        filaCsv([
          fila.ps,
          fila.nombre_empleado_bd ?? fila.nombre_pdf,
          fila.nombre_area ?? "—",
          fila.fecha,
          (fila.monto_esperado ?? 0).toFixed(2),
          resultado === "creado" ? "Creado" : "Error",
          fila.ya_tiene_horario ? "No (ya existía)" : "Sí",
          error ?? "",
        ]),
      );
    }
    const ok = descargarCsv(`importacion_horario_${ultimoResultado.aplicado_en.slice(0, 10)}.csv`, lineas);
    mostrarToast(ok ? "CSV descargado." : "No se pudo descargar el CSV.", ok ? "exito" : "error");
  }

  async function deshacerUltimaImportacion() {
    if (!loteAplicado?.importacion_id) return;
    setDeshaciendo(true);

    const { data, error } = await supabase
      .from("importaciones_horario_detalle")
      .select("empleado_id, fecha, area_id, asistencia_id, creo_horario")
      .eq("importacion_id", loteAplicado.importacion_id);

    if (error) {
      setDeshaciendo(false);
      setConfirmarDeshacer(false);
      mostrarToast(mensajeErrorConsulta(error, "No se pudo leer el detalle del lote para deshacer."), "error");
      return;
    }

    const detalles = (data as DetalleLote[]) ?? [];
    let deshechas = 0;
    let fallidas = 0;

    for (const fila of detalles) {
      try {
        if (fila.asistencia_id) {
          await llamarRpc<RespuestaRpc>("soft_delete_asistencia", {
            p_asistencia_id: fila.asistencia_id,
            p_motivo: "Deshecho desde Importar horario (última importación de este navegador).",
          });
        }
        if (fila.creo_horario && fila.empleado_id && fila.fecha) {
          await llamarRpc("quitar_horario", { p_empleado_id: fila.empleado_id, p_fecha: fila.fecha });
        }
        deshechas += 1;
      } catch {
        fallidas += 1;
      }
    }

    if (fallidas === 0) {
      setLoteAplicado(null);
    }
    setDeshaciendo(false);
    setConfirmarDeshacer(false);

    if (fallidas === 0) {
      mostrarToast(`Se deshicieron ${deshechas} registro(s) de la última importación.`, "exito");
    } else {
      mostrarToast(`Se deshicieron ${deshechas}; ${fallidas} no se pudieron revertir. Reintenta.`, "info");
    }

    if (filasCrudas) await analizarFilas(filasCrudas);
  }

  const pestanas = [
    { id: "crear", etiqueta: "Por crear", contador: filasCrear.length },
    { id: "conflictos", etiqueta: "Conflictos", contador: filasConflicto.length },
    { id: "revisar", etiqueta: "Revisar", contador: filasRevisar.length },
    { id: "registrado", etiqueta: "Ya registrado", contador: filasRegistrado.length },
  ];

  const textoArchivos =
    archivosPdf.length === 0
      ? "Ningún archivo seleccionado"
      : archivosPdf.length === 1
        ? archivosPdf[0].name
        : `${archivosPdf.length} archivos: ${archivosPdf.map((a) => a.name).join(", ")}`;

  return (
    <div>
      {!enModal && (
        <div className="barra-herramientas">
          <div className="cabecera-pagina">
            <h2>Importar horario</h2>
            <p className="texto-suave cabecera-pagina__subtitulo">
              Sube el PDF del horario semanal para ver qué obligaciones de cuota deberían existir (Comanderos y
              Corredores con entrada a las 11:00 o después) y crear solo las que falten. Lo que ya esté registrado — a
              mano o por una importación previa — se detecta y se omite automáticamente.
            </p>
          </div>
        </div>
      )}
      {enModal && (
        <p className="texto-suave">
          Sube el PDF del horario semanal. Se toman solo Comanderos y Corredores con entrada a las 11:00 o después, y lo
          que ya esté registrado se detecta y se omite.
        </p>
      )}

      <div className="barra-herramientas">
        <div className="grupo-filtros" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="campo" style={{ marginBottom: 0, minWidth: 280, flex: 1 }}>
            <label htmlFor="importar-horario-pdf">PDF(s) del horario semanal</label>
            <input
              id="importar-horario-pdf"
              ref={refArchivo}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="input-archivo-oculto"
              onChange={(e) => {
                setArchivosPdf(Array.from(e.target.files ?? []));
                setLecturaPdf(null);
              }}
            />
            <div className="selector-archivo">
              <button
                type="button"
                className="boton boton-secundario"
                onClick={() => refArchivo.current?.click()}
              >
                Elegir PDF
              </button>
              <span className="texto-suave selector-archivo__nombre" title={textoArchivos}>
                {textoArchivos}
              </span>
            </div>
            <span className="texto-suave">Puedes elegir varias semanas a la vez.</span>
          </div>
        </div>
        <button
          type="button"
          className="boton boton-primario"
          disabled={archivosPdf.length === 0 || analizando}
          onClick={analizar}
        >
          <IconoSubir width={16} height={16} /> {analizando ? "Analizando…" : "Analizar"}
        </button>
      </div>

      {lecturaPdf && (
        <div role="status" style={{ marginBottom: 12 }}>
          {lecturaPdf.archivos.map((a) => (
            <p key={a.nombre} className="texto-suave" style={{ margin: "0 0 4px" }}>
              <strong>{a.nombre}</strong>:{" "}
              {a.semana !== null ? `Semana ${a.semana}` : "Semana sin identificar"}
              {a.desde && a.hasta ? ` · ${formatoFecha(a.desde)} – ${formatoFecha(a.hasta)}` : ""} · {a.empleados}{" "}
              empleados{a.generadoEn ? ` · generado ${a.generadoEn}` : ""}
            </p>
          ))}
          {lecturaPdf.avisos.length > 0 && (
            <ul className="texto-suave" style={{ margin: "8px 0 0", paddingLeft: 20 }}>
              {lecturaPdf.avisos.map((aviso, i) => (
                <li key={i}>{aviso}</li>
              ))}
            </ul>
          )}
          <details onToggle={(e) => setVerLectura((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 8 }}>
            <summary className="texto-suave" style={{ cursor: "pointer" }}>
              Ver lectura del PDF ({lecturaPdf.diagnostico.length} celdas)
            </summary>
            {verLectura && (
              <EnvoltorioTabla>
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>PS</th>
                      <th>Nombre</th>
                      <th>Fecha</th>
                      <th>Celda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lecturaPdf.diagnostico.map((d, i) => (
                      <tr key={i}>
                        <td className="num-tabular">{d.ps}</td>
                        <td>{d.nombre_pdf}</td>
                        <td className="num-tabular">{d.fecha}</td>
                        <td>{d.raw_cell ? d.raw_cell.replace(/\n/g, " · ") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </EnvoltorioTabla>
            )}
          </details>
        </div>
      )}

      {(ultimoResultado || (loteAplicado && loteAplicado.filas > 0)) && (
        <div className="barra-herramientas" role="status">
          <p className="texto-suave" style={{ margin: 0 }}>
            {ultimoResultado
              ? `Última aplicación: ${ultimoResultado.filas.filter((r) => r.resultado === "creado").length} creada(s), ${ultimoResultado.filas.filter((r) => r.resultado === "error").length} con error — ${formatoFechaHora(ultimoResultado.aplicado_en)}.`
              : `Última importación aplicada: ${loteAplicado?.filas} fila(s), ${formatoFecha(loteAplicado?.aplicado_en.slice(0, 10))}.`}
          </p>
          {ultimoResultado && erroresAgrupados.length > 0 && (
            <ul className="texto-suave" style={{ margin: "8px 0 0", paddingLeft: 20, flexBasis: "100%" }}>
              {erroresAgrupados.map(([mensaje, cantidad]) => (
                <li key={mensaje}>
                  {cantidad} fila(s): {mensaje}
                </li>
              ))}
            </ul>
          )}
          <div className="grupo-filtros" style={{ marginBottom: 0 }}>
            {ultimoResultado && (
              <button type="button" className="boton boton-secundario" onClick={exportarResultadoCsv}>
                <IconoDescarga width={16} height={16} /> Exportar CSV
              </button>
            )}
            {esAdminGeneral && loteAplicado && loteAplicado.filas > 0 && (
              <button
                type="button"
                className="boton boton-peligro"
                disabled={deshaciendo}
                onClick={() => setConfirmarDeshacer(true)}
                title="Solo visible para administrador general: revierte lo creado por esta importación."
              >
                <IconoDeshacer width={16} height={16} /> {deshaciendo ? "Deshaciendo…" : "Deshacer última importación"}
              </button>
            )}
          </div>
        </div>
      )}

      {analizando ? (
        <SkeletonTabla filas={6} />
      ) : !filas || !totales ? (
        <EstadoVacio
          icono={<IconoArchivo width={32} height={32} />}
          mensaje="Selecciona el PDF del horario semanal y presiona Analizar."
        />
      ) : (
        <>
          <div className="rejilla-kpi">
            <div className="tarjeta tarjeta-kpi">
              <div className="etiqueta-kpi">Debería estar recaudado</div>
              <div className="valor-kpi">{formatoMoneda(totales.deberiaEstarRecaudado)}</div>
            </div>
            <div className="tarjeta tarjeta-kpi">
              <div className="etiqueta-kpi">Ya registrado</div>
              <div className="valor-kpi">{totales.yaRegistrado}</div>
              <div className="texto-suave">{totales.yaValidado} validado(s)</div>
            </div>
            <div className="tarjeta tarjeta-kpi">
              <div className="etiqueta-kpi">Falta por crear</div>
              <div className="valor-kpi">{totales.porCrear}</div>
              <div className="texto-suave">{formatoMoneda(totales.montoPorCrear)}</div>
            </div>
            <div className="tarjeta tarjeta-kpi tarjeta-kpi--en-revision">
              <div className="etiqueta-kpi">Conflictos</div>
              <div className="valor-kpi">{totales.conflictos}</div>
            </div>
            <div className="tarjeta tarjeta-kpi tarjeta-kpi--en-revision">
              <div className="etiqueta-kpi">A revisar</div>
              <div className="valor-kpi">{totales.revisar + totales.empleadosNoEncontrados}</div>
            </div>
          </div>

          <Tabs pestanas={pestanas} activa={pestana} onChange={(id) => setPestana(id as PestanaImportar)}>
            {pestana === "crear" && (
              <>
                {filasCrear.length === 0 ? (
                  <EstadoVacio icono={<IconoArchivo width={32} height={32} />} mensaje="No hay filas pendientes por crear." />
                ) : (
                  <>
                    <div className="horario-barra-acciones">
                      <button type="button" className="boton boton-secundario" onClick={alternarTodaSeleccion} disabled={aplicando}>
                        {seleccion.size === filasCrear.length ? "Quitar selección" : "Seleccionar todas"}
                      </button>
                      <button
                        type="button"
                        className="boton boton-primario"
                        disabled={seleccion.size === 0 || aplicando}
                        onClick={() => setConfirmarAplicar(true)}
                      >
                        {aplicando ? "Aplicando…" : `Aplicar seleccionadas (${seleccion.size})`}
                      </button>
                    </div>
                    <EnvoltorioTabla>
                      <table className="tabla-datos">
                        <thead>
                          <tr>
                            <th>Sel.</th>
                            <th>PS</th>
                            <th>Empleado</th>
                            <th>Área</th>
                            <th>Fecha</th>
                            <th>Horario</th>
                            <th>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filasCrear.map(({ f, i }) => (
                            <tr key={i}>
                              <td>
                                <input
                                  type="checkbox"
                                  className="checkbox-fila"
                                  checked={seleccion.has(i)}
                                  disabled={aplicando}
                                  onChange={() => alternarSeleccion(i)}
                                />
                              </td>
                              <td className="num-tabular">{f.ps}</td>
                              <td>
                                {f.nombre_empleado_bd ?? f.nombre_pdf}
                                {f.advertencia_nombre && (
                                  <span className="texto-suave" title={`En el PDF: ${f.nombre_pdf}`}>
                                    {" "}(nombre distinto en PDF)
                                  </span>
                                )}
                              </td>
                              <td><ChipArea nombre={f.nombre_area ?? "—"} /></td>
                              <td className="num-tabular">{formatoFecha(f.fecha)}</td>
                              <td className="num-tabular">{f.hora_inicio} – {f.hora_fin}</td>
                              <td className="num-tabular">
                                {formatoMoneda(f.monto_esperado)}
                                {f.monto_esperado_es_fallback && (
                                  <span className="texto-suave" title="No se encontró vigencia en historial_cuotas; se usó la cuota actual del área.">
                                    {" "}*
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </EnvoltorioTabla>
                  </>
                )}
              </>
            )}

            {pestana === "conflictos" && (
              <>
                {filasConflicto.length === 0 ? (
                  <EstadoVacio icono={<IconoArchivo width={32} height={32} />} mensaje="Sin conflictos en este archivo." />
                ) : (
                  <EnvoltorioTabla>
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>PS</th>
                          <th>Empleado</th>
                          <th>Fecha</th>
                          <th>Área en PDF</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasConflicto.map((f, i) => (
                          <tr key={i}>
                            <td className="num-tabular">{f.ps}</td>
                            <td>{f.nombre_empleado_bd ?? f.nombre_pdf}</td>
                            <td className="num-tabular">{formatoFecha(f.fecha)}</td>
                            <td><ChipArea nombre={f.nombre_area ?? "—"} /></td>
                            <td>{f.motivos_resolucion.join(" · ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </EnvoltorioTabla>
                )}
              </>
            )}

            {pestana === "revisar" && (
              <>
                {filasRevisar.length === 0 ? (
                  <EstadoVacio icono={<IconoArchivo width={32} height={32} />} mensaje="Sin filas pendientes de revisión." />
                ) : (
                  <EnvoltorioTabla>
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>PS</th>
                          <th>Nombre en PDF</th>
                          <th>Fecha</th>
                          <th>Celda original</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasRevisar.map((f, i) => (
                          <tr key={i}>
                            <td className="num-tabular">{f.ps}</td>
                            <td>{f.nombre_pdf}</td>
                            <td className="num-tabular">{formatoFecha(f.fecha)}</td>
                            <td>{f.raw_cell || "—"}</td>
                            <td>{[...f.motivos, ...f.motivos_resolucion].join(" · ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </EnvoltorioTabla>
                )}
              </>
            )}

            {pestana === "registrado" && (
              <>
                {filasRegistrado.length === 0 ? (
                  <EstadoVacio icono={<IconoArchivo width={32} height={32} />} mensaje="Nada coincide todavía con registros existentes." />
                ) : (
                  <EnvoltorioTabla>
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>PS</th>
                          <th>Empleado</th>
                          <th>Área</th>
                          <th>Fecha</th>
                          <th>Validado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasRegistrado.map((f, i) => (
                          <tr key={i}>
                            <td className="num-tabular">{f.ps}</td>
                            <td>{f.nombre_empleado_bd ?? f.nombre_pdf}</td>
                            <td><ChipArea nombre={f.nombre_area ?? "—"} /></td>
                            <td className="num-tabular">{formatoFecha(f.fecha)}</td>
                            <td>{f.pago_validado ? "Sí" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </EnvoltorioTabla>
                )}
              </>
            )}
          </Tabs>
        </>
      )}

      {confirmarAplicar && (
        <ModalConfirmacion
          titulo="Aplicar importación"
          mensaje={`Se creará horario y/o asistencia para ${seleccion.size} fila(s) seleccionada(s). Esto genera obligaciones de pago reales en CinemaQ.`}
          etiquetaBotonConfirmar="Aplicar"
          onCancelar={() => setConfirmarAplicar(false)}
          onConfirmar={aplicarSeleccionadas}
        />
      )}

      {confirmarDeshacer && loteAplicado && (
        <ModalConfirmacion
          titulo="Deshacer última importación"
          mensaje={`Se revertirán ${loteAplicado.filas} fila(s) creadas por la última importación de este navegador (soft-delete de asistencia y baja de horario donde se creó). No afecta registros hechos a mano antes de esa importación.`}
          etiquetaBotonConfirmar="Deshacer"
          peligro
          onCancelar={() => setConfirmarDeshacer(false)}
          onConfirmar={deshacerUltimaImportacion}
        />
      )}
    </div>
  );
}
