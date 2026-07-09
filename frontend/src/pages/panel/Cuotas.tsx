import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { formatoFecha, formatoMoneda, fechaHoyInputCdmx } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import type { HistorialCuota, RespuestaRpc } from "../../lib/tipos";

export default function Cuotas() {
  const { areas } = useArea();
  const { mostrarToast } = useToast();
  const [historial, setHistorial] = useState<HistorialCuota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState<Record<string, { monto: string; vigenteDesde: string }>>({});

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase.from("historial_cuotas").select("*").order("vigente_desde", { ascending: false });
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudo cargar el historial de cuotas."), "error");
      setHistorial([]);
    } else {
      setHistorial((data as HistorialCuota[]) ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  function valorForm(areaId: string, campo: "monto" | "vigenteDesde") {
    return form[areaId]?.[campo] ?? (campo === "vigenteDesde" ? fechaHoyInputCdmx() : "");
  }

  function actualizarForm(areaId: string, campo: "monto" | "vigenteDesde", valor: string) {
    setForm((prev) => ({
      ...prev,
      [areaId]: { monto: prev[areaId]?.monto ?? "", vigenteDesde: prev[areaId]?.vigenteDesde ?? fechaHoyInputCdmx(), [campo]: valor },
    }));
  }

  async function aplicarCambio(areaId: string) {
    const monto = Number(valorForm(areaId, "monto"));
    const vigenteDesde = valorForm(areaId, "vigenteDesde");
    if (!monto || monto < 0) {
      mostrarToast("Ingresa un monto válido.", "error");
      return;
    }
    try {
      const respuesta = await llamarRpc<RespuestaRpc>("cambiar_cuota", {
        p_area_id: areaId,
        p_monto: monto,
        p_vigente_desde: vigenteDesde,
      });
      mostrarToast(respuesta.mensaje, "exito");
      setForm((prev) => ({ ...prev, [areaId]: { monto: "", vigenteDesde: fechaHoyInputCdmx() } }));
      cargar();
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    }
  }

  return (
    <div>
      <h2>Cuotas por área</h2>
      <div className="rejilla-kpi">
        {areas.map((a) => (
          <div key={a.id} className="tarjeta">
            <h3>{a.nombre}</h3>
            <p className="texto-suave">Cuota actual: {formatoMoneda(a.cuota_fija)}</p>
            <div className="campo">
              <label>Nuevo monto</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={valorForm(a.id, "monto")}
                onChange={(e) => actualizarForm(a.id, "monto", e.target.value)}
              />
            </div>
            <div className="campo">
              <label>Vigente desde</label>
              <input
                type="date"
                value={valorForm(a.id, "vigenteDesde")}
                onChange={(e) => actualizarForm(a.id, "vigenteDesde", e.target.value)}
              />
            </div>
            <button className="boton boton-primario" onClick={() => aplicarCambio(a.id)}>
              Aplicar cambio
            </button>
          </div>
        ))}
      </div>

      <h3>Historial de cuotas</h3>
      <EnvoltorioTabla>
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Área</th>
              <th>Monto</th>
              <th>Vigente desde</th>
              <th>Vigente hasta</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((h) => (
              <tr key={h.id}>
                <td><ChipArea nombre={areas.find((a) => a.id === h.area_id)?.nombre ?? "—"} /></td>
                <td>{formatoMoneda(h.monto)}</td>
                <td>{formatoFecha(h.vigente_desde)}</td>
                <td>{h.vigente_hasta ? formatoFecha(h.vigente_hasta) : "Vigente"}</td>
              </tr>
            ))}
            {!cargando && historial.length === 0 && (
              <tr>
                <td colSpan={4} className="estado-vacio">
                  Sin historial todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </EnvoltorioTabla>
    </div>
  );
}
