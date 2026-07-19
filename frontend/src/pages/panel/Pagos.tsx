import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { fechaHoyInputCdmx, formatoFecha, formatoFechaHora, formatoMoneda, nombreCompletoEmpleado, ETIQUETAS_ESTADO_PAGO, claseEstadoPago, ordenarRangoFechas } from "../../lib/formato";
import { mensajeErrorConsulta, esFechaIsoValida } from "../../lib/consulta";
import ModalConfirmacion from "../../components/ModalConfirmacion";
import Modal from "../../components/Modal";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import Tabs from "../../components/Tabs";
import ChipArea from "../../components/ChipArea";
import { IconoCheck, IconoLista } from "../../components/Iconos";
import type { Empleado, PagoCuota, RespuestaRpc } from "../../lib/tipos";

/* ------------------------------------------------------------------ */
/* Skeletons                                                            */
/* ------------------------------------------------------------------ */
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
export default function Pagos() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [desde, setDesde] = useState(fechaHoyInputCdmx());
  const [hasta, setHasta] = useState(fechaHoyInputCdmx());
  const [pagos, setPagos] = useState<PagoCuota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [aRevertir, setARevertir] = useState<PagoCuota | null>(null);
  const [aRechazar, setARechazar] = useState<PagoCuota | null>(null);
  const [aEliminar, setAEliminar] = useState<PagoCuota | null>(null);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [pestana, setPestana] = useState<"revision" | "validados">("revision");
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
    const rango = ordenarRangoFechas(desde, hasta);
    let consulta = supabase
      .from("pagos_cuota")
      .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
      .gte("fecha", rango.desde)
      .lte("fecha", rango.hasta)
      .order("fecha", { ascending: false });
    if (areaIdsFiltro) consulta = consulta.in("area_id", areaIdsFiltro);
    const { data, error } = await consulta;
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudieron cargar los pagos."), "error");
      setPagos([]);
    } else {
      setPagos((data as PagoCuota[]) ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, areaIdsFiltro]);

  useEffect(() => {
    const pestanaUrl = searchParams.get("pestana");
    if (pestanaUrl === "revision" || pestanaUrl === "validados") {
      setPestana(pestanaUrl);
    }
    const desdeUrl = searchParams.get("desde");
    const hastaUrl = searchParams.get("hasta");
    if (esFechaIsoValida(desdeUrl) && esFechaIsoValida(hastaUrl)) {
      const rango = ordenarRangoFechas(desdeUrl, hastaUrl);
      setDesde(rango.desde);
      setHasta(rango.hasta);
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

  const enRevisionYPendientes = useMemo(
    () => pagos.filter((p) => p.estado === "pendiente" || p.estado === "marcado_pendiente_validacion"),
    [pagos],
  );
  const validados = useMemo(() => pagos.filter((p) => p.estado === "validado"), [pagos]);

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
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => {
              const valor = e.target.value;
              setDesde(valor);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("desde", valor);
                return next;
              }, { replace: true });
            }} />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => {
              const valor = e.target.value;
              setHasta(valor);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("hasta", valor);
                return next;
              }, { replace: true });
            }} />
          </div>
          {!esSupervision && (
            <button className="boton boton-acento" onClick={() => setMostrarManual(true)}>
              Registrar pago manual
            </button>
          )}
        </div>
      </div>

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
              <div className="estado-vacio-ilustrado">
                <span className="icono-vacio"><IconoCheck width={32} height={32} /></span>
                <p>No hay pagos pendientes o en revisión en este rango.</p>
              </div>
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
                        <td>{formatoFecha(p.fecha)}</td>
                        <td>{formatoMoneda(p.monto_esperado)}</td>
                        <td>
                          <span className={claseEstadoPago(p.estado)}>{ETIQUETAS_ESTADO_PAGO[p.estado]}</span>
                        </td>
                        <td>{p.marcado_por_empleado ? formatoFechaHora(p.marcado_empleado_en) : "No marcado"}</td>
                        {!esSupervision && (
                          <td className="fila-acciones">
                            <div className="acciones-inline">
                              <button
                                className="boton boton-chico boton-validar"
                                disabled={procesandoId === p.id}
                                onClick={() => validarPago(p.id)}
                              >
                                {procesandoId === p.id ? "…" : "✓ Validar"}
                              </button>
                              {p.estado === "marcado_pendiente_validacion" && (
                                <button
                                  className="boton boton-chico boton-rechazar"
                                  disabled={procesandoId === p.id}
                                  onClick={() => setARechazar(p)}
                                >
                                  ✗ Rechazar
                                </button>
                              )}
                              <button
                                className="boton boton-chico boton-peligro"
                                disabled={procesandoId === p.id}
                                onClick={() => setAEliminar(p)}
                              >
                                Eliminar
                              </button>
                            </div>
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
              <div className="estado-vacio-ilustrado">
                <span className="icono-vacio"><IconoLista width={32} height={32} /></span>
                <p>No hay pagos validados en este rango.</p>
              </div>
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
                        <td>{formatoFecha(p.fecha)}</td>
                        <td>{formatoMoneda(p.monto_esperado)}</td>
                        <td>{formatoFechaHora(p.validado_en)}</td>
                        <td>{p.origen === "manual_admin" ? "Manual" : "Flujo normal"}</td>
                        {!esSupervision && (
                          <td className="fila-acciones">
                            <div className="acciones-inline">
                              <button className="boton boton-chico boton-secundario" onClick={() => setARevertir(p)}>
                                Revertir
                              </button>
                              <button className="boton boton-chico boton-peligro" onClick={() => setAEliminar(p)}>
                                Eliminar
                              </button>
                            </div>
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
