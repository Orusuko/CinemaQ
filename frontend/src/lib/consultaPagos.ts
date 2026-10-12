import { supabase } from "./supabaseClient";
import type { PagoCuota } from "./tipos";

const PAGINA = 1000;

/** PostgREST corta en ~1000 filas por respuesta: se pagina para no subestimar montos (una catorcena puede pasarse). */
export async function cargarPagosRango(
  desde: string,
  hasta: string,
  areaIds: string[] | null,
  empleadoId?: string,
): Promise<{ pagos: PagoCuota[]; error: { message?: string } | null }> {
  const acumulado: PagoCuota[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    let consulta = supabase
      .from("pagos_cuota")
      .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("id", { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (areaIds) consulta = consulta.in("area_id", areaIds);
    if (empleadoId) consulta = consulta.eq("empleado_id", empleadoId);
    const { data, error } = await consulta;
    if (error) return { pagos: [], error };
    const pagina = (data as PagoCuota[]) ?? [];
    acumulado.push(...pagina);
    if (pagina.length < PAGINA) return { pagos: acumulado, error: null };
  }
}
