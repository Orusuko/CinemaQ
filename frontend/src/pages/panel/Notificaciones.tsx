import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { formatoFechaHora } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import type { Notificacion } from "../../lib/tipos";

export default function Notificaciones() {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(true);

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
  }

  return (
    <div>
      <h2>Notificaciones</h2>
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
              <tr key={n.id} style={{ fontWeight: n.leida ? 400 : 700 }}>
                <td>{!n.leida && <span className="etiqueta etiqueta-advertencia">Nueva</span>}</td>
                <td>{n.titulo}</td>
                <td>{n.mensaje}</td>
                <td>{formatoFechaHora(n.creado_en)}</td>
                <td className="fila-acciones">
                  {!n.leida && (
                    <button className="boton boton-chico boton-secundario" onClick={() => marcarLeida(n.id)}>
                      Marcar leída
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!cargando && notificaciones.length === 0 && (
              <tr>
                <td colSpan={5} className="estado-vacio">
                  No tienes notificaciones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </EnvoltorioTabla>
    </div>
  );
}
