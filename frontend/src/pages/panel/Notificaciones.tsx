import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { formatoFechaHora } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import {
  avisarNotificacionesActualizadas,
  resolverEnlaceNotificacion,
} from "../../lib/enlaceNotificacion";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import { IconoCampana } from "../../components/Iconos";
import type { Notificacion } from "../../lib/tipos";

export default function Notificaciones() {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const navegar = useNavigate();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [abriendoId, setAbriendoId] = useState<string | null>(null);

  const noLeidas = useMemo(() => notificaciones.filter((n) => !n.leida), [notificaciones]);

  async function cargar() {
    if (!perfil) return;
    setCargando(true);
    const { data, error } = await supabase
      .from("notificaciones")
      .select("*")
      .eq("destinatario_id", perfil.id)
      .order("creado_en", { ascending: false })
      .limit(200);
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudieron cargar las notificaciones."), "error");
      setNotificaciones([]);
    } else {
      setNotificaciones((data as Notificacion[]) ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  async function marcarLeida(id: string) {
    await llamarRpc("marcar_notificacion_leida", { p_notificacion_id: id });
    setNotificaciones((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
    avisarNotificacionesActualizadas();
  }

  async function marcarTodasLeidas() {
    if (noLeidas.length === 0) return;
    setProcesando(true);
    try {
      /* Sin RPC batch en servidor: lotes de 8 para no saturar. */
      const TAM_LOTE = 8;
      let errores = 0;
      for (let i = 0; i < noLeidas.length; i += TAM_LOTE) {
        const lote = noLeidas.slice(i, i + TAM_LOTE);
        const resultados = await Promise.allSettled(
          lote.map((n) => llamarRpc("marcar_notificacion_leida", { p_notificacion_id: n.id })),
        );
        errores += resultados.filter((r) => r.status === "rejected").length;
      }
      await cargar();
      avisarNotificacionesActualizadas();
      if (errores === 0) {
        mostrarToast("Todas las notificaciones se marcaron como leídas.", "exito");
      } else {
        mostrarToast(`Se marcaron con ${errores} error(es). Revisa las que siguen como nuevas.`, "info");
      }
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "No se pudieron marcar como leídas.", "error");
      await cargar();
    } finally {
      setProcesando(false);
    }
  }

  async function abrirMovimiento(n: Notificacion) {
    setAbriendoId(n.id);
    try {
      if (!n.leida) {
        await marcarLeida(n.id);
      }
      const enlace = await resolverEnlaceNotificacion(n);
      if (!enlace) {
        mostrarToast("Esta notificación no tiene un movimiento asociado.", "info");
        return;
      }
      navegar(enlace);
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "No se pudo abrir el movimiento.", "error");
    } finally {
      setAbriendoId(null);
    }
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Notificaciones</h2>
        {noLeidas.length > 0 && (
          <button
            className="boton boton-secundario"
            disabled={procesando}
            onClick={marcarTodasLeidas}
          >
            {procesando ? "Marcando…" : `Marcar todas como leídas (${noLeidas.length})`}
          </button>
        )}
      </div>

      {cargando ? (
        <SkeletonTabla filas={6} />
      ) : notificaciones.length === 0 ? (
        <EstadoVacio
          icono={<IconoCampana width={32} height={32} />}
          mensaje="No tienes notificaciones."
        />
      ) : (
      <EnvoltorioTabla>
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Título</th>
              <th>Mensaje</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {notificaciones.map((n) => (
              <tr key={n.id} className={!n.leida ? "fila-notif--nueva" : undefined}>
                <td>{!n.leida && <span className="etiqueta etiqueta-advertencia">Nueva</span>}</td>
                <td>
                  <button
                    type="button"
                    className="enlace-notificacion"
                    onClick={() => abrirMovimiento(n)}
                    disabled={abriendoId === n.id}
                  >
                    {n.titulo}
                  </button>
                </td>
                <td>
                  <span className="celda-mensaje-notif" title={n.mensaje}>{n.mensaje}</span>
                </td>
                <td className="num-tabular">{formatoFechaHora(n.creado_en)}</td>
                <td className="fila-acciones">
                  <div className="acciones-inline">
                    <button
                      className="boton boton-chico boton-primario"
                      disabled={abriendoId === n.id}
                      onClick={() => abrirMovimiento(n)}
                    >
                      {abriendoId === n.id ? "Abriendo…" : "Ver movimiento"}
                    </button>
                    {!n.leida && (
                      <button
                        className="boton boton-chico boton-secundario"
                        disabled={procesando || abriendoId === n.id}
                        onClick={() => marcarLeida(n.id)}
                      >
                        Marcar leída
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EnvoltorioTabla>
      )}
    </div>
  );
}
