import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useArea } from "../../context/AreaContext";
import { formatoFechaHora, nombreCompletoEmpleado, formatoMoneda } from "../../lib/formato";
import { descargarCsv, filaCsv, nombreArchivoCsv } from "../../lib/csv";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import { fechaHoyInputCdmx } from "../../lib/formato";
import type { AsistenciaDiaria, PagoCuota } from "../../lib/tipos";

interface LogAuditoria {
  id: string;
  usuario_id: string | null;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  detalle: Record<string, unknown> | null;
  creado_en: string;
}

export default function Auditoria() {
  const { areaIdsFiltro, areas } = useArea();
  const [pestana, setPestana] = useState<"logs" | "eliminados" | "revertidos">("logs");
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [eliminados, setEliminados] = useState<AsistenciaDiaria[]>([]);
  const [revertidos, setRevertidos] = useState<PagoCuota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(fechaHoyInputCdmx());

  function nombreArea(id: string) {
    return areas.find((a) => a.id === id)?.nombre ?? "—";
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
    setLogs((datosLogs as LogAuditoria[]) ?? []);

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

      <div className="fila-acciones" style={{ marginBottom: "1rem" }}>
        <button className={`boton ${pestana === "logs" ? "boton-primario" : "boton-secundario"}`} onClick={() => setPestana("logs")}>
          Registro general
        </button>
        <button
          className={`boton ${pestana === "eliminados" ? "boton-primario" : "boton-secundario"}`}
          onClick={() => setPestana("eliminados")}
        >
          Asistencias eliminadas ({eliminados.length})
        </button>
        <button
          className={`boton ${pestana === "revertidos" ? "boton-primario" : "boton-secundario"}`}
          onClick={() => setPestana("revertidos")}
        >
          Pagos revertidos ({revertidos.length})
        </button>
      </div>

      {pestana === "logs" && (
        <EnvoltorioTabla>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{formatoFechaHora(l.creado_en)}</td>
                  <td>{l.accion}</td>
                  <td>{l.entidad}</td>
                  <td>
                    <code style={{ fontSize: "0.75rem" }}>{JSON.stringify(l.detalle).slice(0, 140)}</code>
                  </td>
                </tr>
              ))}
              {!cargando && logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="estado-vacio">
                    Sin registros en este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </EnvoltorioTabla>
      )}

      {pestana === "eliminados" && (
        <>
          <div className="fila-acciones" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
            <button className="boton boton-secundario" onClick={exportarEliminados}>
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
                    <td>{nombreArea(a.area_id)}</td>
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
            <button className="boton boton-secundario" onClick={exportarRevertidos}>
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
                    <td>{nombreArea(p.area_id)}</td>
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
    </div>
  );
}
