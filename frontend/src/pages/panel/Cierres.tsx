import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { formatoFecha, formatoMoneda, fechaHoyInputCdmx, ETIQUETAS_ESTADO_PAGO } from "../../lib/formato";
import { descargarCsv, filaCsv, ENCABEZADOS_HISTORIAL } from "../../lib/csv";
import { mensajeErrorConsulta } from "../../lib/consulta";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import Modal from "../../components/Modal";
import type { CierrePeriodo, RespuestaRpc } from "../../lib/tipos";

export default function Cierres() {
  const { perfil } = useAuth();
  const { areas } = useArea();
  const { mostrarToast } = useToast();
  const [cierres, setCierres] = useState<CierrePeriodo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);

  const esAdminGeneral = perfil?.rol === "administrador_general";

  async function cargar() {
    setCargando(true);
    const { data, error } = await supabase.from("cierres_periodo").select("*").order("cerrado_en", { ascending: false });
    if (error) {
      mostrarToast(mensajeErrorConsulta(error, "No se pudieron cargar los cierres."), "error");
      setCierres([]);
    } else {
      setCierres((data as CierrePeriodo[]) ?? []);
    }
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const grupos = useMemo(() => {
    const mapa = new Map<string, CierrePeriodo[]>();
    for (const c of cierres) {
      const clave = `${c.desde}__${c.hasta}__${c.cerrado_en}`;
      const lista = mapa.get(clave) ?? [];
      lista.push(c);
      mapa.set(clave, lista);
    }
    return Array.from(mapa.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [cierres]);

  function nombreArea(id: string) {
    return areas.find((a) => a.id === id)?.nombre ?? "—";
  }

  function descargarGrupo(grupo: CierrePeriodo[]) {
    if (grupo.length === 0) return;
    const lineas: string[] = [];
    for (const cierre of grupo) {
      lineas.push(`ÁREA: ${nombreArea(cierre.area_id).toUpperCase()}`);
      lineas.push(filaCsv(ENCABEZADOS_HISTORIAL));
      for (const fila of cierre.detalle ?? []) {
        lineas.push(
          filaCsv([
            fila.fecha,
            fila.area,
            fila.numero_empleado,
            fila.id_publico,
            fila.nombre_publico,
            Number(fila.monto_esperado).toFixed(2),
            ETIQUETAS_ESTADO_PAGO[fila.estado] ?? fila.estado,
            fila.marcado_por_empleado ? "Sí" : "No",
            fila.marcado_empleado_en ?? "",
            fila.validado_por ?? "",
            fila.validado_en ?? "",
            fila.origen,
            fila.notas ?? "",
            fila.motivo_reversion ?? "",
          ]),
        );
      }
      lineas.push(filaCsv(["Totales", "", "", "", "", "", "", "", "", "", "", "", "", ""]));
      lineas.push(
        filaCsv([
          "Esperado",
          Number(cierre.monto_esperado_total).toFixed(2),
          "Validado",
          Number(cierre.monto_validado_total).toFixed(2),
          "Diferencia",
          Number(cierre.diferencia).toFixed(2),
        ]),
      );
      lineas.push("");
    }
    const [desde, hasta] = [grupo[0].desde, grupo[0].hasta];
    const ok = descargarCsv(`cierre_periodo_${desde}_${hasta}.csv`, lineas);
    mostrarToast(ok ? "CSV descargado." : "No se pudo descargar el CSV.", ok ? "exito" : "error");
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Cierres de periodo</h2>
        {esAdminGeneral && (
          <button className="boton boton-primario" onClick={() => setMostrarNuevo(true)}>
            Cerrar periodo
          </button>
        )}
      </div>

      <p className="texto-suave">
        Un cierre es un corte contable (snapshot); no bloquea seguir validando o revirtiendo pagos de esas fechas.
      </p>

      <EnvoltorioTabla>
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Rango</th>
              <th>Áreas incluidas</th>
              <th>Esperado</th>
              <th>Validado</th>
              <th>Diferencia</th>
              <th>Cerrado el</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(([clave, grupo]) => {
              const esperado = grupo.reduce((s, c) => s + Number(c.monto_esperado_total), 0);
              const validado = grupo.reduce((s, c) => s + Number(c.monto_validado_total), 0);
              return (
                <tr key={clave}>
                  <td>
                    {formatoFecha(grupo[0].desde)} — {formatoFecha(grupo[0].hasta)}
                  </td>
                  <td className="celda-chips-area">
                    {grupo.map((c) => (
                      <ChipArea key={c.id} nombre={nombreArea(c.area_id)} />
                    ))}
                  </td>
                  <td>{formatoMoneda(esperado)}</td>
                  <td>{formatoMoneda(validado)}</td>
                  <td className="valor-kpi diferencia" style={{ fontSize: "1rem" }}>
                    {formatoMoneda(esperado - validado)}
                  </td>
                  <td>{formatoFecha(grupo[0].cerrado_en.slice(0, 10))}</td>
                  <td>
                    <button className="boton boton-chico boton-secundario" onClick={() => descargarGrupo(grupo)}>
                      Descargar CSV
                    </button>
                  </td>
                </tr>
              );
            })}
            {!cargando && grupos.length === 0 && (
              <tr>
                <td colSpan={7} className="estado-vacio">
                  No hay cierres registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </EnvoltorioTabla>

      {mostrarNuevo && (
        <ModalCerrarPeriodo
          onCerrar={() => setMostrarNuevo(false)}
          onListo={() => {
            setMostrarNuevo(false);
            cargar();
          }}
          mostrarToast={mostrarToast}
        />
      )}
    </div>
  );
}

function ModalCerrarPeriodo({
  onCerrar,
  onListo,
  mostrarToast,
}: {
  onCerrar: () => void;
  onListo: () => void;
  mostrarToast: (mensaje: string, tipo?: "exito" | "error" | "info") => void;
}) {
  const [desde, setDesde] = useState(fechaHoyInputCdmx());
  const [hasta, setHasta] = useState(fechaHoyInputCdmx());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await llamarRpc<RespuestaRpc>("cerrar_periodo", { p_desde: desde, p_hasta: hasta });
      mostrarToast(respuesta.mensaje, "exito");
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Cerrar periodo" onCerrar={onCerrar}>
      <p className="texto-suave">
        Se generará un corte de ambas áreas para el rango seleccionado. No se permite traslapar con un cierre ya existente.
      </p>
      <div className="campo">
        <label>Desde</label>
        <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div className="campo">
        <label>Hasta</label>
        <input type="date" value={hasta} min={desde} max={fechaHoyInputCdmx()} onChange={(e) => setHasta(e.target.value)} />
      </div>
      {error && <p className="mensaje-error">{error}</p>}
      <div className="fila-acciones" style={{ justifyContent: "flex-end" }}>
        <button className="boton boton-secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </button>
        <button className="boton boton-primario" onClick={enviar} disabled={enviando}>
          {enviando ? "Cerrando…" : "Cerrar periodo"}
        </button>
      </div>
    </Modal>
  );
}
