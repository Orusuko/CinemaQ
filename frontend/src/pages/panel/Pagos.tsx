import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { fechaHoyInputCdmx, formatoFecha, formatoFechaHora, formatoMoneda, nombreCompletoEmpleado, ETIQUETAS_ESTADO_PAGO, claseEstadoPago, ordenarRangoFechas } from "../../lib/formato";
import { mensajeErrorConsulta, esFechaIsoValida } from "../../lib/consulta";
import { moverPeriodo, periodoDe } from "../../lib/periodosPago";
import { totalesPorEstado } from "../../lib/reporteCuotas";
import { cargarPagosRango } from "../../lib/consultaPagos";
import { usePersistente } from "../../lib/usePersistente";
import ResumenEstados from "../../components/ResumenEstados";
import ModalConfirmacion from "../../components/ModalConfirmacion";
import Modal from "../../components/Modal";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import Tabs from "../../components/Tabs";
import ChipArea from "../../components/ChipArea";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import { IconoCheck, IconoLista } from "../../components/Iconos";
import type { Empleado, PagoCuota, RespuestaRpc } from "../../lib/tipos";

function AccionesRevision({
  pago,
  procesando,
  onValidar,
  onRechazar,
  onEliminar,
}: {
  pago: PagoCuota;
  procesando: boolean;
  onValidar: () => void;
  onRechazar: () => void;
  onEliminar: () => void;
}) {
  const masRef = useRef<HTMLDetailsElement>(null);
  const puedeRechazar = pago.estado === "marcado_pendiente_validacion";

  function cerrarMas() {
    if (masRef.current) masRef.current.open = false;
  }

  function conCierre(accion: () => void) {
    return () => {
      cerrarMas();
      accion();
    };
  }

  return (
    <div className="acciones-inline">
      <button className="boton boton-chico boton-validar" disabled={procesando} onClick={onValidar}>
        {procesando ? "…" : "✓ Validar"}
      </button>
      <div className="acciones-secundarias-escritorio">
        {puedeRechazar && (
          <button className="boton boton-chico boton-rechazar" disabled={procesando} onClick={onRechazar}>
            ✗ Rechazar
          </button>
        )}
        <button className="boton boton-chico boton-peligro" disabled={procesando} onClick={onEliminar}>
          Eliminar
        </button>
      </div>
      <details ref={masRef} className="acciones-mas acciones-mas-movil">
        <summary className="boton boton-chico boton-secundario">Más</summary>
        <div className="acciones-mas__menu">
          {puedeRechazar && (
            <button
              className="boton boton-chico boton-rechazar"
              disabled={procesando}
              onClick={conCierre(onRechazar)}
            >
              ✗ Rechazar
            </button>
          )}
          <button
            className="boton boton-chico boton-peligro"
            disabled={procesando}
            onClick={conCierre(onEliminar)}
          >
            Eliminar
          </button>
        </div>
      </details>
    </div>
  );
}

