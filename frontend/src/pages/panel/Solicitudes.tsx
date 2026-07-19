import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { formatoFechaHora } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import ModalConfirmacion from "../../components/ModalConfirmacion";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import { IconoIntercambio } from "../../components/Iconos";
import type { SolicitudCambioArea } from "../../lib/tipos";

const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

export default function Solicitudes() {
  const { perfil } = useAuth();
  const { areas } = useArea();
  const { mostrarToast } = useToast();
  const [searchParams] = useSearchParams();
  const [solicitudes, setSolicitudes] = useState<SolicitudCambioArea[]>([]);
  const [cargando, setCargando] = useState(true);
  const [accion, setAccion] = useState<{ solicitud: SolicitudCambioArea; aprobar: boolean } | null>(null);

  const esAdminGeneral = perfil?.rol === "administrador_general";
  const solicitudResaltadaUrl = searchParams.get("solicitud");
  const [solicitudResaltada, setSolicitudResaltada] = useState<string | null>(solicitudResaltadaUrl);

  useEffect(() => {
    setSolicitudResaltada(solicitudResaltadaUrl);
    if (!solicitudResaltadaUrl) return;
    const t = window.setTimeout(() => setSolicitudResaltada(null), 4000);
    return () => window.clearTimeout(t);
  }, [solicitudResaltadaUrl]);

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase
      .from("solicitudes_cambio_area")
      .select("*, empleados(numero_empleado, primer_nombre, primer_apellido)")
      .order("creado_en", { ascending: false });
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudieron cargar las solicitudes."), "error");
      setSolicitudes([]);
    } else {
      setSolicitudes((data as SolicitudCambioArea[]) ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!solicitudResaltadaUrl || cargando) return;
    const fila = document.getElementById(`solicitud-${solicitudResaltadaUrl}`);
    fila?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [solicitudResaltadaUrl, cargando, solicitudes]);

  function nombreArea(id: string) {
    return areas.find((a) => a.id === id)?.nombre ?? "—";
  }

  async function resolver(motivo: string | null) {
    if (!accion) return;
    await llamarRpc("resolver_solicitud_cambio_area", {
      p_solicitud_id: accion.solicitud.id,
      p_aprobar: accion.aprobar,
      p_motivo: motivo,
    });
    setAccion(null);
    await cargar();
    mostrarToast(accion.aprobar ? "Cambio de área aprobado." : "Solicitud rechazada.", "exito");
  }

  return (
    <div>
      <h2>Solicitudes de cambio de área</h2>
      {cargando ? (
        <SkeletonTabla filas={5} />
      ) : solicitudes.length === 0 ? (
        <EstadoVacio
          icono={<IconoIntercambio width={32} height={32} />}
          mensaje="No hay solicitudes."
        />
      ) : (
      <EnvoltorioTabla>
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>De</th>
              <th>A</th>
              <th>Solicitado</th>
              <th>Estado</th>
              {esAdminGeneral && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {solicitudes.map((s) => (
              <tr
                key={s.id}
                id={`solicitud-${s.id}`}
                className={solicitudResaltada === s.id ? "fila-resaltada" : undefined}
              >
                <td>
                  {s.empleados ? `${s.empleados.numero_empleado} · ${s.empleados.primer_nombre} ${s.empleados.primer_apellido}` : "—"}
                </td>
                <td><ChipArea nombre={nombreArea(s.area_actual_id)} /></td>
                <td><ChipArea nombre={nombreArea(s.area_solicitada_id)} /></td>
                <td className="num-tabular">{formatoFechaHora(s.creado_en)}</td>
                <td>
                  <span
                    className={
                      s.estado === "pendiente"
                        ? "etiqueta etiqueta-advertencia"
                        : s.estado === "aprobada"
                          ? "etiqueta etiqueta-exito"
                          : "etiqueta etiqueta-neutral"
                    }
                  >
                    {ETIQUETAS_ESTADO[s.estado]}
                  </span>
                </td>
                {esAdminGeneral && (
                  <td className="fila-acciones">
                    {s.estado === "pendiente" && (
                      <>
                        <button className="boton boton-chico boton-primario" onClick={() => setAccion({ solicitud: s, aprobar: true })}>
                          Aprobar
                        </button>
                        <button className="boton boton-chico boton-peligro" onClick={() => setAccion({ solicitud: s, aprobar: false })}>
                          Rechazar
                        </button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </EnvoltorioTabla>
      )}

      {accion && (
        <ModalConfirmacion
          titulo={accion.aprobar ? "Aprobar cambio de área" : "Rechazar solicitud"}
          mensaje="Puedes dejar una nota para el administrador de área."
          motivoOpcional
          etiquetaBotonConfirmar={accion.aprobar ? "Aprobar" : "Rechazar"}
          peligro={!accion.aprobar}
          onCancelar={() => setAccion(null)}
          onConfirmar={resolver}
        />
      )}
    </div>
  );
}
