import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { formatoFecha, formatoMoneda, ETIQUETAS_ESTADO_PAGO, claseEstadoPago, nombreCompletoEmpleado } from "../../lib/formato";
import { calcularRango, type PeriodoBalance } from "../../lib/rangosFecha";
import { fechaHoyInputCdmx } from "../../lib/formato";
import { descargarCsv, filaCsv, ENCABEZADOS_HISTORIAL, nombreArchivoCsv } from "../../lib/csv";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import Tabs from "../../components/Tabs";
import ChipArea from "../../components/ChipArea";
import { useToast } from "../../context/ToastContext";
import type { PagoCuota } from "../../lib/tipos";

/* ------------------------------------------------------------------ */
/* Skeletons reutilizables                                             */
/* ------------------------------------------------------------------ */
function SkeletonKpi() {
  return (
    <div className="tarjeta tarjeta-kpi">
      <div className="skeleton skeleton-texto" style={{ width: "50%" }} />
      <div className="skeleton skeleton-kpi" />
    </div>
  );
}

function SkeletonTabla({ filas = 4 }: { filas?: number }) {
  return (
    <div style={{ padding: "1rem" }}>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="skeleton skeleton-fila" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areas, areaIdsFiltro, cargando: cargandoAreas } = useArea();
  const { mostrarToast } = useToast();
  const [periodo, setPeriodo] = useState<PeriodoBalance>("dia");
  const [rangoManual, setRangoManual] = useState({ desde: fechaHoyInputCdmx(), hasta: fechaHoyInputCdmx() });
  const [pagos, setPagos] = useState<PagoCuota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [pestana, setPestana] = useState<"pendientes" | "todos">("pendientes");

  const rango = useMemo(() => calcularRango(periodo, rangoManual), [periodo, rangoManual]);

  useEffect(() => {
    if (cargandoAreas) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      let consulta = supabase
        .from("pagos_cuota")
        .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta);
      if (areaIdsFiltro) consulta = consulta.in("area_id", areaIdsFiltro);
      const { data } = await consulta;
      if (!cancelado) {
        setPagos((data as PagoCuota[]) ?? []);
        setCargando(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [rango, areaIdsFiltro, cargandoAreas]);

  const totales = useMemo(() => {
    let esperado = 0;
    let recaudado = 0;
    let enRevision = 0;
    for (const p of pagos) {
      if (p.estado !== "cancelado") esperado += Number(p.monto_esperado);
      if (p.estado === "validado") recaudado += Number(p.monto_esperado);
      if (p.estado === "marcado_pendiente_validacion") enRevision += Number(p.monto_esperado);
    }
    return { esperado, recaudado, enRevision, diferencia: esperado - recaudado };
  }, [pagos]);

  const pendientes = pagos.filter((p) => p.estado === "pendiente" || p.estado === "marcado_pendiente_validacion");

  function nombreArea(areaId: string) {
    return areas.find((a) => a.id === areaId)?.nombre ?? "—";
  }

  function exportarBalance() {
    const lineas = [filaCsv(ENCABEZADOS_HISTORIAL)];
    for (const p of pagos) {
      lineas.push(
        filaCsv([
          p.fecha,
          nombreArea(p.area_id),
          p.empleados?.numero_empleado ?? "",
          "",
          p.empleados ? nombreCompletoEmpleado(p.empleados) : "",
          Number(p.monto_esperado).toFixed(2),
          ETIQUETAS_ESTADO_PAGO[p.estado],
          p.marcado_por_empleado ? "Sí" : "No",
          p.marcado_empleado_en ?? "",
          p.validado_por ?? "",
          p.validado_en ?? "",
          p.origen,
          p.notas ?? "",
          p.motivo_reversion ?? "",
        ]),
      );
    }
    const nombreAreaArchivo = areaIdsFiltro && areaIdsFiltro.length === 1 ? nombreArea(areaIdsFiltro[0]) : "ambas";
    descargarCsv(nombreArchivoCsv("balance", nombreAreaArchivo, rango.desde, rango.hasta), lineas);
    mostrarToast("CSV descargado.", "exito");
  }

  const claseDiferencia = totales.diferencia === 0 ? "diferencia-cero" : "diferencia";

  const ETIQUETAS_PERIODO: Record<PeriodoBalance, string> = {
    dia: "Hoy",
    semana: "Esta semana",
    mes: "Este mes",
    rango: `${rango.desde} – ${rango.hasta}`,
  };

  const etiquetaArea = (() => {
    if (!areaIdsFiltro) return "Ambas áreas";
    if (areaIdsFiltro.length === 1) return nombreArea(areaIdsFiltro[0]);
    return "Ambas áreas";
  })();

  const subtituloPeriodo = `${ETIQUETAS_PERIODO[periodo]} · ${etiquetaArea}`;

  const pctRecaudado = totales.esperado > 0 ? Math.min(100, Math.round((totales.recaudado / totales.esperado) * 100)) : 0;

  const pestanasConfig = [
    { id: "pendientes", etiqueta: "Pendientes por cobrar", contador: pendientes.length },
    { id: "todos", etiqueta: "Todos los pagos", contador: pagos.length },
  ];

  return (
    <div>
      <div className="barra-herramientas">
        <div>
          <h2 style={{ marginBottom: "0.15rem" }}>Balance</h2>
          <p className="texto-suave" style={{ margin: 0, fontSize: "0.85rem" }}>{subtituloPeriodo}</p>
        </div>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Periodo</label>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoBalance)}>
              <option value="dia">Hoy</option>
              <option value="semana">Esta semana</option>
              <option value="mes">Este mes</option>
              <option value="rango">Rango libre</option>
            </select>
          </div>
          {periodo === "rango" && (
            <>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label>Desde</label>
                <input
                  type="date"
                  value={rangoManual.desde}
                  onChange={(e) => setRangoManual((r) => ({ ...r, desde: e.target.value }))}
                />
              </div>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label>Hasta</label>
                <input
                  type="date"
                  value={rangoManual.hasta}
                  onChange={(e) => setRangoManual((r) => ({ ...r, hasta: e.target.value }))}
                />
              </div>
            </>
          )}
          <button className="boton boton-secundario" onClick={exportarBalance} disabled={cargando}>
            Exportar CSV
          </button>
        </div>
      </div>

      {/* ---- KPIs ---- */}
      {cargando ? (
        <div className="rejilla-kpi">
          <SkeletonKpi />
          <SkeletonKpi />
          <SkeletonKpi />
          <SkeletonKpi />
        </div>
      ) : (
        <div className="rejilla-kpi">
          <div className="tarjeta tarjeta-kpi">
            <div className="etiqueta-kpi">Total a recaudar</div>
            <div className="valor-kpi">{formatoMoneda(totales.esperado)}</div>
          </div>
          <div className="tarjeta tarjeta-kpi">
            <div className="etiqueta-kpi">Validado en caja</div>
            <div className="valor-kpi">{formatoMoneda(totales.recaudado)}</div>
          </div>
          <div className="tarjeta tarjeta-kpi">
            <div className="etiqueta-kpi">Diferencia</div>
            <div className={`valor-kpi ${claseDiferencia}`}>{formatoMoneda(totales.diferencia)}</div>
          </div>
          <div className="tarjeta tarjeta-kpi tarjeta-kpi--en-revision">
            <div className="etiqueta-kpi">En revisión</div>
            <div className="valor-kpi" style={{ color: "var(--color-advertencia)" }}>
              {formatoMoneda(totales.enRevision)}
            </div>
            {totales.enRevision > 0 && (
              <>
                <div className="subvalor">
                  Pendiente de validación administrativa
                </div>
                <Link to="/panel/pagos?pestana=revision" className="enlace-accion" style={{ marginTop: "0.5rem" }}>
                  Revisar en Pagos →
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {!cargando && totales.esperado > 0 && (
        <div className="barra-progreso-recaudo tarjeta">
          <div className="barra-progreso-recaudo__cabecera">
            <span className="texto-suave">Avance del periodo</span>
            <strong>{pctRecaudado}% recaudado</strong>
          </div>
          <div className="barra-progreso-recaudo__pista" role="progressbar" aria-valuenow={pctRecaudado} aria-valuemin={0} aria-valuemax={100}>
            <div className="barra-progreso-recaudo__relleno" style={{ width: `${pctRecaudado}%` }} />
          </div>
        </div>
      )}

      {/* ---- Tabs ---- */}
      <Tabs pestanas={pestanasConfig} activa={pestana} onChange={(id) => setPestana(id as "pendientes" | "todos")}>
        {pestana === "pendientes" && (
          <>
            {cargando ? (
              <SkeletonTabla />
            ) : pendientes.length === 0 ? (
              <div className="estado-vacio-ilustrado">
                <span className="icono-vacio">✅</span>
                <p>No hay pagos pendientes en este periodo.</p>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <Link to="/panel/pagos?pestana=revision" className="enlace-accion">
                    Ir a Pagos →
                  </Link>
                  <Link to="/panel/horario" className="enlace-accion">
                    Ver Horario →
                  </Link>
                </div>
              </div>
            ) : (
              <EnvoltorioTabla>
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Área</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Monto</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.map((p) => (
                      <tr key={p.id}>
                        <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                        <td><ChipArea nombre={nombreArea(p.area_id)} /></td>
                        <td>{formatoFecha(p.fecha)}</td>
                        <td>
                          <span className={claseEstadoPago(p.estado)}>{ETIQUETAS_ESTADO_PAGO[p.estado]}</span>
                        </td>
                        <td>{formatoMoneda(p.monto_esperado)}</td>
                        <td>
                          <Link to="/panel/pagos?pestana=revision" className="enlace-accion">
                            {esSupervision ? "Ver en Pagos →" : "Validar →"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </EnvoltorioTabla>
            )}
          </>
        )}

        {pestana === "todos" && (
          <>
            {cargando ? (
              <SkeletonTabla filas={6} />
            ) : pagos.length === 0 ? (
              <div className="estado-vacio-ilustrado">
                <span className="icono-vacio">📋</span>
                <p>No hay pagos registrados en este periodo.</p>
              </div>
            ) : (
              <EnvoltorioTabla>
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Área</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((p) => (
                      <tr key={p.id}>
                        <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                        <td><ChipArea nombre={nombreArea(p.area_id)} /></td>
                        <td>{formatoFecha(p.fecha)}</td>
                        <td>
                          <span className={claseEstadoPago(p.estado)}>{ETIQUETAS_ESTADO_PAGO[p.estado]}</span>
                        </td>
                        <td>{formatoMoneda(p.monto_esperado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </EnvoltorioTabla>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
