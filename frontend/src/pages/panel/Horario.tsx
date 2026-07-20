import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { fechaHoyInputCdmx, nombrePublicoEmpleado } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import Tabs from "../../components/Tabs";
import { IconoCheck, IconoLista, IconoUsuarios } from "../../components/Iconos";
import { abrirCineConEmpleados } from "../../lib/cineHorarios";
import type { Empleado, HorarioDiario, RespuestaRpc } from "../../lib/tipos";

type PestanaHorario = "enrolar" | "confirmar";

export default function Horario() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areaIdsFiltro, areas } = useArea();
  const { mostrarToast } = useToast();
  const [fecha, setFecha] = useState(fechaHoyInputCdmx());
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [horario, setHorario] = useState<HorarioDiario[]>([]);
  const [idsConAsistencia, setIdsConAsistencia] = useState<Set<string>>(new Set());
  const [seleccionEnrolar, setSeleccionEnrolar] = useState<Set<string>>(new Set());
  const [seleccionConfirmar, setSeleccionConfirmar] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(true);
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [procesandoLote, setProcesandoLote] = useState(false);
  const [pestana, setPestana] = useState<PestanaHorario>("enrolar");

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
      setSeleccionEnrolar(new Set());
      setSeleccionConfirmar(new Set());
    } else {
      const listaHorario = (respHorario.data as HorarioDiario[]) ?? [];
      const idsAsistencia = new Set(
        ((respAsistencia.data as { empleado_id: string }[]) ?? []).map((a) => a.empleado_id),
      );
      const listaEmpleados = (respEmpleados.data as Empleado[]) ?? [];
      setEmpleados(listaEmpleados);
      setHorario(listaHorario);
      setIdsConAsistencia(idsAsistencia);

      const idsEnHorarioAhora = new Set(listaHorario.map((h) => h.empleado_id));
      setSeleccionEnrolar((prev) => {
        const siguiente = new Set<string>();
        for (const id of prev) {
          if (!idsEnHorarioAhora.has(id) && listaEmpleados.some((e) => e.id === id)) {
            siguiente.add(id);
          }
        }
        return siguiente;
      });

      if (opciones?.preseleccionarPendientes) {
        setSeleccionConfirmar(
          new Set(
            listaHorario
              .map((h) => h.empleado_id)
              .filter((id) => !idsAsistencia.has(id)),
          ),
        );
      } else {
        setSeleccionConfirmar((prev) => {
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

  const todosEnrolarSeleccionados =
    empleadosSinHorario.length > 0 && empleadosSinHorario.every((e) => seleccionEnrolar.has(e.id));

  const todosPendientesSeleccionados =
    pendientesConfirmacion.length > 0 &&
    pendientesConfirmacion.every((e) => seleccionConfirmar.has(e.id));

  function alternarEnrolar(id: string) {
    setSeleccionEnrolar((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function alternarTodosEnrolar() {
    if (todosEnrolarSeleccionados) {
      setSeleccionEnrolar(new Set());
    } else {
      setSeleccionEnrolar(new Set(empleadosSinHorario.map((e) => e.id)));
    }
  }

  function alternarConfirmar(id: string) {
    if (idsConAsistencia.has(id)) return;
    setSeleccionConfirmar((prev) => {
      const copia = new Set(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.add(id);
      return copia;
    });
  }

  function alternarTodosConfirmar() {
    if (todosPendientesSeleccionados) {
      setSeleccionConfirmar(new Set());
    } else {
      setSeleccionConfirmar(new Set(pendientesConfirmacion.map((e) => e.id)));
    }
  }

  async function agregarSeleccionadosAlHorario() {
    const ids = Array.from(seleccionEnrolar);
    if (ids.length === 0 || !areaUnica) return;
    setProcesandoLote(true);
    try {
      const resultados = await Promise.allSettled(
        ids.map((id) => llamarRpc("registrar_horario", { p_empleado_id: id, p_fecha: fecha })),
      );
      const ok = resultados.filter((r) => r.status === "fulfilled").length;
      const fallos = resultados.length - ok;
      setSeleccionEnrolar(new Set());
      await cargar({ preseleccionarPendientes: true });
      if (fallos === 0) {
        mostrarToast(`${ok} empleado(s) agregados al horario.`, "exito");
        setPestana("confirmar");
      } else {
        mostrarToast(`Se agregaron ${ok}; ${fallos} con error.`, "info");
        if (ok > 0) setPestana("confirmar");
      }
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesandoLote(false);
    }
  }

  async function quitarDelHorario(empleadoId: string) {
    if (idsConAsistencia.has(empleadoId)) return;
    setProcesandoId(empleadoId);
    try {
      await llamarRpc("quitar_horario", { p_empleado_id: empleadoId, p_fecha: fecha });
      setSeleccionConfirmar((prev) => {
        const copia = new Set(prev);
        copia.delete(empleadoId);
        return copia;
      });
      await cargar();
      mostrarToast("Empleado quitado del horario.", "info");
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesandoId(null);
    }
  }

  async function registrarAsistenciaDeSeleccionados() {
    const ids = Array.from(seleccionConfirmar).filter((id) => !idsConAsistencia.has(id));
    if (ids.length === 0) return;
    setProcesandoLote(true);
    try {
      const respuesta = await llamarRpc<RespuestaRpc & { registrados: number; errores: unknown[] }>(
        "registrar_asistencia_desde_horario",
        { p_fecha: fecha, p_empleado_ids: ids },
      );
      mostrarToast(`Asistencia registrada para ${respuesta.registrados} empleado(s).`, "exito");
      setSeleccionConfirmar(new Set());
      await cargar();
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    } finally {
      setProcesandoLote(false);
    }
  }

  function nombreArea(areaId: string) {
    return areas.find((a) => a.id === areaId)?.nombre ?? "—";
  }

  function generarHorarioDescansos() {
    const nombreAreaActiva = areaUnica ? nombreArea(areaUnica) : "Ambas áreas";
    const resultado = abrirCineConEmpleados({
      source: "cinemaquote",
      version: 1,
      fecha,
      area: nombreAreaActiva,
      empleados: empleadosEnHorario.map((e) => ({
        numero: e.numero_empleado,
        nombre: nombrePublicoEmpleado(e),
        area: nombreArea(e.area_id),
      })),
    });
    if (!resultado.ok) {
      mostrarToast(resultado.motivo, "error");
      return;
    }
    mostrarToast("Se abrió el generador de descansos con los empleados enrolados.", "exito");
  }

  const pestanas = [
    { id: "enrolar", etiqueta: "Enrolar", contador: empleadosSinHorario.length },
    { id: "confirmar", etiqueta: "Confirmar asistencia", contador: pendientesConfirmacion.length },
  ];

  return (
    <div className="pagina-horario">
      <div className="barra-herramientas">
        <div className="cabecera-pagina">
          <h2>Horario del día</h2>
          <p className="texto-suave cabecera-pagina__subtitulo">
            Selecciona y registra por lotes. Para altas tardías o bajas usa Asistencia.
          </p>
        </div>
        <div className="grupo-filtros">
          <div className="campo" style={{ marginBottom: 0 }}>
            <label htmlFor="horario-filtro-fecha">Fecha</label>
            <input
              id="horario-filtro-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
          {!esSupervision && (
            <button
              type="button"
              className="boton boton-secundario"
              disabled={empleadosEnHorario.length === 0 || cargando}
              onClick={generarHorarioDescansos}
              title="Abre el generador de descansos con estos nombres precargados"
            >
              Generar horario de descansos ({empleadosEnHorario.length})
            </button>
          )}
        </div>
      </div>

      {!esSupervision && !areaUnica && (
        <p className="texto-suave aviso-area-requerida" role="status">
          Selecciona un área específica en el menú (no «Ambas áreas») para poder agregar o quitar empleados del horario.
        </p>
      )}

      <Tabs
        pestanas={pestanas}
        activa={pestana}
        onChange={(id) => setPestana(id as PestanaHorario)}
      >
        {pestana === "enrolar" && (
          <>
            {!esSupervision && !cargando && empleadosSinHorario.length > 0 && (
              <div className="horario-barra-acciones">
                <button
                  type="button"
                  className="boton boton-secundario"
                  onClick={alternarTodosEnrolar}
                  disabled={procesandoLote || !areaUnica}
                >
                  {todosEnrolarSeleccionados ? "Quitar selección" : "Seleccionar todos"}
                </button>
                <button
                  type="button"
                  className="boton boton-primario"
                  disabled={seleccionEnrolar.size === 0 || procesandoLote || !areaUnica}
                  onClick={agregarSeleccionadosAlHorario}
                >
                  {procesandoLote
                    ? "Agregando…"
                    : `Agregar al horario (${seleccionEnrolar.size})`}
                </button>
              </div>
            )}

            {cargando ? (
              <SkeletonTabla filas={6} />
            ) : empleadosSinHorario.length === 0 ? (
              <EstadoVacio
                icono={<IconoUsuarios width={32} height={32} />}
                mensaje={
                  empleados.length === 0
                    ? "No hay empleados activos en esta área."
                    : "Todos los empleados activos ya están en el horario de este día."
                }
                accion={
                  empleadosEnHorario.length > 0 ? (
                    <button
                      type="button"
                      className="boton boton-secundario"
                      onClick={() => setPestana("confirmar")}
                    >
                      Ir a confirmar asistencia
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="lista-horario" aria-label="Empleados para enrolar">
                {empleadosSinHorario.map((e) => {
                  const nombre = nombrePublicoEmpleado(e);
                  const marcado = seleccionEnrolar.has(e.id);
                  return (
                    <li key={e.id} className={`lista-horario__fila${marcado ? " lista-horario__fila--sel" : ""}`}>
                      {!esSupervision ? (
                        <label className="lista-horario__label">
                          <input
                            type="checkbox"
                            className="checkbox-fila"
                            checked={marcado}
                            disabled={!areaUnica || procesandoLote}
                            onChange={() => alternarEnrolar(e.id)}
                          />
                          <span className="lista-horario__nombre">{nombre}</span>
                        </label>
                      ) : (
                        <span className="lista-horario__nombre">{nombre}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {pestana === "confirmar" && (
          <>
            {!esSupervision && !cargando && empleadosEnHorario.length > 0 && pendientesConfirmacion.length > 0 && (
              <div className="horario-barra-acciones">
                <button
                  type="button"
                  className="boton boton-secundario"
                  onClick={alternarTodosConfirmar}
                  disabled={procesandoLote}
                >
                  {todosPendientesSeleccionados ? "Quitar selección" : "Seleccionar todos"}
                </button>
                <button
                  type="button"
                  className="boton boton-primario"
                  disabled={seleccionConfirmar.size === 0 || procesandoLote}
                  onClick={registrarAsistenciaDeSeleccionados}
                >
                  {procesandoLote
                    ? "Registrando…"
                    : `Registrar asistencia (${seleccionConfirmar.size})`}
                </button>
              </div>
            )}

            {cargando ? (
              <SkeletonTabla filas={6} />
            ) : empleadosEnHorario.length === 0 ? (
              <EstadoVacio
                icono={<IconoLista width={32} height={32} />}
                mensaje="Aún no hay nadie en el horario."
                accion={
                  <button
                    type="button"
                    className="boton boton-secundario"
                    onClick={() => setPestana("enrolar")}
                  >
                    Ir a enrolar
                  </button>
                }
              />
            ) : (
              <ul className="lista-horario" aria-label="Empleados en horario">
                {empleadosEnHorario.map((e) => {
                  const nombre = nombrePublicoEmpleado(e);
                  const yaRegistrada = idsConAsistencia.has(e.id);
                  const marcado = seleccionConfirmar.has(e.id);
                  return (
                    <li
                      key={e.id}
                      className={[
                        "lista-horario__fila",
                        yaRegistrada ? "lista-horario__fila--ok" : "",
                        !yaRegistrada && marcado ? "lista-horario__fila--sel" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {yaRegistrada ? (
                        <div className="lista-horario__label">
                          <span
                            className="asistencia-confirmada"
                            title="Asistencia ya registrada"
                            aria-label={`Asistencia ya registrada de ${nombre}`}
                          >
                            <IconoCheck width={18} height={18} />
                          </span>
                          <span className="lista-horario__nombre">{nombre}</span>
                          <span className="lista-horario__badge">Confirmado</span>
                        </div>
                      ) : !esSupervision ? (
                        <label className="lista-horario__label">
                          <input
                            type="checkbox"
                            className="checkbox-fila"
                            checked={marcado}
                            disabled={procesandoLote}
                            onChange={() => alternarConfirmar(e.id)}
                          />
                          <span className="lista-horario__nombre">{nombre}</span>
                        </label>
                      ) : (
                        <div className="lista-horario__label">
                          <span className="lista-horario__nombre">{nombre}</span>
                          <span className="texto-suave" style={{ fontSize: "0.8rem" }}>Pendiente</span>
                        </div>
                      )}
                      {!esSupervision && !yaRegistrada && (
                        <button
                          type="button"
                          className="boton boton-chico boton-peligro lista-horario__quitar"
                          onClick={() => quitarDelHorario(e.id)}
                          disabled={!areaUnica || procesandoId === e.id || procesandoLote}
                          title="Quitar del horario"
                        >
                          {procesandoId === e.id ? "…" : "Quitar"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </Tabs>
    </div>
  );
}
