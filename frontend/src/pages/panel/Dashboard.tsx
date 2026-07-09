import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useArea } from "../../context/AreaContext";
import { formatoFecha, formatoMoneda, ETIQUETAS_ESTADO_PAGO, claseEstadoPago, nombreCompletoEmpleado } from "../../lib/formato";
import { calcularRango, type PeriodoBalance } from "../../lib/rangosFecha";
import { fechaHoyInputCdmx } from "../../lib/formato";
import { descargarCsv, filaCsv, ENCABEZADOS_HISTORIAL, nombreArchivoCsv } from "../../lib/csv";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import type { PagoCuota } from "../../lib/tipos";

export default function Dashboard() {
  const { areas, areaIdsFiltro, cargando: cargandoAreas } = useArea();
  const [periodo, setPeriodo] = useState<PeriodoBalance>("dia");
  const [rangoManual, setRangoManual] = useState({ desde: fechaHoyInputCdmx(), hasta: fechaHoyInputCdmx() });
  const [pagos, setPagos] = useState<PagoCuota[]>([]);
  const [cargando, setCargando] = useState(true);

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
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Balance</h2>
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

      <div className="rejilla-kpi">
        <div className="tarjeta tarjeta-kpi">
          <div className="etiqueta-kpi">Esperado (debes tener)</div>
          <div className="valor-kpi">{formatoMoneda(totales.esperado)}</div>
        </div>
        <div className="tarjeta tarjeta-kpi">
          <div className="etiqueta-kpi">Recaudado (validado)</div>
          <div className="valor-kpi">{formatoMoneda(totales.recaudado)}</div>
        </div>
        <div className="tarjeta tarjeta-kpi">
          <div className="etiqueta-kpi">Diferencia</div>
          <div className="valor-kpi diferencia">{formatoMoneda(totales.diferencia)}</div>
          {totales.enRevision > 0 && <div className="subvalor">{formatoMoneda(totales.enRevision)} en revisión</div>}
        </div>
      </div>

      <h3>Pendientes por cobrar</h3>
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
            {pendientes.map((p) => (
              <tr key={p.id}>
                <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                <td>{nombreArea(p.area_id)}</td>
                <td>{formatoFecha(p.fecha)}</td>
                <td>
                  <span className={claseEstadoPago(p.estado)}>{ETIQUETAS_ESTADO_PAGO[p.estado]}</span>
                </td>
                <td>{formatoMoneda(p.monto_esperado)}</td>
              </tr>
            ))}
            {!cargando && pendientes.length === 0 && (
              <tr>
                <td colSpan={5} className="estado-vacio">
                  No hay pendientes en este periodo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </EnvoltorioTabla>
    </div>
  );
}
