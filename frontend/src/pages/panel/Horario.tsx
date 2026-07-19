import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { fechaHoyInputCdmx, nombreCompletoEmpleado } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import { IconoCheck } from "../../components/Iconos";
import type { Empleado, HorarioDiario, RespuestaRpc } from "../../lib/tipos";

export default function Horario() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();
  const [fecha, setFecha] = useState(fechaHoyInputCdmx());
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [horario, setHorario] = useState<HorarioDiario[]>([]);
  const [idsConAsistencia, setIdsConAsistencia] = useState<Set<string>>(new Set());
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);

  const areaUnica = areaIdsFiltro && areaIdsFiltro.length === 1 ? areaIdsFiltro[0] : null;

  async function cargar(opciones?: { preseleccionarPendientes?: boolean }) {
    setCargando(true);
    let consultaEmpleados = supabase.from("empleados").select("*").eq("estado", "activo").order("primer_nombre");
    if (areaIdsFiltro) consultaEmpleados = consultaEmpleados.in("area_id", areaIdsFiltro);

    let consultaHorario = supabase
      .from("horario_diario")
      .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
      .eq("fecha", fecha);
    if (areaIdsFiltro) consultaHorario = consultaHorario.in("area_id", areaIdsFiltro);

    let consultaAsistencia = supabase
      .from("asistencia_diaria")
      .select("empleado_id")
      .eq("fecha", fecha)
      .eq("eliminado", false);
    if (areaIdsFiltro) consultaAsistencia = consultaAsistencia.in("area_id", areaIdsFiltro);

    const [respEmpleados, respHorario, respAsistencia] = await Promise.all([
      consultaEmpleados,
      consultaHorario,
      consultaAsistencia,
    ]);
    const error = respEmpleados.error ?? respHorario.error ?? respAsistencia.error;
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudo cargar el horario."), "error");
      setEmpleados([]);
      setHorario([]);
      setIdsConAsistencia(new Set());
      setSeleccionados(new Set());
    } else {
      const listaHorario = (respHorario.data as HorarioDiario[]) ?? [];
      const idsAsistencia = new Set(
        ((respAsistencia.data as { empleado_id: string }[]) ?? []).map((a) => a.empleado_id),
      );
      setEmpleados((respEmpleados.data as Empleado[]) ?? []);
      setHorario(listaHorario);
      setIdsConAsistencia(idsAsistencia);
      if (opciones?.preseleccionarPendientes) {
        setSeleccionados(
          new Set(
            listaHorario
              .map((h) => h.empleado_id)
              .filter((id) => !idsAsistencia.has(id)),
          ),
        );
      } else {
        setSeleccionados((prev) => {
          const siguiente = new Set<string>();
          for (const id of prev) {
            if (!idsAsistencia.has(id) && listaHorario.some((h) => h.empleado_id === id)) {
              siguiente.add(id);
            }
          }
          return siguiente;
        });
      }
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar({ preseleccionarPendientes: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, areaIdsFiltro]);

  const idsEnHorario = useMemo(() => new Set(horario.map((h) => h.empleado_id)), [horario]);

  const empleadosSinHorario = useMemo(
    () => empleados.filter((e) => !idsEnHorario.has(e.id)),
    [empleados, idsEnHorario],
  );

  const empleadosEnHorario = useMemo(
    () => empleados.filter((e) => idsEnHorario.has(e.id)),
    [empleados, idsEnHorario],
  );

  const pendientesConfirmacion = useMemo(
    () => empleadosEnHorario.filter((e) => !idsConAsistencia.has(e.id)),
    [empleadosEnHorario, idsConAsistencia],
  );

  const todosPendientesSeleccionados =
    pendientesConfirmacion.length > 0 &&
    pendientesConfirmacion.every((e) => seleccionados.has(e.id));

  async function agregarAlHorario(empleadoId: string) {
    setProcesando(true);
    try {
      await llamarRpc("registrar_horario", { p_empleado_id: empleadoId, p_fecha: fecha });
      setSeleccionados((prev) => new Set(prev).add(empleadoId));
      await cargar();
      mostrarToast("Empleado agregado al horario.", "exito");
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesando(false);
    }
  }

  async function quitarDelHorario(empleadoId: string) {
    if (idsConAsistencia.has(empleadoId)) return;
    setProcesando(true);
    try {
      await llamarRpc("quitar_horario", { p_empleado_id: empleadoId, p_fecha: fecha });
      setSeleccionados((prev) => {
        const copia = new Set(prev);
        copia.delete(empleadoId);
        return copia;
      });
      await cargar();
      mostrarToast("Empleado quitado del horario.", "info");
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesando(false);
    }
  }

  function alternarSeleccion(id: string) {
    if (idsConAsistencia.has(id)) return;
    setSeleccionados((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function alternarSeleccionTodos() {
    if (todosPendientesSeleccionados) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(pendientesConfirmacion.map((e) => e.id)));
    }
  }

  async function registrarAsistenciaDeSeleccionados() {
    const ids = Array.from(seleccionados).filter((id) => !idsConAsistencia.has(id));
    if (ids.length === 0) return;
    setProcesando(true);
    try {
      const respuesta = await llamarRpc<RespuestaRpc & { registrados: number; errores: unknown[] }>(
        "registrar_asistencia_desde_horario",
        { p_fecha: fecha, p_empleado_ids: ids },
      );
      mostrarToast(`Asistencia registrada para ${respuesta.registrados} empleado(s).`, "exito");
      setSeleccionados(new Set());
      await cargar();
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesando(false);
    }
  }

  function nombreArea(areaId: string) {
    return areas.find((a) => a.id === areaId)?.nombre ?? "—";
  }

  const hayPendientes = pendientesConfirmacion.length > 0;

  return (
    <div>
      <div className="barra-herramientas">
        <div>
          <h2 style={{ marginBottom: "0.15rem" }}>Horario del día</h2>
          <p className="texto-suave" style={{ margin: 0 }}>
            Enrolar y confirmar asistencia del día. Para altas tardías o bajas usa Asistencia.
          </p>
        </div>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
      </div>

      {!esSupervision && !areaUnica && (
        <p className="texto-suave aviso-area-requerida" role="status">
          Selecciona un área específica en el menú (no «Ambas áreas») para poder agregar o quitar empleados del horario.
        </p>
      )}

      {/* =========================================================== */}
      {/* PANEL 1 — Enrolar en horario                                  */}
      {/* =========================================================== */}
      <section className="seccion-horario">
        <div className="seccion-horario__cabecera">
          <div>
            <h3 className="seccion-horario__titulo">1. Enrolar en horario</h3>
            <p className="texto-suave seccion-horario__ayuda">
              Agrega a quienes trabajan este día. Pasarán al panel de confirmación.
            </p>
          </div>
        </div>

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
                {!esSupervision && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {empleadosSinHorario.map((e) => (
                <tr key={e.id}>
                  <td>{e.numero_empleado}</td>
                  <td>{nombreCompletoEmpleado(e)}</td>
                  <td><ChipArea nombre={nombreArea(e.area_id)} /></td>
                  {!esSupervision && (
                    <td>
                      <button
                        className="boton boton-chico boton-primario"
                        onClick={() => agregarAlHorario(e.id)}
                        disabled={!areaUnica || procesando}
                      >
                        Agregar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {empleadosSinHorario.length === 0 && (
                <tr>
                  <td colSpan={esSupervision ? 3 : 4} className="estado-vacio">
                    {empleados.length === 0
                      ? "No hay empleados activos en esta área."
                      : "Todos los empleados activos ya están en el horario de este día."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </EnvoltorioTabla>
        )}
      </section>

      {/* =========================================================== */}
      {/* PANEL 2 — Confirmar asistencia                                */}
      {/* =========================================================== */}
      <section className="seccion-horario seccion-horario--confirmar">
        <div className="seccion-horario__cabecera">
          <div>
            <h3 className="seccion-horario__titulo">2. Confirmar asistencia</h3>
            <p className="texto-suave seccion-horario__ayuda">
              Solo aparecen quienes ya enrolaste. Desmarca ausencias y registra la asistencia.
              Quienes ya tienen asistencia quedan confirmados y no se pueden volver a marcar.
            </p>
          </div>
          {!esSupervision && !cargando && empleadosEnHorario.length > 0 && (
            <div className="grupo-filtros">
              <button
                type="button"
                className="boton boton-secundario"
                onClick={alternarSeleccionTodos}
                disabled={procesando || !hayPendientes}
              >
                {todosPendientesSeleccionados ? "Quitar selección" : "Seleccionar todos"}
              </button>
              <button
                className="boton boton-primario"
                disabled={seleccionados.size === 0 || procesando || !hayPendientes}
                onClick={registrarAsistenciaDeSeleccionados}
              >
                Registrar asistencia ({seleccionados.size})
              </button>
            </div>
          )}
        </div>

        {cargando ? (
          <div className="tarjeta" style={{ padding: "1rem" }} aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-fila" />
            ))}
          </div>
        ) : (
        <EnvoltorioTabla>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Asistió</th>
                <th>Número</th>
                <th>Nombre</th>
                <th>Área</th>
                {!esSupervision && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {empleadosEnHorario.map((e) => {
                const yaRegistrada = idsConAsistencia.has(e.id);
                return (
                  <tr key={e.id} className={yaRegistrada ? "fila-asistencia-confirmada" : undefined}>
                    <td>
                      {yaRegistrada ? (
                        <span
                          className="asistencia-confirmada"
                          title="Asistencia ya registrada"
                          aria-label={`Asistencia ya registrada de ${nombreCompletoEmpleado(e)}`}
                        >
                          <IconoCheck width={22} height={22} />
                        </span>
                      ) : !esSupervision ? (
                        <input
                          type="checkbox"
                          className="checkbox-fila"
                          checked={seleccionados.has(e.id)}
                          onChange={() => alternarSeleccion(e.id)}
                          aria-label={`Confirmar asistencia de ${nombreCompletoEmpleado(e)}`}
                        />
                      ) : (
                        <span className="texto-suave">Pendiente</span>
                      )}
                    </td>
                    <td>{e.numero_empleado}</td>
                    <td>{nombreCompletoEmpleado(e)}</td>
                    <td><ChipArea nombre={nombreArea(e.area_id)} /></td>
                    {!esSupervision && (
                      <td>
                        <button
                          className="boton boton-chico boton-secundario"
                          onClick={() => quitarDelHorario(e.id)}
                          disabled={!areaUnica || procesando || yaRegistrada}
                          title={
                            yaRegistrada
                              ? "No se puede quitar del horario: ya tiene asistencia. Elimínala primero en Asistencia."
                              : undefined
                          }
                        >
                          Quitar
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {empleadosEnHorario.length === 0 && (
                <tr>
                  <td colSpan={esSupervision ? 4 : 5} className="estado-vacio">
                    Aún no hay nadie en el horario. Agrega empleados en el paso 1.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </EnvoltorioTabla>
        )}
      </section>
    </div>
  );
}
