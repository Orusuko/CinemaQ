import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { nombreCompletoEmpleado } from "../../lib/formato";
import Modal from "../../components/Modal";
import ModalConfirmacion from "../../components/ModalConfirmacion";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import type { BuscarEmpleadoRespuesta, Empleado, EmpleadoOtraArea, PreferenciaNombre, RespuestaRpc } from "../../lib/tipos";

interface FormularioEmpleado {
  numero_empleado: string;
  primer_nombre: string;
  segundo_nombre: string;
  primer_apellido: string;
  segundo_apellido: string;
  pref_nombre_publico: PreferenciaNombre;
  pref_apellido_publico: PreferenciaNombre;
  estado: "activo" | "inactivo";
}

const FORMULARIO_VACIO: FormularioEmpleado = {
  numero_empleado: "",
  primer_nombre: "",
  segundo_nombre: "",
  primer_apellido: "",
  segundo_apellido: "",
  pref_nombre_publico: "primer",
  pref_apellido_publico: "primer",
  estado: "activo",
};

export default function Empleados() {
  const { perfil } = useAuth();
  const { areas, areaIdsFiltro } = useArea();
  const { mostrarToast } = useToast();
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [empleadosOtrasAreas, setEmpleadosOtrasAreas] = useState<EmpleadoOtraArea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoOtras, setCargandoOtras] = useState(false);
  const [editando, setEditando] = useState<Empleado | null>(null);
  const [creando, setCreando] = useState(false);
  const [cambioArea, setCambioArea] = useState<Empleado | null>(null);
  const [solicitarIngreso, setSolicitarIngreso] = useState<EmpleadoOtraArea | null>(null);

  const areaUnica = areaIdsFiltro && areaIdsFiltro.length === 1 ? areaIdsFiltro[0] : null;
  const esAdminGeneral = perfil?.rol === "administrador_general";
  const esAdminArea = perfil?.rol === "admin_area";
  const esSupervision = perfil?.rol === "supervision";
  const puedeCrear = !esSupervision && (areaUnica !== null || esAdminGeneral);
  const miAreaId = perfil?.area_id ?? areaUnica;

  async function cargar() {
    setCargando(true);
    let consulta = supabase.from("empleados").select("*").order("primer_nombre");
    if (areaIdsFiltro) consulta = consulta.in("area_id", areaIdsFiltro);
    const { data } = await consulta;
    setEmpleados((data as Empleado[]) ?? []);
    setCargando(false);
  }

  async function cargarOtrasAreas() {
    if (!esAdminArea || !miAreaId) {
      setEmpleadosOtrasAreas([]);
      return;
    }
    setCargandoOtras(true);
    const { data, error } = await supabase
      .from("empleados")
      .select(
        "id, numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, pref_nombre_publico, pref_apellido_publico, area_id, estado, areas(nombre)",
      )
      .neq("area_id", miAreaId)
      .eq("estado", "activo")
      .order("primer_nombre");

    if (error) {
      setEmpleadosOtrasAreas([]);
      mostrarToast(`No se pudieron cargar empleados de otras áreas: ${error.message}`, "error");
    } else {
      setEmpleadosOtrasAreas(
        (data ?? []).map((fila) => {
          const areaRel = fila.areas as { nombre: string } | { nombre: string }[] | null;
          const areaNombre = Array.isArray(areaRel) ? areaRel[0]?.nombre : areaRel?.nombre;
          const { areas: _areas, ...empleado } = fila;
          return { ...empleado, area_nombre: areaNombre ?? "—" } as EmpleadoOtraArea;
        }),
      );
    }
    setCargandoOtras(false);
  }

  useEffect(() => {
    cargar();
    cargarOtrasAreas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaIdsFiltro, esAdminArea, miAreaId]);

  function nombreArea(areaId: string) {
    return areas.find((a) => a.id === areaId)?.nombre ?? "—";
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Empleados</h2>
        {puedeCrear && (
          <button className="boton boton-primario" onClick={() => setCreando(true)}>
            Nuevo empleado
          </button>
        )}
      </div>

      <EnvoltorioTabla>
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Número</th>
              <th>Nombre</th>
              <th>Área</th>
              <th>Estado</th>
              {!esSupervision && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {empleados.map((e) => (
              <tr key={e.id}>
                <td>{e.numero_empleado}</td>
                <td>{nombreCompletoEmpleado(e)}</td>
                <td><ChipArea nombre={nombreArea(e.area_id)} /></td>
                <td>
                  <span className={e.estado === "activo" ? "etiqueta etiqueta-exito" : "etiqueta etiqueta-neutral"}>
                    {e.estado === "activo" ? "Activo" : "Inactivo"}
                  </span>
                </td>
                {!esSupervision && (
                  <td className="fila-acciones">
                    <button className="boton boton-chico boton-secundario" onClick={() => setEditando(e)}>
                      {esAdminArea ? "Cambiar estado" : "Editar"}
                    </button>
                    {esAdminGeneral && (
                      <button className="boton boton-chico boton-secundario" onClick={() => setCambioArea(e)}>
                        Mover de área
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!cargando && empleados.length === 0 && (
              <tr>
                <td colSpan={esSupervision ? 4 : 5} className="estado-vacio">
                  No hay empleados registrados{areaUnica ? " en esta área" : ""}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </EnvoltorioTabla>

      {esAdminArea && (
        <section className="seccion-panel">
          <h3>Solicitar empleados de otras áreas</h3>
          <p className="texto-suave" style={{ marginBottom: "0.75rem" }}>
            Aquí puedes solicitar que un empleado de otra área se incorpore a {nombreArea(miAreaId ?? "")}.
          </p>
          <EnvoltorioTabla>
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Nombre</th>
                  <th>Área actual</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empleadosOtrasAreas.map((e) => (
                  <tr key={e.id}>
                    <td>{e.numero_empleado}</td>
                    <td>{nombreCompletoEmpleado(e)}</td>
                    <td><ChipArea nombre={e.area_nombre} /></td>
                    <td className="fila-acciones">
                      <button className="boton boton-chico boton-secundario" onClick={() => setSolicitarIngreso(e)}>
                        Solicitar a mi área
                      </button>
                    </td>
                  </tr>
                ))}
                {!cargandoOtras && empleadosOtrasAreas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="estado-vacio">
                      No hay empleados activos en otras áreas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </EnvoltorioTabla>
        </section>
      )}

      {(creando || editando) && (
        <ModalEmpleado
          empleado={editando}
          areaId={areaUnica ?? editando?.area_id ?? ""}
          miAreaId={miAreaId}
          areas={areas}
          elegirArea={creando && !areaUnica && esAdminGeneral}
          soloEstado={!!editando && esAdminArea}
          esAdminArea={esAdminArea}
          onCerrar={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardado={() => {
            setCreando(false);
            setEditando(null);
            cargar();
            cargarOtrasAreas();
          }}
          onSolicitudEnviada={(mensaje) => {
            setCreando(false);
            mostrarToast(mensaje, "exito");
            cargarOtrasAreas();
          }}
        />
      )}

      {cambioArea && esAdminGeneral && (
        <ModalCambioArea
          empleado={cambioArea}
          areas={areas}
          onCerrar={() => setCambioArea(null)}
          onListo={(mensaje) => {
            setCambioArea(null);
            mostrarToast(mensaje, "exito");
            cargar();
          }}
        />
      )}

      {solicitarIngreso && miAreaId && (
        <ModalSolicitarIngreso
          empleado={solicitarIngreso}
          miAreaId={miAreaId}
          miAreaNombre={nombreArea(miAreaId)}
          onCerrar={() => setSolicitarIngreso(null)}
          onListo={(mensaje) => {
            setSolicitarIngreso(null);
            mostrarToast(mensaje, "exito");
            cargarOtrasAreas();
          }}
        />
      )}
    </div>
  );
}

function ModalEmpleado({
  empleado,
  areaId,
  miAreaId,
  areas,
  elegirArea,
  soloEstado,
  esAdminArea,
  onCerrar,
  onGuardado,
  onSolicitudEnviada,
}: {
  empleado: Empleado | null;
  areaId: string;
  miAreaId: string | null;
  areas: { id: string; nombre: string }[];
  elegirArea: boolean;
  soloEstado: boolean;
  esAdminArea: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
  onSolicitudEnviada: (mensaje: string) => void;
}) {
  const [areaSeleccionada, setAreaSeleccionada] = useState(areaId || areas[0]?.id || "");
  const [form, setForm] = useState<FormularioEmpleado>(
    empleado
      ? {
          numero_empleado: empleado.numero_empleado,
          primer_nombre: empleado.primer_nombre,
          segundo_nombre: empleado.segundo_nombre ?? "",
          primer_apellido: empleado.primer_apellido,
          segundo_apellido: empleado.segundo_apellido ?? "",
          pref_nombre_publico: empleado.pref_nombre_publico,
          pref_apellido_publico: empleado.pref_apellido_publico,
          estado: empleado.estado,
        }
      : FORMULARIO_VACIO,
  );
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [duplicado, setDuplicado] = useState<BuscarEmpleadoRespuesta | null>(null);

  async function guardar() {
    setError(null);
    if (!soloEstado && !/^[0-9]{6}$/.test(form.numero_empleado)) {
      setError("El número de empleado debe tener exactamente 6 dígitos.");
      return;
    }
    if (!soloEstado && (!form.primer_nombre.trim() || !form.primer_apellido.trim())) {
      setError("Primer nombre y primer apellido son obligatorios.");
      return;
    }
    const areaDestino = elegirArea ? areaSeleccionada : areaId;
    if (!empleado && !areaDestino) {
      setError("Selecciona el área del empleado.");
      return;
    }

    setEnviando(true);

    if (!empleado && esAdminArea && miAreaId) {
      const { data: existente, error: errorBusqueda } = await supabase
        .from("empleados")
        .select("id, numero_empleado, primer_nombre, primer_apellido, area_id, estado, areas(nombre)")
        .eq("numero_empleado", form.numero_empleado)
        .maybeSingle();

      if (errorBusqueda) {
        setEnviando(false);
        setError(errorBusqueda.message);
        return;
      }

      if (existente) {
        setEnviando(false);
        if (existente.area_id === miAreaId) {
          setError("Este empleado ya está registrado en tu área.");
          return;
        }
        const areaRel = existente.areas as { nombre: string } | { nombre: string }[] | null;
        const areaNombre = Array.isArray(areaRel) ? areaRel[0]?.nombre : areaRel?.nombre;
        setDuplicado({
          existe: true,
          id: existente.id,
          numero_empleado: existente.numero_empleado,
          primer_nombre: existente.primer_nombre,
          primer_apellido: existente.primer_apellido,
          area_id: existente.area_id,
          area_nombre: areaNombre ?? "—",
          estado: existente.estado,
          en_mi_area: false,
        });
        return;
      }
    }

    const payload = soloEstado
      ? { estado: form.estado }
      : {
          numero_empleado: form.numero_empleado,
          primer_nombre: form.primer_nombre.trim(),
          segundo_nombre: form.segundo_nombre.trim() || null,
          primer_apellido: form.primer_apellido.trim(),
          segundo_apellido: form.segundo_apellido.trim() || null,
          pref_nombre_publico: form.pref_nombre_publico,
          pref_apellido_publico: form.pref_apellido_publico,
          estado: form.estado,
        };

    const resultado = empleado
      ? await supabase.from("empleados").update(payload).eq("id", empleado.id)
      : await supabase.from("empleados").insert({ ...payload, area_id: areaDestino });

    setEnviando(false);
    if (resultado.error) {
      setError(resultado.error.message);
      return;
    }
    onGuardado();
  }

  return (
    <>
      <Modal
        titulo={empleado ? (soloEstado ? "Cambiar estado del empleado" : "Editar empleado") : "Nuevo empleado"}
        onCerrar={onCerrar}
        ancho={!soloEstado}
      >
        {soloEstado && empleado && (
          <p className="texto-suave" style={{ marginBottom: "1rem" }}>
            {nombreCompletoEmpleado(empleado)} — Núm. {empleado.numero_empleado}
          </p>
        )}

        {!soloEstado && elegirArea && (
          <div className="campo">
            <label>Área</label>
            <select value={areaSeleccionada} onChange={(e) => setAreaSeleccionada(e.target.value)}>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </div>
        )}

        {!soloEstado && (
          <div className="formulario-dos-columnas" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
            <div className="campo">
              <label>Número de empleado (6 dígitos)</label>
              <input
                maxLength={6}
                value={form.numero_empleado}
                onChange={(e) => setForm((f) => ({ ...f, numero_empleado: e.target.value.replace(/\D/g, "") }))}
                disabled={!!empleado}
              />
            </div>
            <div className="campo">
              <label>Estado</label>
              <select
                value={form.estado}
                onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as "activo" | "inactivo" }))}
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div className="campo">
              <label>Primer nombre</label>
              <input value={form.primer_nombre} onChange={(e) => setForm((f) => ({ ...f, primer_nombre: e.target.value }))} />
            </div>
            <div className="campo">
              <label>Segundo nombre (opcional)</label>
              <input value={form.segundo_nombre} onChange={(e) => setForm((f) => ({ ...f, segundo_nombre: e.target.value }))} />
            </div>
            <div className="campo">
              <label>Primer apellido</label>
              <input value={form.primer_apellido} onChange={(e) => setForm((f) => ({ ...f, primer_apellido: e.target.value }))} />
            </div>
            <div className="campo">
              <label>Segundo apellido (opcional)</label>
              <input
                value={form.segundo_apellido}
                onChange={(e) => setForm((f) => ({ ...f, segundo_apellido: e.target.value }))}
              />
            </div>
          </div>
        )}

        {soloEstado && (
          <div className="campo">
            <label>Estado</label>
            <select value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as "activo" | "inactivo" }))}>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
        )}

        {!soloEstado && (
          <>
            <h4>Preferencias (solo afecta la vista pública)</h4>
            <div className="formulario-dos-columnas" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 1rem" }}>
              <div className="campo">
                <label>Nombre a mostrar</label>
                <select
                  value={form.pref_nombre_publico}
                  onChange={(e) => setForm((f) => ({ ...f, pref_nombre_publico: e.target.value as PreferenciaNombre }))}
                >
                  <option value="primer">Primer nombre</option>
                  <option value="segundo">Segundo nombre</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>
              <div className="campo">
                <label>Apellido a mostrar</label>
                <select
                  value={form.pref_apellido_publico}
                  onChange={(e) => setForm((f) => ({ ...f, pref_apellido_publico: e.target.value as PreferenciaNombre }))}
                >
                  <option value="primer">Primer apellido</option>
                  <option value="segundo">Segundo apellido</option>
                  <option value="ambos">Ambos</option>
                </select>
              </div>
            </div>
          </>
        )}

        {error && <p className="mensaje-error">{error}</p>}
        <div className="fila-acciones" style={{ justifyContent: "flex-end" }}>
          <button className="boton boton-secundario" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button className="boton boton-primario" onClick={guardar} disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </Modal>

      {duplicado?.existe && duplicado.id && miAreaId && (
        <ModalConfirmacion
          titulo="Empleado ya registrado"
          mensaje={`Este empleado ya existe en el área ${duplicado.area_nombre ?? "—"} (${duplicado.primer_nombre} ${duplicado.primer_apellido}). ¿Deseas solicitar que se incorpore a tu área?`}
          etiquetaBotonConfirmar="Solicitar incorporación"
          onCancelar={() => setDuplicado(null)}
          onConfirmar={async () => {
            await llamarRpc<RespuestaRpc>("solicitar_cambio_area", {
              p_empleado_id: duplicado.id,
              p_area_nueva_id: miAreaId,
            });
            setDuplicado(null);
            onCerrar();
            onSolicitudEnviada("Solicitud enviada al administrador.");
          }}
        />
      )}
    </>
  );
}

function ModalCambioArea({
  empleado,
  areas,
  onCerrar,
  onListo,
}: {
  empleado: Empleado;
  areas: { id: string; nombre: string }[];
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const opciones = areas.filter((a) => a.id !== empleado.area_id);
  const [areaNueva, setAreaNueva] = useState(opciones[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!areaNueva) return;
    setEnviando(true);
    setError(null);
    try {
      await llamarRpc<RespuestaRpc>("mover_empleado_area", { p_empleado_id: empleado.id, p_area_nueva_id: areaNueva });
      onListo("Empleado movido de área.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Mover de área" onCerrar={onCerrar}>
      <p className="texto-suave">
        {nombreCompletoEmpleado(empleado)} — Área actual: {areas.find((a) => a.id === empleado.area_id)?.nombre}
      </p>
      <div className="campo">
        <label>Área nueva</label>
        <select value={areaNueva} onChange={(e) => setAreaNueva(e.target.value)}>
          {opciones.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      <div className="fila-acciones" style={{ justifyContent: "flex-end" }}>
        <button className="boton boton-secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </button>
        <button className="boton boton-primario" onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando…" : "Confirmar"}
        </button>
      </div>
    </Modal>
  );
}

function ModalSolicitarIngreso({
  empleado,
  miAreaId,
  miAreaNombre,
  onCerrar,
  onListo,
}: {
  empleado: EmpleadoOtraArea;
  miAreaId: string;
  miAreaNombre: string;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      await llamarRpc<RespuestaRpc>("solicitar_cambio_area", {
        p_empleado_id: empleado.id,
        p_area_nueva_id: miAreaId,
      });
      onListo("Solicitud enviada al administrador.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Solicitar incorporación" onCerrar={onCerrar}>
      <p className="texto-suave">
        ¿Solicitar que <strong>{nombreCompletoEmpleado(empleado)}</strong> (Núm. {empleado.numero_empleado}) pase de{" "}
        <strong>{empleado.area_nombre}</strong> a <strong>{miAreaNombre}</strong>?
      </p>
      <p className="texto-suave">La solicitud será revisada por el administrador general.</p>
      {error && <p className="mensaje-error">{error}</p>}
      <div className="fila-acciones" style={{ justifyContent: "flex-end" }}>
        <button className="boton boton-secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </button>
        <button className="boton boton-primario" onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </Modal>
  );
}
