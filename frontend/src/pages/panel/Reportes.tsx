import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import {
  fechaHoyInputCdmx,
  formatoMoneda,
  nombreCompletoEmpleado,
  ordenarRangoFechas,
} from "../../lib/formato";
import { mensajeErrorConsulta, esFechaIsoValida } from "../../lib/consulta";
import { agruparReporte, semanaDe } from "../../lib/reporteCuotas";
import { catorcenaNumerada, periodoDe, semanaNumerada } from "../../lib/periodosPago";
import { cargarPagosRango } from "../../lib/consultaPagos";
import { usePersistente } from "../../lib/usePersistente";
import { descargarCsv, filaCsv } from "../../lib/csv";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import Monto from "../../components/Monto";
import ResumenEstados from "../../components/ResumenEstados";
import SelectorNumeroPeriodo from "../../components/SelectorNumeroPeriodo";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import { IconoCheck, IconoLista } from "../../components/Iconos";
import type { Empleado, PagoCuota } from "../../lib/tipos";

type ModoRango = "semana" | "catorcena" | "dia" | "rango";

export default function Reportes() {
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();

  // Filtros persistentes: al salir y volver a Reportes se conservan.
  const [modo, setModo] = usePersistente<ModoRango>("reportes.modo", "semana");
  const [fechaSemana, setFechaSemana] = usePersistente("reportes.fechaSemana", fechaHoyInputCdmx());
  const [fechaDia, setFechaDia] = usePersistente("reportes.fechaDia", fechaHoyInputCdmx());
  const [desdeRango, setDesdeRango] = usePersistente("reportes.desde", fechaHoyInputCdmx());
  const [hastaRango, setHastaRango] = usePersistente("reportes.hasta", fechaHoyInputCdmx());
  const [empleadoId, setEmpleadoId] = usePersistente("reportes.empleado", "");
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [pagos, setPagos] = useState<PagoCuota[]>([]);
  const [cargando, setCargando] = useState(true);

  const rango = useMemo(() => {
    if (modo === "semana") {
      return esFechaIsoValida(fechaSemana) ? semanaDe(fechaSemana) : null;
    }
    if (modo === "catorcena") {
      return esFechaIsoValida(fechaSemana) ? periodoDe("catorcenal", fechaSemana) : null;
    }
    if (modo === "dia") {
      return esFechaIsoValida(fechaDia) ? { desde: fechaDia, hasta: fechaDia } : null;
    }
    return esFechaIsoValida(desdeRango) && esFechaIsoValida(hastaRango)
      ? ordenarRangoFechas(desdeRango, hastaRango)
      : null;
  }, [modo, fechaSemana, fechaDia, desdeRango, hastaRango]);

  const desde = rango?.desde ?? null;
  const hasta = rango?.hasta ?? null;

  useEffect(() => {
    let cancelado = false;
    async function cargarEmpleados() {
      let consulta = supabase.from("empleados").select("*").eq("estado", "activo").order("primer_nombre");
      if (areaIdsFiltro) consulta = consulta.in("area_id", areaIdsFiltro);
      const { data, error } = await consulta;
      if (cancelado) return;
      if (error) {
        mostrarToast(mensajeErrorConsulta(error, "No se pudieron cargar los empleados."), "error");
        setEmpleados([]);
      } else {
        const lista = (data as Empleado[]) ?? [];
        setEmpleados(lista);
        setEmpleadoId((actual) => (actual && !lista.some((e) => e.id === actual) ? "" : actual));
      }
    }
    cargarEmpleados();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaIdsFiltro]);

  useEffect(() => {
    if (!desde || !hasta) {
      setPagos([]);
      setCargando(false);
      return;
    }
    let cancelado = false;
    const [d, h] = [desde, hasta];
    async function cargar() {
      setCargando(true);
      const { pagos: lista, error } = await cargarPagosRango(d, h, areaIdsFiltro, empleadoId || undefined);
      if (cancelado) return;
      if (error) {
        mostrarToast(mensajeErrorConsulta(error, "No se pudo cargar el reporte."), "error");
        setPagos([]);
      } else {
        setPagos(lista);
      }
      setCargando(false);
    }
    cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, areaIdsFiltro, empleadoId]);

  const semanas = useMemo(() => agruparReporte(pagos), [pagos]);

  const infoEmpleados = useMemo(() => {
    const mapa = new Map<string, { nombre: string; numero: string }>();
    for (const p of pagos) {
      if (p.empleados && !mapa.has(p.empleado_id)) {
        mapa.set(p.empleado_id, {
          nombre: nombreCompletoEmpleado(p.empleados),
          numero: p.empleados.numero_empleado,
        });
      }
    }
    return mapa;
  }, [pagos]);

  function nombreEmpleado(id: string) {
    return infoEmpleados.get(id)?.nombre ?? "—";
  }

  function numeroEmpleado(id: string) {
    return infoEmpleados.get(id)?.numero ?? "";
  }

  function nombreArea(areaId: string) {
    return areas.find((a) => a.id === areaId)?.nombre ?? "—";
  }

  const totales = useMemo(
    () =>
      semanas.reduce(
        (acc, s) => ({
          esperado: acc.esperado + s.esperado,
          validado: acc.validado + s.validado,
          falta: acc.falta + s.falta,
          enRevision: acc.enRevision + s.enRevision,
        }),
        { esperado: 0, validado: 0, falta: 0, enRevision: 0 },
      ),
    [semanas],
  );

  const semanasOrdenadas = useMemo(
    () =>
      semanas.map((s) => ({
        ...s,
        filas: [...s.filas].sort(
          (a, b) =>
            nombreArea(a.areaId).localeCompare(nombreArea(b.areaId), "es") ||
            nombreEmpleado(a.empleadoId).localeCompare(nombreEmpleado(b.empleadoId), "es"),
        ),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [semanas, infoEmpleados],
  );

  const faltantes = useMemo(() => {
    const lista: { clave: string; semana: string; empleadoId: string; areaId: string; monto: number }[] = [];
    for (const s of semanasOrdenadas) {
      for (const f of s.filas) {
        if (f.falta > 0)
          lista.push({
            clave: `${s.desde}|${f.empleadoId}`,
            semana: String(semanaNumerada(s.desde).numero),
            empleadoId: f.empleadoId,
            areaId: f.areaId,
            monto: f.falta,
          });
      }
    }
    return lista;
  }, [semanasOrdenadas]);

  function descargar() {
    if (!desde || !hasta) return;
    const lineas = [
      filaCsv(["Semana desde", "Semana hasta", "PS", "Empleado", "Área", "Días", "Debería", "Validado", "Falta", "En revisión"]),
    ];
    for (const s of semanasOrdenadas) {
      for (const f of s.filas) {
        lineas.push(
          filaCsv([
            s.desde,
            s.hasta,
            numeroEmpleado(f.empleadoId),
            nombreEmpleado(f.empleadoId),
            nombreArea(f.areaId),
            f.dias,
            f.esperado.toFixed(2),
            f.validado.toFixed(2),
            f.falta.toFixed(2),
            f.enRevision.toFixed(2),
          ]),
        );
      }
    }
    const nombre = desde === hasta ? `reporte_cuotas_${desde}.csv` : `reporte_cuotas_${desde}_${hasta}.csv`;
    if (!descargarCsv(nombre, lineas)) {
      mostrarToast("No se pudo generar el CSV.", "error");
    }
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Reportes</h2>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="reportes-modo">Rango</label>
            <select id="reportes-modo" value={modo} onChange={(e) => setModo(e.target.value as ModoRango)}>
              <option value="semana">Semana (jueves a miércoles)</option>
              <option value="catorcena">Catorcena (2 semanas)</option>
              <option value="dia">Un día</option>
              <option value="rango">Desde / hasta</option>
            </select>
          </div>
          {(modo === "semana" || modo === "catorcena") && (
            <SelectorNumeroPeriodo
              id="reportes-fecha-semana"
              tipo={modo === "semana" ? "semanal" : "catorcenal"}
              fecha={fechaSemana}
              onCambiarFecha={setFechaSemana}
            />
          )}
          {modo === "dia" && (
            <div className="campo" style={{ marginBottom: 0 }}>
              <label htmlFor="reportes-fecha-dia">Día</label>
              <input id="reportes-fecha-dia" type="date" value={fechaDia} onChange={(e) => setFechaDia(e.target.value)} />
            </div>
          )}
          {modo === "rango" && (
            <>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="reportes-desde">Desde</label>
                <input id="reportes-desde" type="date" value={desdeRango} onChange={(e) => setDesdeRango(e.target.value)} />
              </div>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="reportes-hasta">Hasta</label>
                <input id="reportes-hasta" type="date" value={hastaRango} onChange={(e) => setHastaRango(e.target.value)} />
              </div>
            </>
          )}
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="reportes-empleado">Empleado</label>
            <select id="reportes-empleado" value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
              <option value="">Todos</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.numero_empleado} · {nombreCompletoEmpleado(e)}
                </option>
              ))}
            </select>
          </div>
          <button className="boton boton-secundario" onClick={descargar} disabled={cargando || semanas.length === 0}>
            Descargar CSV
          </button>
        </div>
      </div>

      <div className="rejilla-kpi" style={{ marginBottom: "1rem" }}>
        <div className="tarjeta tarjeta-kpi">
          <div className="etiqueta-kpi">Debería cobrarse</div>
          <div className="valor-kpi">{formatoMoneda(totales.esperado)}</div>
        </div>
        <div className="tarjeta tarjeta-kpi kpi-validado">
          <div className="etiqueta-kpi">Validado</div>
          <div className="valor-kpi">{formatoMoneda(totales.validado)}</div>
        </div>
        <div className="tarjeta tarjeta-kpi kpi-revision">
          <div className="etiqueta-kpi">En revisión</div>
          <div className="valor-kpi">{formatoMoneda(totales.enRevision)}</div>
        </div>
        <div className="tarjeta tarjeta-kpi kpi-falta">
          <div className="etiqueta-kpi">Falta</div>
          <div className="valor-kpi">{formatoMoneda(totales.falta)}</div>
        </div>
      </div>

      {cargando ? (
        <SkeletonTabla filas={6} />
      ) : !rango ? (
        <EstadoVacio icono={<IconoLista width={32} height={32} />} mensaje="Elige una fecha válida para ver el reporte." />
      ) : semanasOrdenadas.length === 0 ? (
        <EstadoVacio
          icono={<IconoLista width={32} height={32} />}
          mensaje="No hay pagos de cuota en este rango."
        />
      ) : (
        <>
          {modo === "catorcena" && (
            <h3>Catorcena {catorcenaNumerada(rango.desde).numero}</h3>
          )}
          {semanasOrdenadas.map((s) => (
            <section key={s.desde} style={{ marginBottom: "1.5rem" }}>
              <h3>Semana {semanaNumerada(s.desde).numero}</h3>
              <ResumenEstados validado={s.validado} enRevision={s.enRevision} falta={s.falta} />
              <EnvoltorioTabla>
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Área</th>
                      <th>Días</th>
                      <th>Debería</th>
                      <th className="th-validado">Validado</th>
                      <th className="th-falta">Falta</th>
                      <th className="th-revision">En revisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.filas.map((f, i) => {
                      // Con varias áreas en la semana, cierra cada área con su subtotal (lo que entrega su responsable).
                      const variasAreas = new Set(s.filas.map((x) => x.areaId)).size > 1;
                      const cierraArea = variasAreas && s.filas[i + 1]?.areaId !== f.areaId;
                      const delArea = cierraArea ? s.filas.filter((x) => x.areaId === f.areaId) : [];
                      const suma = (campo: "esperado" | "validado" | "falta" | "enRevision") =>
                        delArea.reduce((acc, x) => acc + x[campo], 0);
                      return (
                        <Fragment key={f.empleadoId}>
                          <tr>
                            <td>
                              {nombreEmpleado(f.empleadoId)}
                              {numeroEmpleado(f.empleadoId) && (
                                <span className="texto-suave"> · PS {numeroEmpleado(f.empleadoId)}</span>
                              )}
                            </td>
                            <td>
                              <ChipArea nombre={nombreArea(f.areaId)} />
                            </td>
                            <td className="num-tabular texto-suave">{f.dias}</td>
                            <td className="num-tabular">{formatoMoneda(f.esperado)}</td>
                            <td>
                              <Monto valor={f.validado} tipo="validado" />
                            </td>
                            <td>
                              <Monto valor={f.falta} tipo="falta" />
                            </td>
                            <td>
                              <Monto valor={f.enRevision} tipo="revision" />
                            </td>
                          </tr>
                          {cierraArea && (
                            <tr className="fila-subtotal">
                              <td>
                                <strong>Subtotal {nombreArea(f.areaId)}</strong>
                              </td>
                              <td />
                              <td className="num-tabular texto-suave">{delArea.reduce((acc, x) => acc + x.dias, 0)}</td>
                              <td className="num-tabular">
                                <strong>{formatoMoneda(suma("esperado"))}</strong>
                              </td>
                              <td>
                                <Monto valor={suma("validado")} tipo="validado" />
                              </td>
                              <td>
                                <Monto valor={suma("falta")} tipo="falta" />
                              </td>
                              <td>
                                <Monto valor={suma("enRevision")} tipo="revision" />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    <tr className="fila-total">
                      <td>
                        <strong>Total de la semana</strong>
                      </td>
                      <td />
                      <td />
                      <td className="num-tabular">
                        <strong>{formatoMoneda(s.esperado)}</strong>
                      </td>
                      <td>
                        <Monto valor={s.validado} tipo="validado" />
                      </td>
                      <td>
                        <Monto valor={s.falta} tipo="falta" />
                      </td>
                      <td>
                        <Monto valor={s.enRevision} tipo="revision" />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </EnvoltorioTabla>
            </section>
          ))}

          <section>
            <h3>Faltan por cobrar</h3>
            {faltantes.length === 0 ? (
              <EstadoVacio icono={<IconoCheck width={32} height={32} />} mensaje="Nadie falta en este rango." />
            ) : (
              <EnvoltorioTabla>
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Semana</th>
                      <th>Empleado</th>
                      <th>Área</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faltantes.map((f) => (
                      <tr key={f.clave}>
                        <td className="texto-suave">{f.semana}</td>
                        <td>{nombreEmpleado(f.empleadoId)}</td>
                        <td>
                          <ChipArea nombre={nombreArea(f.areaId)} />
                        </td>
                        <td>
                          <Monto valor={f.monto} tipo="falta" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </EnvoltorioTabla>
            )}
          </section>
        </>
      )}
    </div>
  );
}
