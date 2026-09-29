import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useArea } from "../../context/AreaContext";
import { formatoFecha, formatoFechaHora, nombreCompletoEmpleado, formatoMoneda } from "../../lib/formato";
import { descargarCsv, filaCsv, nombreArchivoCsv } from "../../lib/csv";
import { mensajeErrorConsulta } from "../../lib/consulta";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import Tabs from "../../components/Tabs";
import Modal from "../../components/Modal";
import ChipArea from "../../components/ChipArea";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import { IconoEscudo, IconoLista, IconoSubir } from "../../components/Iconos";
import { useToast } from "../../context/ToastContext";
import { fechaHoyInputCdmx, ordenarRangoFechas } from "../../lib/formato";
import type { AsistenciaDiaria, ImportacionHorario, ImportacionHorarioDetalle, PagoCuota } from "../../lib/tipos";
import {
  type LogAuditoria,
  type PerfilAuditoria,
  claseEtiquetaAccion,
  detalleTecnicoFormateado,
  etiquetaAccion,
  extraerAreaIdLog,
  nombreActor,
  resumirLogAuditoria,
} from "../../lib/auditoria";

export default function Auditoria() {
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();
  const [pestana, setPestana] = useState("logs");
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [perfilesPorId, setPerfilesPorId] = useState<Map<string, PerfilAuditoria>>(new Map());
  const [eliminados, setEliminados] = useState<AsistenciaDiaria[]>([]);
  const [revertidos, setRevertidos] = useState<PagoCuota[]>([]);
  const [importaciones, setImportaciones] = useState<ImportacionHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [detalleAbierto, setDetalleAbierto] = useState<LogAuditoria | null>(null);
  const [importacionAbierta, setImportacionAbierta] = useState<ImportacionHorario | null>(null);
  const [detalleImportacion, setDetalleImportacion] = useState<ImportacionHorarioDetalle[]>([]);
  const [cargandoDetalleImportacion, setCargandoDetalleImportacion] = useState(false);
  const [desde, setDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(fechaHoyInputCdmx());

  function nombreArea(id: string | null | undefined) {
    if (!id) return "—";
    return areas.find((a) => a.id === id)?.nombre ?? "—";
  }

  async function cargarPerfiles(ids: string[]) {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (unicos.length === 0) {
      setPerfilesPorId(new Map());
      return;
    }
    const { data } = await supabase
      .from("perfiles")
      .select("id, nombre_completo, nombre_usuario")
      .in("id", unicos);
    const mapa = new Map<string, PerfilAuditoria>();
    for (const p of (data as PerfilAuditoria[]) ?? []) {
      mapa.set(p.id, p);
    }
    setPerfilesPorId(mapa);
  }

  async function cargar() {
    setCargando(true);
    const rango = ordenarRangoFechas(desde, hasta);
    try {
      const { data: datosLogs, error: errorLogs } = await supabase
        .from("logs_auditoria")
        .select("*")
        .gte("creado_en", `${rango.desde}T00:00:00`)
        .lte("creado_en", `${rango.hasta}T23:59:59`)
        .order("creado_en", { ascending: false })
        .limit(500);
      if (errorLogs) throw errorLogs;

      const registros = (datosLogs as LogAuditoria[]) ?? [];
      setLogs(registros);
      await cargarPerfiles(registros.map((l) => l.usuario_id).filter((id): id is string => Boolean(id)));

      let consultaEliminados = supabase
        .from("asistencia_diaria")
        .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
        .eq("eliminado", true)
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta);
      if (areaIdsFiltro) consultaEliminados = consultaEliminados.in("area_id", areaIdsFiltro);
      const { data: datosEliminados, error: errorEliminados } = await consultaEliminados;
      if (errorEliminados) throw errorEliminados;
      setEliminados((datosEliminados as AsistenciaDiaria[]) ?? []);

      let consultaRevertidos = supabase
        .from("pagos_cuota")
        .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
        .not("motivo_reversion", "is", null)
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta);
      if (areaIdsFiltro) consultaRevertidos = consultaRevertidos.in("area_id", areaIdsFiltro);
      const { data: datosRevertidos, error: errorRevertidos } = await consultaRevertidos;
      if (errorRevertidos) throw errorRevertidos;
      setRevertidos((datosRevertidos as PagoCuota[]) ?? []);

      const { data: datosImportaciones, error: errorImportaciones } = await supabase
        .from("importaciones_horario")
        .select("id, aplicado_en, aplicado_por, filas, perfiles(nombre_completo, nombre_usuario)")
        .gte("aplicado_en", `${rango.desde}T00:00:00`)
        .lte("aplicado_en", `${rango.hasta}T23:59:59`)
        .order("aplicado_en", { ascending: false })
        .limit(200);
      if (errorImportaciones) throw errorImportaciones;
      type FilaImportacionCruda = {
        id: string;
        aplicado_en: string;
        aplicado_por: string | null;
        filas: number;
        perfiles:
          | { nombre_completo: string; nombre_usuario: string }
          | { nombre_completo: string; nombre_usuario: string }[]
          | null;
      };
      const normalizadas: ImportacionHorario[] = ((datosImportaciones as FilaImportacionCruda[] | null) ?? []).map(
        (fila) => {
          const perfilJoin = Array.isArray(fila.perfiles) ? (fila.perfiles[0] ?? null) : fila.perfiles;
          return {
            id: fila.id,
            aplicado_en: fila.aplicado_en,
            aplicado_por: fila.aplicado_por,
            filas: fila.filas,
            perfiles: perfilJoin,
          };
        },
      );
      setImportaciones(normalizadas);
    } catch (e) {
      const msg = e instanceof Error ? e.message : mensajeErrorConsulta(null, "No se pudo cargar la auditoría.");
      mostrarToast(msg, "error");
      setLogs([]);
      setEliminados([]);
      setRevertidos([]);
      setImportaciones([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, areaIdsFiltro]);

  async function abrirDetalleImportacion(imp: ImportacionHorario) {
    setImportacionAbierta(imp);
    setCargandoDetalleImportacion(true);
    setDetalleImportacion([]);
    const { data, error } = await supabase
      .from("importaciones_horario_detalle")
      .select("*")
      .eq("importacion_id", imp.id)
      .order("fecha", { ascending: true });
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudo cargar el detalle de la importación."), "error");
      setCargandoDetalleImportacion(false);
      return;
    }
    setDetalleImportacion((data as ImportacionHorarioDetalle[]) ?? []);
    setCargandoDetalleImportacion(false);
  }

  /* --- Filtrar logs por area_id del detalle JSON --- */
  const logsFiltrados = useMemo(() => {
    if (!areaIdsFiltro) return logs;
    const setAreas = new Set(areaIdsFiltro);
    return logs.filter((l) => {
      const areaId = extraerAreaIdLog(l);
      // Si el log no tiene area_id, lo mostramos igual (acciones globales)
      if (!areaId) return true;
      return setAreas.has(areaId);
    });
  }, [logs, areaIdsFiltro]);

  const pestanas = useMemo(
    () => [
      { id: "logs", etiqueta: "Registro general", contador: logsFiltrados.length },
      { id: "importaciones", etiqueta: "Importaciones PDF", contador: importaciones.length },
      { id: "eliminados", etiqueta: "Asistencias eliminadas", contador: eliminados.length },
      { id: "revertidos", etiqueta: "Pagos revertidos", contador: revertidos.length },
    ],
    [logsFiltrados.length, importaciones.length, eliminados.length, revertidos.length],
  );

  function nombreQuienAplico(imp: ImportacionHorario) {
    if (imp.perfiles?.nombre_completo) return imp.perfiles.nombre_completo;
    if (imp.aplicado_por) {
      const p = perfilesPorId.get(imp.aplicado_por);
      if (p?.nombre_completo) return p.nombre_completo;
    }
    return "—";
  }

  /* --- Export CSV del registro general --- */
  function exportarRegistroGeneral() {
    const encabezados = ["Fecha", "Realizado por", "Acción", "Qué ocurrió"];
    const lineas = [filaCsv(encabezados)];
    for (const l of logsFiltrados) {
      lineas.push(
        filaCsv([
          formatoFechaHora(l.creado_en),
          nombreActor(l, perfilesPorId),
          etiquetaAccion(l.accion),
          resumirLogAuditoria(l, areas),
        ]),
      );
    }
    const nombreAreaArchivo = areaIdsFiltro && areaIdsFiltro.length === 1 ? nombreArea(areaIdsFiltro[0]) : "ambas";
    const ok = descargarCsv(nombreArchivoCsv("auditoria_general", nombreAreaArchivo, desde, hasta), lineas);
    mostrarToast(ok ? "CSV descargado." : "No se pudo descargar el CSV.", ok ? "exito" : "error");
  }

  function exportarEliminados() {
    const lineas = [filaCsv(["Fecha", "Área", "Empleado", "Eliminado el", "Motivo"])];
    for (const a of eliminados) {
      lineas.push(
        filaCsv([
          a.fecha,
          nombreArea(a.area_id),
          a.empleados ? nombreCompletoEmpleado(a.empleados) : "",
          formatoFechaHora(a.eliminado_en),
          a.motivo_eliminacion ?? "",
        ]),
      );
    }
    const nombreAreaArchivo = areaIdsFiltro && areaIdsFiltro.length === 1 ? nombreArea(areaIdsFiltro[0]) : "ambas";
    const ok = descargarCsv(nombreArchivoCsv("auditoria_eliminados", nombreAreaArchivo, desde, hasta), lineas);
    mostrarToast(ok ? "CSV descargado." : "No se pudo descargar el CSV.", ok ? "exito" : "error");
  }

  function exportarRevertidos() {
    const lineas = [filaCsv(["Fecha", "Área", "Empleado", "Monto", "Motivo de reversión"])];
    for (const p of revertidos) {
      lineas.push(
        filaCsv([
          p.fecha,
          nombreArea(p.area_id),
          p.empleados ? nombreCompletoEmpleado(p.empleados) : "",
          formatoMoneda(p.monto_esperado),
          p.motivo_reversion ?? "",
        ]),
      );
    }
    const nombreAreaArchivo = areaIdsFiltro && areaIdsFiltro.length === 1 ? nombreArea(areaIdsFiltro[0]) : "ambas";
    const ok = descargarCsv(nombreArchivoCsv("auditoria_revertidos", nombreAreaArchivo, desde, hasta), lineas);
    mostrarToast(ok ? "CSV descargado." : "No se pudo descargar el CSV.", ok ? "exito" : "error");
  }

  function exportarImportaciones() {
    const lineas = [filaCsv(["Aplicado el", "Aplicado por", "Filas"])];
    for (const imp of importaciones) {
      lineas.push(filaCsv([formatoFechaHora(imp.aplicado_en), nombreQuienAplico(imp), String(imp.filas)]));
    }
    const nombreAreaArchivo = areaIdsFiltro && areaIdsFiltro.length === 1 ? nombreArea(areaIdsFiltro[0]) : "ambas";
    const ok = descargarCsv(nombreArchivoCsv("auditoria_importaciones_pdf", nombreAreaArchivo, desde, hasta), lineas);
    mostrarToast(ok ? "CSV descargado." : "No se pudo descargar el CSV.", ok ? "exito" : "error");
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Auditoría</h2>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="auditoria-filtro-desde">Desde</label>
            <input
              id="auditoria-filtro-desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="auditoria-filtro-hasta">Hasta</label>
            <input
              id="auditoria-filtro-hasta"
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Tabs pestanas={pestanas} activa={pestana} onChange={setPestana}>
        {pestana === "logs" && (
          <>
            <div className="fila-acciones" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
              <button
                type="button"
                className="boton boton-secundario"
                onClick={exportarRegistroGeneral}
                disabled={cargando || logsFiltrados.length === 0}
              >
                Exportar CSV
              </button>
            </div>
            {cargando ? (
              <SkeletonTabla filas={6} />
            ) : logsFiltrados.length === 0 ? (
              <EstadoVacio
                icono={<IconoEscudo width={32} height={32} />}
                mensaje="Sin registros en este rango."
              />
            ) : (
            <EnvoltorioTabla>
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Realizado por</th>
                    <th>Acción</th>
                    <th>Qué ocurrió</th>
                  </tr>
                </thead>
                <tbody>
                  {logsFiltrados.map((l) => {
                      const actor = nombreActor(l, perfilesPorId);
                      const esSistema = actor === "Sistema";
                      return (
                        <tr key={l.id}>
                          <td className="num-tabular">{formatoFechaHora(l.creado_en)}</td>
                          <td>
                            <span className={esSistema ? "actor-auditoria actor-auditoria--sistema" : "actor-auditoria"}>
                              {actor}
                            </span>
                          </td>
                          <td>
                            <span className={claseEtiquetaAccion(l.accion)}>{etiquetaAccion(l.accion)}</span>
                          </td>
                          <td>
                            <div className="resumen-auditoria">{resumirLogAuditoria(l, areas)}</div>
                            {l.detalle && (
                              <button
                                type="button"
                                className="boton boton-texto boton-chico"
                                style={{ marginTop: "0.35rem" }}
                                onClick={() => setDetalleAbierto(l)}
                              >
                                Ver detalle técnico
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </EnvoltorioTabla>
            )}
          </>
        )}

        {pestana === "importaciones" && (
          <>
            <div className="fila-acciones" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
              <button
                type="button"
                className="boton boton-secundario"
                onClick={exportarImportaciones}
                disabled={cargando || importaciones.length === 0}
              >
                Exportar CSV
              </button>
            </div>
            {cargando ? (
              <SkeletonTabla filas={6} />
            ) : importaciones.length === 0 ? (
              <EstadoVacio
                icono={<IconoSubir width={32} height={32} />}
                mensaje="Sin importaciones de horario en este rango."
              />
            ) : (
              <EnvoltorioTabla>
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Aplicado el</th>
                      <th>Aplicado por</th>
                      <th>Filas</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {importaciones.map((imp) => (
                      <tr key={imp.id}>
                        <td className="num-tabular">{formatoFechaHora(imp.aplicado_en)}</td>
                        <td>{nombreQuienAplico(imp)}</td>
                        <td className="num-tabular">{imp.filas}</td>
                        <td>
                          <button
                            type="button"
                            className="boton boton-texto boton-chico"
                            onClick={() => abrirDetalleImportacion(imp)}
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </EnvoltorioTabla>
            )}
          </>
        )}

        {pestana === "eliminados" && (
          <>
            <div className="fila-acciones" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
              <button type="button" className="boton boton-secundario" onClick={exportarEliminados}>
                Exportar CSV
              </button>
            </div>
            {cargando ? (
              <SkeletonTabla />
            ) : eliminados.length === 0 ? (
              <EstadoVacio
                icono={<IconoLista width={32} height={32} />}
                mensaje="Sin asistencias eliminadas en este rango."
              />
            ) : (
            <EnvoltorioTabla>
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Área</th>
                    <th>Empleado</th>
                    <th>Eliminado el</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {eliminados.map((a) => (
                    <tr key={a.id}>
                      <td className="num-tabular">{a.fecha}</td>
                      <td><ChipArea nombre={nombreArea(a.area_id)} /></td>
                      <td>{a.empleados ? nombreCompletoEmpleado(a.empleados) : "—"}</td>
                      <td className="num-tabular">{formatoFechaHora(a.eliminado_en)}</td>
                      <td>{a.motivo_eliminacion ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EnvoltorioTabla>
            )}
          </>
        )}

        {pestana === "revertidos" && (
          <>
            <div className="fila-acciones" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
              <button type="button" className="boton boton-secundario" onClick={exportarRevertidos}>
                Exportar CSV
              </button>
            </div>
            {cargando ? (
              <SkeletonTabla />
            ) : revertidos.length === 0 ? (
              <EstadoVacio
                icono={<IconoLista width={32} height={32} />}
                mensaje="Sin reversiones en este rango."
              />
            ) : (
            <EnvoltorioTabla>
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Área</th>
                    <th>Empleado</th>
                    <th>Monto</th>
                    <th>Motivo de reversión</th>
                  </tr>
                </thead>
                <tbody>
                  {revertidos.map((p) => (
                    <tr key={p.id}>
                      <td className="num-tabular">{p.fecha}</td>
                      <td><ChipArea nombre={nombreArea(p.area_id)} /></td>
                      <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                      <td className="num-tabular">{formatoMoneda(p.monto_esperado)}</td>
                      <td>{p.motivo_reversion ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EnvoltorioTabla>
            )}
          </>
        )}
      </Tabs>

      {detalleAbierto && (
        <Modal titulo="Detalle técnico del registro" onCerrar={() => setDetalleAbierto(null)} ancho>
          <p className="texto-suave" style={{ marginTop: 0 }}>
            {formatoFechaHora(detalleAbierto.creado_en)} · {nombreActor(detalleAbierto, perfilesPorId)} ·{" "}
            {etiquetaAccion(detalleAbierto.accion)}
          </p>
          <p className="resumen-auditoria">{resumirLogAuditoria(detalleAbierto, areas)}</p>
          <pre className="detalle-tecnico-json">{detalleTecnicoFormateado(detalleAbierto.detalle)}</pre>
        </Modal>
      )}

      {importacionAbierta && (
        <Modal
          titulo="Detalle de importación PDF"
          onCerrar={() => {
            setImportacionAbierta(null);
            setDetalleImportacion([]);
          }}
          extraAncho
        >
          <p className="texto-suave" style={{ marginTop: 0 }}>
            {formatoFechaHora(importacionAbierta.aplicado_en)} · {nombreQuienAplico(importacionAbierta)} ·{" "}
            {importacionAbierta.filas} fila(s)
          </p>
          {cargandoDetalleImportacion ? (
            <SkeletonTabla filas={4} />
          ) : detalleImportacion.length === 0 ? (
            <EstadoVacio
              icono={<IconoSubir width={32} height={32} />}
              mensaje="Esta importación no tiene filas de detalle guardadas."
            />
          ) : (
            <EnvoltorioTabla>
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>PS</th>
                    <th>Nombre</th>
                    <th>Área</th>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Creó horario</th>
                  </tr>
                </thead>
                <tbody>
                  {detalleImportacion.map((d) => (
                    <tr key={d.id}>
                      <td className="num-tabular">{d.ps ?? "—"}</td>
                      <td>{d.nombre ?? "—"}</td>
                      <td><ChipArea nombre={nombreArea(d.area_id)} /></td>
                      <td className="num-tabular">{d.fecha ? formatoFecha(d.fecha) : "—"}</td>
                      <td className="num-tabular">{d.monto != null ? formatoMoneda(d.monto) : "—"}</td>
                      <td>{d.creo_horario ? "Sí" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EnvoltorioTabla>
          )}
        </Modal>
      )}
    </div>
  );
}
