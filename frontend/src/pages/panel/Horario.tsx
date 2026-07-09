import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { fechaHoyInputCdmx, nombreCompletoEmpleado } from "../../lib/formato";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import type { Empleado, HorarioDiario, RespuestaRpc } from "../../lib/tipos";

export default function Horario() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();
  const [fecha, setFecha] = useState(fechaHoyInputCdmx());
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [horario, setHorario] = useState<HorarioDiario[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const areaUnica = areaIdsFiltro && areaIdsFiltro.length === 1 ? areaIdsFiltro[0] : null;

  async function cargar() {
    setCargando(true);
    let consultaEmpleados = supabase.from("empleados").select("*").eq("estado", "activo").order("primer_nombre");
    if (areaIdsFiltro) consultaEmpleados = consultaEmpleados.in("area_id", areaIdsFiltro);

    let consultaHorario = supabase
      .from("horario_diario")
      .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
      .eq("fecha", fecha);
    if (areaIdsFiltro) consultaHorario = consultaHorario.in("area_id", areaIdsFiltro);

    const [{ data: datosEmpleados }, { data: datosHorario }] = await Promise.all([consultaEmpleados, consultaHorario]);
    setEmpleados((datosEmpleados as Empleado[]) ?? []);
    setHorario((datosHorario as HorarioDiario[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, areaIdsFiltro]);

  const idsEnHorario = new Set(horario.map((h) => h.empleado_id));

  async function alternarHorario(empleadoId: string) {
    setProcesando(true);
    try {
      if (idsEnHorario.has(empleadoId)) {
        await llamarRpc("quitar_horario", { p_empleado_id: empleadoId, p_fecha: fecha });
      } else {
        await llamarRpc("registrar_horario", { p_empleado_id: empleadoId, p_fecha: fecha });
      }
      await cargar();
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesando(false);
    }
  }

  function alternarSeleccion(id: string) {
    setSeleccionados((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  async function registrarAsistenciaDeSeleccionados() {
    if (seleccionados.size === 0) return;
    setProcesando(true);
    try {
      const respuesta = await llamarRpc<RespuestaRpc & { registrados: number; errores: unknown[] }>(
        "registrar_asistencia_desde_horario",
        { p_fecha: fecha, p_empleado_ids: Array.from(seleccionados) },
      );
      mostrarToast(`Asistencia registrada para ${respuesta.registrados} empleado(s).`, "exito");
      setSeleccionados(new Set());
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Horario del día</h2>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
      </div>

      {!esSupervision && !areaUnica && (
        <p className="texto-suave">
          Selecciona un área específica arriba (no "Ambas áreas") para poder agregar o quitar empleados del horario.
        </p>
      )}

      {!esSupervision && (
        <div className="barra-herramientas">
          <p className="texto-suave">
            Marca quiénes están enrolados hoy. Después usa "Registrar asistencia" para generar su obligación de pago.
          </p>
          <button
            className="boton boton-primario"
            disabled={seleccionados.size === 0 || procesando}
            onClick={registrarAsistenciaDeSeleccionados}
          >
            Registrar asistencia de seleccionados ({seleccionados.size})
          </button>
        </div>
      )}

      <EnvoltorioTabla>
        <table className="tabla-datos">
          <thead>
            <tr>
              {!esSupervision && <th>Seleccionar</th>}
              <th>Número</th>
              <th>Nombre</th>
              <th>Área</th>
              <th>En horario</th>
              {!esSupervision && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {empleados.map((e) => (
              <tr key={e.id}>
                {!esSupervision && (
                  <td>
                    <input
                      type="checkbox"
                      className="checkbox-fila"
                      checked={seleccionados.has(e.id)}
                      onChange={() => alternarSeleccion(e.id)}
                      disabled={!idsEnHorario.has(e.id)}
                    />
                  </td>
                )}
                <td>{e.numero_empleado}</td>
                <td>{nombreCompletoEmpleado(e)}</td>
                <td><ChipArea nombre={areas.find((a) => a.id === e.area_id)?.nombre ?? "—"} /></td>
                <td>{idsEnHorario.has(e.id) ? "Sí" : "No"}</td>
                {!esSupervision && (
                  <td>
                    <button
                      className={`boton boton-chico ${idsEnHorario.has(e.id) ? "boton-secundario" : "boton-primario"}`}
                      onClick={() => alternarHorario(e.id)}
                      disabled={!areaUnica || procesando}
                    >
                      {idsEnHorario.has(e.id) ? "Quitar" : "Agregar"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!cargando && empleados.length === 0 && (
              <tr>
                <td colSpan={esSupervision ? 4 : 6} className="estado-vacio">
                  No hay empleados activos en esta área.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </EnvoltorioTabla>
    </div>
  );
}
