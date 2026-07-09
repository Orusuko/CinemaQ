import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useArea } from "../../context/AreaContext";
import { formatoFechaHora, nombreCompletoEmpleado, formatoMoneda } from "../../lib/formato";
import { descargarCsv, filaCsv, nombreArchivoCsv } from "../../lib/csv";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import Tabs from "../../components/Tabs";
import Modal from "../../components/Modal";
import ChipArea from "../../components/ChipArea";
import { useToast } from "../../context/ToastContext";
import { fechaHoyInputCdmx } from "../../lib/formato";
import type { AsistenciaDiaria, PagoCuota } from "../../lib/tipos";
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
  const [cargando, setCargando] = useState(true);
  const [detalleAbierto, setDetalleAbierto] = useState<LogAuditoria | null>(null);
  const [desde, setDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(fechaHoyInputCdmx());

  function nombreArea(id: string) {
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
    const { data: datosLogs } = await supabase
      .from("logs_auditoria")
      .select("*")
      .gte("creado_en", `${desde}T00:00:00`)
      .lte("creado_en", `${hasta}T23:59:59`)
      .order("creado_en", { ascending: false })
      .limit(500);
    const registros = (datosLogs as LogAuditoria[]) ?? [];
    setLogs(registros);
    await cargarPerfiles(registros.map((l) => l.usuario_id).filter((id): id is string => Boolean(id)));

    let consultaEliminados = supabase
      .from("asistencia_diaria")
      .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
      .eq("eliminado", true)
      .gte("fecha", desde)
      .lte("fecha", hasta);
    if (areaIdsFiltro) consultaEliminados = consultaEliminados.in("area_id", areaIdsFiltro);
    const { data: datosEliminados } = await consultaEliminados;
    setEliminados((datosEliminados as AsistenciaDiaria[]) ?? []);

    let consultaRevertidos = supabase
      .from("pagos_cuota")
      .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
      .not("motivo_reversion", "is", null)
      .gte("fecha", desde)
      .lte("fecha", hasta);
    if (areaIdsFiltro) consultaRevertidos = consultaRevertidos.in("area_id", areaIdsFiltro);
    const { data: datosRevertidos } = await consultaRevertidos;
    setRevertidos((datosRevertidos as PagoCuota[]) ?? []);

    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, areaIdsFiltro]);

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
      { id: "eliminados", etiqueta: "Asistencias eliminadas", contador: eliminados.length },
      { id: "revertidos", etiqueta: "Pagos revertidos", contador: revertidos.length },
    ],
    [logsFiltrados.length, eliminados.length, revertidos.length],
  );

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
    descargarCsv(nombreArchivoCsv("auditoria_general", nombreAreaArchivo, desde, hasta), lineas);
    mostrarToast("CSV descargado.", "exito");
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
    descargarCsv(nombreArchivoCsv("auditoria_eliminados", nombreAreaArchivo, desde, hasta), lineas);
    mostrarToast("CSV descargado.", "exito");
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
    descargarCsv(nombreArchivoCsv("auditoria_revertidos", nombreAreaArchivo, desde, hasta), lineas);
    mostrarToast("CSV descargado.", "exito");
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Auditoría</h2>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
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
                  {cargando && (
                    <tr>
                      <td colSpan={4} className="estado-vacio">
                        Cargando registro de auditoría…
                      </td>
                    </tr>
                  )}
                  {!cargando &&
                    logsFiltrados.map((l) => {
                      const actor = nombreActor(l, perfilesPorId);
                      const esSistema = actor === "Sistema";
                      return (
                        <tr key={l.id}>
                          <td>{formatoFechaHora(l.creado_en)}</td>
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
                  {!cargando && logsFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={4} className="estado-vacio">
                        Sin registros en este rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </EnvoltorioTabla>
          </>
        )}

        {pestana === "eliminados" && (
          <>
            <div className="fila-acciones" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
              <button type="button" className="boton boton-secundario" onClick={exportarEliminados}>
                Exportar CSV
              </button>
            </div>
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
                      <td>{a.fecha}</td>
                      <td><ChipArea nombre={nombreArea(a.area_id)} /></td>
                      <td>{a.empleados ? nombreCompletoEmpleado(a.empleados) : "—"}</td>
                      <td>{formatoFechaHora(a.eliminado_en)}</td>
                      <td>{a.motivo_eliminacion ?? "—"}</td>
                    </tr>
                  ))}
                  {!cargando && eliminados.length === 0 && (
                    <tr>
                      <td colSpan={5} className="estado-vacio">
                        Sin asistencias eliminadas en este rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </EnvoltorioTabla>
          </>
        )}

        {pestana === "revertidos" && (
          <>
            <div className="fila-acciones" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
              <button type="button" className="boton boton-secundario" onClick={exportarRevertidos}>
                Exportar CSV
              </button>
            </div>
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
                      <td>{p.fecha}</td>
                      <td><ChipArea nombre={nombreArea(p.area_id)} /></td>
                      <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                      <td>{formatoMoneda(p.monto_esperado)}</td>
                      <td>{p.motivo_reversion ?? "—"}</td>
                    </tr>
                  ))}
                  {!cargando && revertidos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="estado-vacio">
                        Sin reversiones en este rango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </EnvoltorioTabla>
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
    </div>
  );
}
