import { supabase } from "./supabaseClient";
import type { Notificacion } from "./tipos";

/** Avisa al layout para refrescar el contador de no leídas. */
export function avisarNotificacionesActualizadas() {
  window.dispatchEvent(new Event("notificaciones-actualizadas"));
}

/**
 * Resuelve la ruta del panel donde revisar el movimiento ligado a la notificación.
 * Usa `tipo` + `entidad_id`; para pagos consulta la fecha/estado reales.
 */
export async function resolverEnlaceNotificacion(n: Notificacion): Promise<string | null> {
  switch (n.tipo) {
    case "pago_fuera_horario":
    case "pago_en_revision_estancado": {
      if (!n.entidad_id) return "/panel/pagos";
      const { data } = await supabase
        .from("pagos_cuota")
        .select("fecha, estado")
        .eq("id", n.entidad_id)
        .maybeSingle();
      if (!data) {
        return `/panel/pagos?pago=${encodeURIComponent(n.entidad_id)}`;
      }
      const pestana = data.estado === "validado" ? "validados" : "revision";
      const fecha = data.fecha as string;
      return (
        `/panel/pagos?pestana=${pestana}` +
        `&desde=${encodeURIComponent(fecha)}` +
        `&hasta=${encodeURIComponent(fecha)}` +
        `&pago=${encodeURIComponent(n.entidad_id)}`
      );
    }
    case "solicitud_cambio_area":
      return n.entidad_id
        ? `/panel/solicitudes?solicitud=${encodeURIComponent(n.entidad_id)}`
        : "/panel/solicitudes";
    case "empleado_nuevo_sin_horario":
      return "/panel/horario";
    default:
      return null;
  }
}
