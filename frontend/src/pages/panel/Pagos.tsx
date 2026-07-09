import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { fechaHoyInputCdmx, formatoFecha, formatoFechaHora, formatoMoneda, nombreCompletoEmpleado } from "../../lib/formato";
import ModalConfirmacion from "../../components/ModalConfirmacion";
import Modal from "../../components/Modal";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import type { Empleado, PagoCuota, RespuestaRpc } from "../../lib/tipos";

type Accion = "validar" | "rechazar";

export default function Pagos() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();
  const navegar = useNavigate();

  const [desde, setDesde] = useState(fechaHoyInputCdmx());
  const [hasta, setHasta] = useState(fechaHoyInputCdmx());
  const [pagos, setPagos] = useState<PagoCuota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [acciones, setAcciones] = useState<Record<string, Accion>>({});
  const [guardando, setGuardando] = useState(false);
  const [aRevertir, setARevertir] = useState<PagoCuota | null>(null);
  const [aEliminar, setAEliminar] = useState<PagoCuota | null>(null);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [pestana, setPestana] = useState<"revision" | "validados">("revision");

  async function cargar() {
    setCargando(true);
    let consulta = supabase
      .from("pagos_cuota")
      .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false });
    if (areaIdsFiltro) consulta = consulta.in("area_id", areaIdsFiltro);
    const { data } = await consulta;
    setPagos((data as PagoCuota[]) ?? []);
    setAcciones({});
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, areaIdsFiltro]);

  const enRevisionYPendientes = useMemo(
    () => pagos.filter((p) => p.estado === "pendiente" || p.estado === "marcado_pendiente_validacion"),
    [pagos],
  );
  const validados = useMemo(() => pagos.filter((p) => p.estado === "validado"), [pagos]);

  function nombreArea(areaId: string) {
    return areas.find((a) => a.id === areaId)?.nombre ?? "—";
  }

  function marcarAccion(id: string, accion: Accion) {
    setAcciones((prev) => ({ ...prev, [id]: prev[id] === accion ? undefined as unknown as Accion : accion }));
  }

  const cambiosPendientes = Object.values(acciones).filter(Boolean).length;

  async function guardarCambios() {
    setGuardando(true);
    let exitos = 0;
    let errores = 0;
    for (const [pagoId, accion] of Object.entries(acciones)) {
      if (!accion) continue;
      try {
        if (accion === "validar") {
          await llamarRpc("validar_pago", { p_pago_id: pagoId });
        } else {
          await llamarRpc("rechazar_pago", { p_pago_id: pagoId });
        }
        exitos++;
      } catch {
        errores++;
      }
    }
    setGuardando(false);
    if (errores === 0) {
      mostrarToast(`${exitos} cambio(s) guardado(s).`, "exito");
    } else {
      mostrarToast(`${exitos} cambio(s) guardado(s), ${errores} con error.`, "error");
    }
    navegar("/panel/dashboard");
  }

  async function confirmarRevertir(motivo: string | null) {
    if (!aRevertir) return;
    await llamarRpc<RespuestaRpc>("revertir_validacion", { p_pago_id: aRevertir.id, p_motivo: motivo });
    setARevertir(null);
    await cargar();
    mostrarToast("Validación revertida.", "exito");
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    await llamarRpc<RespuestaRpc>("eliminar_pago", { p_pago_id: aEliminar.id });
    setAEliminar(null);
    await cargar();
    mostrarToast("Pago eliminado.", "exito");
  }

  function nombreEmpleadoPago(p: PagoCuota) {
    return p.empleados ? nombreCompletoEmpleado(p.empleados) : "—";
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Pagos</h2>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {!esSupervision && (
            <button className="boton boton-acento" onClick={() => setMostrarManual(true)}>
              Registrar pago manual
            </button>
          )}
        </div>
      </div>

      <div className="fila-acciones pestanas-panel" style={{ marginBottom: "1rem" }}>
        <button
          className={`boton ${pestana === "revision" ? "boton-primario" : "boton-secundario"}`}
          onClick={() => setPestana("revision")}
        >
          Pendientes y en revisión ({enRevisionYPendientes.length})
        </button>
        <button
          className={`boton ${pestana === "validados" ? "boton-primario" : "boton-secundario"}`}
          onClick={() => setPestana("validados")}
        >
          Validados ({validados.length})
        </button>
      </div>

      {pestana === "revision" && (
        <>
          <EnvoltorioTabla>
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Área</th>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Marcado por empleado</th>
                  {!esSupervision && <th>Validar</th>}
                  {!esSupervision && <th>Rechazar</th>}
                  {!esSupervision && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {enRevisionYPendientes.map((p) => (
                  <tr key={p.id}>
                    <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                    <td>{nombreArea(p.area_id)}</td>
                    <td>{formatoFecha(p.fecha)}</td>
                    <td>{formatoMoneda(p.monto_esperado)}</td>
                    <td>{p.marcado_por_empleado ? formatoFechaHora(p.marcado_empleado_en) : "No marcado"}</td>
                    {!esSupervision && (
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox-fila"
                          checked={acciones[p.id] === "validar"}
                          onChange={() => marcarAccion(p.id, "validar")}
                        />
                      </td>
                    )}
                    {!esSupervision && (
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox-fila"
                          checked={acciones[p.id] === "rechazar"}
                          onChange={() => marcarAccion(p.id, "rechazar")}
                          disabled={p.estado !== "marcado_pendiente_validacion"}
                        />
                      </td>
                    )}
                    {!esSupervision && (
                      <td className="fila-acciones">
                        <button className="boton boton-chico boton-peligro" onClick={() => setAEliminar(p)}>
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!cargando && enRevisionYPendientes.length === 0 && (
                  <tr>
                    <td colSpan={esSupervision ? 5 : 8} className="estado-vacio">
                      No hay pagos pendientes o en revisión en este rango.
                    </td>
                  </tr>
                )}
              </tbody>
        </table>
      </EnvoltorioTabla>
          {!esSupervision && (
            <div className="fila-acciones" style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
              <button className="boton boton-primario" disabled={cambiosPendientes === 0 || guardando} onClick={guardarCambios}>
                {guardando ? "Guardando…" : `Guardar cambios (${cambiosPendientes})`}
              </button>
            </div>
          )}
        </>
      )}

      {pestana === "validados" && (
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
                <tr key={p.id}>
                  <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                  <td>{nombreArea(p.area_id)}</td>
                  <td>{formatoFecha(p.fecha)}</td>
                  <td>{formatoMoneda(p.monto_esperado)}</td>
                  <td>{formatoFechaHora(p.validado_en)}</td>
                  <td>{p.origen === "manual_admin" ? "Manual" : "Flujo normal"}</td>
                  {!esSupervision && (
                    <td className="fila-acciones">
                      <button className="boton boton-chico boton-secundario" onClick={() => setARevertir(p)}>
                        Revertir
                      </button>
                      <button className="boton boton-chico boton-peligro" onClick={() => setAEliminar(p)}>
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!cargando && validados.length === 0 && (
                <tr>
                  <td colSpan={esSupervision ? 6 : 7} className="estado-vacio">
                    No hay pagos validados en este rango.
                  </td>
                </tr>
              )}
            </tbody>
        </table>
      </EnvoltorioTabla>
      )}

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
    let consulta = supabase.from("empleados").select("*").eq("estado", "activo").order("primer_nombre");
    if (areaIdsFiltro) consulta = consulta.in("area_id", areaIdsFiltro);
    consulta.then(({ data }) => setEmpleados((data as Empleado[]) ?? []));
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
