import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { fechaHoyInputCdmx, nombreCompletoEmpleado, ETIQUETAS_ESTADO_PAGO, claseEstadoPago } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import ModalConfirmacion from "../../components/ModalConfirmacion";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import type { AsistenciaDiaria, Empleado, EstadoPago, RespuestaRpc } from "../../lib/tipos";

export default function Asistencia() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();
  const [fecha, setFecha] = useState(fechaHoyInputCdmx());
  const [asistencias, setAsistencias] = useState<AsistenciaDiaria[]>([]);
  const [estadosPago, setEstadosPago] = useState<Record<string, EstadoPago>>({});
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadoNuevo, setEmpleadoNuevo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [aEliminar, setAEliminar] = useState<AsistenciaDiaria | null>(null);

  const areaUnica = areaIdsFiltro && areaIdsFiltro.length === 1 ? areaIdsFiltro[0] : null;
  const hoy = fechaHoyInputCdmx();
  const fechaMinima = useMemo(() => {
    const d = new Date(`${hoy}T00:00:00`);
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, [hoy]);

  async function cargar() {
    setCargando(true);
    let consulta = supabase
      .from("asistencia_diaria")
      .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
      .eq("fecha", fecha)
      .eq("eliminado", false);
    if (areaIdsFiltro) consulta = consulta.in("area_id", areaIdsFiltro);

    let consultaPagos = supabase.from("pagos_cuota").select("empleado_id, estado").eq("fecha", fecha);
    if (areaIdsFiltro) consultaPagos = consultaPagos.in("area_id", areaIdsFiltro);

    let consultaEmpleados = supabase.from("empleados").select("*").eq("estado", "activo").order("primer_nombre");
    if (areaIdsFiltro) consultaEmpleados = consultaEmpleados.in("area_id", areaIdsFiltro);

    const [respAsistencia, respPagos, respEmpleados] = await Promise.all([consulta, consultaPagos, consultaEmpleados]);
    const error = respAsistencia.error ?? respPagos.error ?? respEmpleados.error;
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudo cargar la asistencia."), "error");
      setAsistencias([]);
      setEstadosPago({});
      setEmpleados([]);
    } else {
      setAsistencias((respAsistencia.data as AsistenciaDiaria[]) ?? []);
      const mapa: Record<string, EstadoPago> = {};
      for (const p of (respPagos.data as { empleado_id: string; estado: EstadoPago }[]) ?? []) {
        mapa[p.empleado_id] = p.estado;
      }
      setEstadosPago(mapa);
      setEmpleados((respEmpleados.data as Empleado[]) ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, areaIdsFiltro]);

  const idsConAsistencia = new Set(asistencias.map((a) => a.empleado_id));
  const disponiblesParaAgregar = empleados.filter((e) => !idsConAsistencia.has(e.id));

  async function agregarAsistencia() {
    if (!empleadoNuevo) return;
    setProcesando(true);
    try {
      await llamarRpc<RespuestaRpc>("registrar_asistencia", { p_empleado_id: empleadoNuevo, p_fecha: fecha });
      setEmpleadoNuevo("");
      await cargar();
      mostrarToast("Asistencia registrada.", "exito");
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesando(false);
    }
  }

  async function confirmarEliminar(motivo: string | null) {
    if (!aEliminar) return;
    const nombre = aEliminar.empleados ? nombreCompletoEmpleado(aEliminar.empleados) : "el registro";
    await llamarRpc<RespuestaRpc>("soft_delete_asistencia", { p_asistencia_id: aEliminar.id, p_motivo: motivo });
    const idParaRevertir = aEliminar.id;
    setAEliminar(null);
    await cargar();
    mostrarToast(`Se ha eliminado la asistencia de ${nombre}.`, "info", {
      etiqueta: "Revertir",
      al_hacer_click: async () => {
        try {
          await llamarRpc("revertir_eliminacion_asistencia", { p_asistencia_id: idParaRevertir });
          await cargar();
          mostrarToast("Se revirtió la eliminación.", "exito");
        } catch (e) {
          mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
        }
      },
    });
  }

  return (
    <div>
      <div className="barra-herramientas">
        <div>
          <h2 style={{ marginBottom: "0.15rem" }}>Asistencia</h2>
          <p className="texto-suave" style={{ margin: 0 }}>
            Altas tardías (hasta 7 días) y bajas. El enrolamiento del día se hace en Horario.
          </p>
        </div>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Fecha</label>
            <input
              type="date"
              value={fecha}
              min={fechaMinima}
              max={hoy}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        </div>
      </div>

      {!esSupervision && areaUnica && (
        <div className="barra-herramientas">
          <div className="grupo-filtros">
            <div className="campo" style={{ marginBottom: 0, minWidth: 260 }}>
              <label>Agregar asistencia (hasta 7 días atrás)</label>
              <select value={empleadoNuevo} onChange={(e) => setEmpleadoNuevo(e.target.value)}>
                <option value="">Selecciona un empleado…</option>
                {disponiblesParaAgregar.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.numero_empleado} · {nombreCompletoEmpleado(e)}
                  </option>
                ))}
              </select>
            </div>
            <button className="boton boton-primario" disabled={!empleadoNuevo || procesando} onClick={agregarAsistencia}>
              Registrar
            </button>
          </div>
        </div>
      )}

      {cargando ? (
        <div className="tarjeta" style={{ padding: "1rem" }} aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-fila" />
          ))}
        </div>
      ) : (
      <EnvoltorioTabla>
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Número</th>
              <th>Nombre</th>
              <th>Área</th>
              <th>Estado de pago</th>
              {!esSupervision && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {asistencias.map((a) => (
              <tr key={a.id}>
                <td>{a.empleados?.numero_empleado}</td>
                <td>{a.empleados ? nombreCompletoEmpleado(a.empleados) : "—"}</td>
                <td><ChipArea nombre={areas.find((ar) => ar.id === a.area_id)?.nombre ?? "—"} /></td>
                <td>
                  {estadosPago[a.empleado_id]
                    ? <span className={claseEstadoPago(estadosPago[a.empleado_id])}>{ETIQUETAS_ESTADO_PAGO[estadosPago[a.empleado_id]]}</span>
                    : "—"}
                </td>
                {!esSupervision && (
                  <td>
                    <button className="boton boton-chico boton-peligro" onClick={() => setAEliminar(a)}>
                      Eliminar
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {asistencias.length === 0 && (
              <tr>
                <td colSpan={esSupervision ? 4 : 5} className="estado-vacio">
                  No hay asistencia registrada para esta fecha.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </EnvoltorioTabla>
      )}

      {aEliminar && (
        <ModalConfirmacion
          titulo="Eliminar asistencia"
          mensaje={`¿Confirmas eliminar la asistencia de ${aEliminar.empleados ? nombreCompletoEmpleado(aEliminar.empleados) : ""}? ${
            estadosPago[aEliminar.empleado_id] === "validado"
              ? "Este pago ya estaba validado: el motivo es obligatorio."
              : "El pago vinculado quedará cancelado."
          }`}
          motivoObligatorio={estadosPago[aEliminar.empleado_id] === "validado"}
          motivoOpcional={estadosPago[aEliminar.empleado_id] !== "validado"}
          etiquetaBotonConfirmar="Eliminar"
          peligro
          onCancelar={() => setAEliminar(null)}
          onConfirmar={confirmarEliminar}
        />
      )}
    </div>
  );
}