function AccionesValidados({
  onRevertir,
  onEliminar,
}: {
  onRevertir: () => void;
  onEliminar: () => void;
}) {
  const masRef = useRef<HTMLDetailsElement>(null);

  function cerrarMas() {
    if (masRef.current) masRef.current.open = false;
  }

  return (
    <div className="acciones-inline">
      <button className="boton boton-chico boton-secundario" onClick={onRevertir}>
        Revertir
      </button>
      <div className="acciones-secundarias-escritorio">
        <button className="boton boton-chico boton-peligro" onClick={onEliminar}>
          Eliminar
        </button>
      </div>
      <details ref={masRef} className="acciones-mas acciones-mas-movil">
        <summary className="boton boton-chico boton-secundario">Más</summary>
        <div className="acciones-mas__menu">
          <button
            className="boton boton-chico boton-peligro"
            onClick={() => {
              cerrarMas();
              onEliminar();
            }}
          >
            Eliminar
          </button>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */
export default function Pagos() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filtros persistentes: al salir y volver a Pagos se conservan.
  const [tipoPeriodo, setTipoPeriodo] = usePersistente<"semanal" | "catorcenal" | "rango">("pagos.periodo", "semanal");
  const [fechaRef, setFechaRef] = usePersistente("pagos.fechaRef", fechaHoyInputCdmx());
  const [desde, setDesde] = usePersistente("pagos.desde", fechaHoyInputCdmx());
  const [hasta, setHasta] = usePersistente("pagos.hasta", fechaHoyInputCdmx());
  const [empleadoId, setEmpleadoId] = usePersistente("pagos.empleado", "");
  const tipo = tipoPeriodo === "catorcenal" || tipoPeriodo === "rango" ? tipoPeriodo : "semanal";
  const rango = useMemo(
    () =>
      tipo === "rango"
        ? ordenarRangoFechas(desde, hasta)
        : periodoDe(tipo, esFechaIsoValida(fechaRef) ? fechaRef : fechaHoyInputCdmx()),
    [tipo, desde, hasta, fechaRef],
  );
  const [pagos, setPagos] = useState<PagoCuota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [aRevertir, setARevertir] = useState<PagoCuota | null>(null);
  const [aRechazar, setARechazar] = useState<PagoCuota | null>(null);
  const [aEliminar, setAEliminar] = useState<PagoCuota | null>(null);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [pestana, setPestana] = usePersistente<"revision" | "validados">("pagos.pestana", "revision");
  const pagoResaltadoUrl = searchParams.get("pago");
  const [pagoResaltado, setPagoResaltado] = useState<string | null>(pagoResaltadoUrl);

  useEffect(() => {
    setPagoResaltado(pagoResaltadoUrl);
    if (!pagoResaltadoUrl) return;
    const t = window.setTimeout(() => setPagoResaltado(null), 4000);
    return () => window.clearTimeout(t);
  }, [pagoResaltadoUrl]);

  async function cargar() {
    setCargando(true);
    const { pagos: lista, error } = await cargarPagosRango(rango.desde, rango.hasta, areaIdsFiltro);
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudieron cargar los pagos."), "error");
      setPagos([]);
    } else {
      setPagos(lista);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango.desde, rango.hasta, areaIdsFiltro]);

  useEffect(() => {
    const pestanaUrl = searchParams.get("pestana");
    if (pestanaUrl === "revision" || pestanaUrl === "validados") {
      setPestana(pestanaUrl);
    }
    const desdeUrl = searchParams.get("desde");
    const hastaUrl = searchParams.get("hasta");
    if (esFechaIsoValida(desdeUrl) && esFechaIsoValida(hastaUrl)) {
      const rangoUrl = ordenarRangoFechas(desdeUrl, hastaUrl);
      setDesde(rangoUrl.desde);
      setHasta(rangoUrl.hasta);
      setTipoPeriodo("rango");
    }
  }, [searchParams]);

  /* Deep-link desde notificaciones: ?pago=uuid (completa fecha/pestaña si faltan) */
  useEffect(() => {
    if (!pagoResaltadoUrl) return;
    let cancelado = false;
    async function resolverPago() {
      const { data } = await supabase
        .from("pagos_cuota")
        .select("fecha, estado")
        .eq("id", pagoResaltadoUrl)
        .maybeSingle();
      if (cancelado || !data) return;
      if (!esFechaIsoValida(searchParams.get("desde")) || !esFechaIsoValida(searchParams.get("hasta"))) {
        setDesde(data.fecha);
        setHasta(data.fecha);
        setTipoPeriodo("rango");
      }
      if (searchParams.get("pestana") !== "revision" && searchParams.get("pestana") !== "validados") {
        setPestana(data.estado === "validado" ? "validados" : "revision");
      }
    }
    resolverPago();
    return () => {
      cancelado = true;
    };
  }, [pagoResaltadoUrl, searchParams]);

  useEffect(() => {
    if (!pagoResaltadoUrl || cargando) return;
    const fila = document.getElementById(`pago-${pagoResaltadoUrl}`);
    if (fila) {
      fila.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [pagoResaltadoUrl, cargando, pagos, pestana]);

  // Empleados presentes en el periodo cargado; el filtro se aplica en cliente (sin nueva consulta).
  const opcionesEmpleado = useMemo(() => {
    const mapa = new Map<string, { nombre: string; numero: string }>();
    for (const p of pagos) {
      if (p.empleados && !mapa.has(p.empleado_id)) {
        mapa.set(p.empleado_id, { nombre: nombreCompletoEmpleado(p.empleados), numero: p.empleados.numero_empleado });
      }
    }
    return [...mapa].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"));
  }, [pagos]);
  const empleadoActivo = opcionesEmpleado.some(([id]) => id === empleadoId) ? empleadoId : "";
  const pagosVisibles = useMemo(
    () => (empleadoActivo ? pagos.filter((p) => p.empleado_id === empleadoActivo) : pagos),
    [pagos, empleadoActivo],
  );
  const totales = useMemo(() => totalesPorEstado(pagosVisibles), [pagosVisibles]);

  const enRevisionYPendientes = useMemo(
    () => pagosVisibles.filter((p) => p.estado === "pendiente" || p.estado === "marcado_pendiente_validacion"),
    [pagosVisibles],
  );
  const validados = useMemo(() => pagosVisibles.filter((p) => p.estado === "validado"), [pagosVisibles]);

  function nombreArea(areaId: string) {
    return areas.find((a) => a.id === areaId)?.nombre ?? "—";
  }

  /* --- Acciones inline por fila --- */
  async function validarPago(pagoId: string) {
    setProcesandoId(pagoId);
    try {
      await llamarRpc("validar_pago", { p_pago_id: pagoId });
      mostrarToast("Pago validado correctamente.", "exito");
      await cargar();
    } catch {
      mostrarToast("Error al validar el pago.", "error");
    } finally {
      setProcesandoId(null);
    }
  }

  async function confirmarRechazar() {
    if (!aRechazar) return;
    try {
      await llamarRpc("rechazar_pago", { p_pago_id: aRechazar.id });
      setARechazar(null);
      mostrarToast("Pago rechazado. El empleado puede volver a marcarlo.", "exito");
      await cargar();
    } catch (e) {
      throw e instanceof Error ? e : new Error("No se pudo rechazar el pago.");
    }
  }

  async function confirmarRevertir(motivo: string | null) {
    if (!aRevertir) return;
    try {
      await llamarRpc<RespuestaRpc>("revertir_validacion", { p_pago_id: aRevertir.id, p_motivo: motivo });
      setARevertir(null);
      await cargar();
      mostrarToast("Validación revertida.", "exito");
    } catch (e) {
      throw e instanceof Error ? e : new Error("No se pudo revertir la validación.");
    }
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    try {
      await llamarRpc<RespuestaRpc>("eliminar_pago", { p_pago_id: aEliminar.id });
      setAEliminar(null);
      await cargar();
      mostrarToast("Pago eliminado.", "exito");
    } catch (e) {
      throw e instanceof Error ? e : new Error("No se pudo eliminar el pago.");
    }
  }

  function nombreEmpleadoPago(p: PagoCuota) {
    return p.empleados ? nombreCompletoEmpleado(p.empleados) : "—";
  }

  // El límite también va a la URL (deep links); si no, el efecto de searchParams lo revertiría.
  function cambiarLimite(campo: "desde" | "hasta", valor: string) {
    (campo === "desde" ? setDesde : setHasta)(valor);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(campo, valor);
      return next;
    }, { replace: true });
  }

  const pestanasConfig = [
    { id: "revision", etiqueta: "Pendientes y en revisión", contador: enRevisionYPendientes.length },
    { id: "validados", etiqueta: "Validados", contador: validados.length },
  ];

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Pagos</h2>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="pagos-periodo">Periodo</label>
            <select
              id="pagos-periodo"
              value={tipo}
              onChange={(e) => {
                const nuevo = e.target.value as "semanal" | "catorcenal" | "rango";
                if (nuevo === "rango") {
                  setDesde(rango.desde);
                  setHasta(rango.hasta);
                } else {
                  setFechaRef(rango.desde);
                }
                setTipoPeriodo(nuevo);
                // Quita desde/hasta de la URL para que no fuercen de nuevo el modo "rango".
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("desde");
                  next.delete("hasta");
                  return next;
                }, { replace: true });
              }}
            >
              <option value="semanal">Semanal (jueves a miércoles)</option>
              <option value="catorcenal">Catorcenal (2 semanas)</option>
              <option value="rango">Desde / hasta</option>
            </select>
          </div>
          {tipo === "rango" ? (
            <>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="pagos-filtro-desde">Desde</label>
                <input id="pagos-filtro-desde" type="date" value={desde} onChange={(e) => cambiarLimite("desde", e.target.value)} />
              </div>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="pagos-filtro-hasta">Hasta</label>
                <input id="pagos-filtro-hasta" type="date" value={hasta} onChange={(e) => cambiarLimite("hasta", e.target.value)} />
              </div>
            </>
          ) : (
            <div className="periodo-nav">
              <button
                type="button"
                className="boton boton-secundario boton-chico"
                aria-label="Periodo anterior"
                onClick={() => setFechaRef(moverPeriodo(tipo, rango.desde, -1))}
              >
                ‹
              </button>
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="pagos-fecha-ref">{tipo === "semanal" ? "Semana" : "Catorcena"} que contiene</label>
                <input id="pagos-fecha-ref" type="date" value={fechaRef} onChange={(e) => setFechaRef(e.target.value)} />
              </div>
              <button
                type="button"
                className="boton boton-secundario boton-chico"
                aria-label="Periodo siguiente"
                onClick={() => setFechaRef(moverPeriodo(tipo, rango.desde, 1))}
              >
                ›
              </button>
              <button type="button" className="boton boton-secundario boton-chico" onClick={() => setFechaRef(fechaHoyInputCdmx())}>
                Hoy
              </button>
            </div>
          )}
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="pagos-empleado">Empleado</label>
            <select id="pagos-empleado" value={empleadoActivo} onChange={(e) => setEmpleadoId(e.target.value)}>
              <option value="">Todos</option>
              {opcionesEmpleado.map(([id, info]) => (
                <option key={id} value={id}>
                  {info.numero} · {info.nombre}
                </option>
              ))}
            </select>
          </div>
          {!esSupervision && (
            <button className="boton boton-acento" onClick={() => setMostrarManual(true)}>
              Registrar pago manual
            </button>
          )}
        </div>
      </div>

      <p className="periodo-rango">
        Del {formatoFecha(rango.desde)} al {formatoFecha(rango.hasta)}
      </p>
      {!cargando && <ResumenEstados validado={totales.validado} enRevision={totales.enRevision} falta={totales.falta} />}

      <Tabs pestanas={pestanasConfig} activa={pestana} onChange={(id) => {
        setPestana(id as "revision" | "validados");
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("pestana", id);
          return next;
        }, { replace: true });
      }}>
        {pestana === "revision" && (
          <>
            {cargando ? (
              <SkeletonTabla />
            ) : enRevisionYPendientes.length === 0 ? (
              <EstadoVacio
                icono={<IconoCheck width={32} height={32} />}
                mensaje="No hay pagos pendientes o en revisión en este rango."
              />
            ) : (
              <EnvoltorioTabla>
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Área</th>
                      <th>Fecha</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      <th>Marcado por empleado</th>
                      {!esSupervision && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {enRevisionYPendientes.map((p) => (
                      <tr
                        key={p.id}
                        id={`pago-${p.id}`}
                        className={pagoResaltado === p.id ? "fila-resaltada" : undefined}
                      >
                        <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                        <td><ChipArea nombre={nombreArea(p.area_id)} /></td>
                        <td className="num-tabular">{formatoFecha(p.fecha)}</td>
                        <td className="num-tabular">{formatoMoneda(p.monto_esperado)}</td>
                        <td>
                          <span className={claseEstadoPago(p.estado)}>{ETIQUETAS_ESTADO_PAGO[p.estado]}</span>
                        </td>
                        <td>{p.marcado_por_empleado ? formatoFechaHora(p.marcado_empleado_en) : "No marcado"}</td>
                        {!esSupervision && (
                          <td className="fila-acciones">
                            <AccionesRevision
                              pago={p}
                              procesando={procesandoId === p.id}
                              onValidar={() => validarPago(p.id)}
                              onRechazar={() => setARechazar(p)}
                              onEliminar={() => setAEliminar(p)}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </EnvoltorioTabla>
            )}
          </>
        )}

        {pestana === "validados" && (
          <>
            {cargando ? (
              <SkeletonTabla filas={6} />
            ) : validados.length === 0 ? (
              <EstadoVacio
                icono={<IconoLista width={32} height={32} />}
                mensaje="No hay pagos validados en este rango."
              />
            ) : (
              <EnvoltorioTabla>
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Área</th>
                      <th>Fecha</th>
                      <th>Monto</th>
                      <th>Validado el</th>
                      <th>Origen</th>
                      {!esSupervision && <th>Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {validados.map((p) => (
                      <tr
                        key={p.id}
                        id={`pago-${p.id}`}
                        className={pagoResaltado === p.id ? "fila-resaltada" : undefined}
                      >
                        <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                        <td><ChipArea nombre={nombreArea(p.area_id)} /></td>
                        <td className="num-tabular">{formatoFecha(p.fecha)}</td>
                        <td className="num-tabular">{formatoMoneda(p.monto_esperado)}</td>
                        <td className="num-tabular">{formatoFechaHora(p.validado_en)}</td>
                        <td>{p.origen === "manual_admin" ? "Manual" : "Flujo normal"}</td>
                        {!esSupervision && (
                          <td className="fila-acciones">
                            <AccionesValidados
                              onRevertir={() => setARevertir(p)}
                              onEliminar={() => setAEliminar(p)}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </EnvoltorioTabla>
            )}
          </>
        )}
      </Tabs>

      {aRevertir && (
        <ModalConfirmacion
          titulo="Revertir validación"
          mensaje={`El pago de ${nombreEmpleadoPago(aRevertir)} volverá a estado pendiente.`}
          motivoObligatorio
          etiquetaBotonConfirmar="Revertir"
          peligro
          onCancelar={() => setARevertir(null)}
          onConfirmar={confirmarRevertir}
        />
      )}

      {aRechazar && (
        <ModalConfirmacion
          titulo="Rechazar pago"
          mensaje={`¿Confirmas rechazar el pago de ${nombreEmpleadoPago(aRechazar)} (${formatoFecha(aRechazar.fecha)})? El empleado podrá volver a marcarlo.`}
          etiquetaBotonConfirmar="Rechazar"
          peligro
          onCancelar={() => setARechazar(null)}
          onConfirmar={confirmarRechazar}
        />
      )}

      {aEliminar && (
        <ModalConfirmacion
          titulo="Eliminar pago"
          mensaje={`¿Está seguro de que desea eliminar el pago de ${nombreEmpleadoPago(aEliminar)} (${formatoFecha(aEliminar.fecha)}, ${formatoMoneda(aEliminar.monto_esperado)})? Esta acción no se puede deshacer.`}
          etiquetaBotonConfirmar="Eliminar"
          peligro
          onCancelar={() => setAEliminar(null)}
          onConfirmar={async () => {
            await confirmarEliminar();
          }}
        />
      )}

      {mostrarManual && (
        <ModalPagoManual
          areaIdsFiltro={areaIdsFiltro}
          onCerrar={() => setMostrarManual(false)}
          onRegistrado={() => {
            setMostrarManual(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalPagoManual({
  areaIdsFiltro,
  onCerrar,
  onRegistrado,
}: {
  areaIdsFiltro: string[] | null;
  onCerrar: () => void;
  onRegistrado: () => void;
}) {
  const { mostrarToast } = useToast();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadoId, setEmpleadoId] = useState("");
  const [fecha, setFecha] = useState(fechaHoyInputCdmx());
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setEmpleados((data as Empleado[]) ?? []);
      }
    }
    cargarEmpleados();
    return () => {
      cancelado = true;
    };
  }, [areaIdsFiltro]);

  async function enviar() {
    if (!empleadoId) return;
    setEnviando(true);
    setError(null);
    try {
      await llamarRpc<RespuestaRpc>("registrar_pago_manual", { p_empleado_id: empleadoId, p_fecha: fecha, p_notas: notas || null });
      mostrarToast("Pago manual registrado y validado.", "exito");
      onRegistrado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Registrar pago manual" onCerrar={onCerrar}>
      <div className="campo">
        <label>Empleado</label>
        <select value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)}>
          <option value="">Selecciona un empleado…</option>
          {empleados.map((e) => (
            <option key={e.id} value={e.id}>
              {e.numero_empleado} · {nombreCompletoEmpleado(e)}
            </option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label>Fecha</label>
        <input type="date" value={fecha} max={fechaHoyInputCdmx()} onChange={(e) => setFecha(e.target.value)} />
      </div>
      <div className="campo">
        <label>Notas (opcional)</label>
        <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      <div className="fila-acciones" style={{ justifyContent: "flex-end" }}>
        <button className="boton boton-secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </button>
        <button className="boton boton-primario" onClick={enviar} disabled={!empleadoId || enviando}>
          {enviando ? "Registrando…" : "Registrar y validar"}
        </button>
      </div>
    </Modal>
  );
}
