import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { llamarRpc } from "../../lib/rpc";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "../../lib/formato";
import { mensajeErrorConsulta } from "../../lib/consulta";
import { descargarCsv, filaCsv } from "../../lib/csv";
import ModalConfirmacion from "../../components/ModalConfirmacion";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import Tabs from "../../components/Tabs";
import ChipArea from "../../components/ChipArea";
import { IconoArchivo, IconoDescarga, IconoDeshacer, IconoSubir } from "../../components/Iconos";
import {
  calcularTotales,
  resolverImportacion,
  type ContextoImportacion,
  type FilaContratoCrudo,
  type FilaResuelta,
} from "../../lib/importacionHorario";
import type { Area, AsistenciaDiaria, Empleado, HistorialCuota, HorarioDiario, PagoCuota, RespuestaRpc } from "../../lib/tipos";

const CLAVE_LOTE = "cinemaquote_importacion_ultimo_lote_v1";

interface FilaLote {
  empleado_id: string;
  fecha: string;
  area_id: string;
  nombre_empleado_bd: string | null;
  asistencia_id: string | null;
  creo_horario: boolean;
}

interface LoteAplicado {
  id: string;
  aplicado_en: string;
  aplicado_por: string;
  filas: FilaLote[];
}

interface FilaResultadoAplicacion {
  fila: FilaResuelta;
  resultado: "creado" | "error";
}

interface ResultadoAplicacion {
  aplicado_en: string;
  filas: FilaResultadoAplicacion[];
}

type PestanaImportar = "crear" | "conflictos" | "revisar" | "registrado";

function cargarLoteGuardado(): LoteAplicado | null {
  try {
    const texto = localStorage.getItem(CLAVE_LOTE);
    if (!texto) return null;
    return JSON.parse(texto) as LoteAplicado;
  } catch {
    return null;
  }
}

function guardarLote(lote: LoteAplicado | null) {
  try {
    if (lote && lote.filas.length > 0) {
      localStorage.setItem(CLAVE_LOTE, JSON.stringify(lote));
    } else {
      localStorage.removeItem(CLAVE_LOTE);
    }
  } catch {
    /* localStorage no disponible: el botón de deshacer simplemente no persiste entre recargas */
  }
}

export default function ImportarHorario() {
  const { perfil } = useAuth();
  const { mostrarToast } = useToast();
  const esAdminGeneral = perfil?.rol === "administrador_general";

  const refArchivo = useRef<HTMLInputElement>(null);
  const [textoJson, setTextoJson] = useState("");
  const [analizando, setAnalizando] = useState(false);
  const [filas, setFilas] = useState<FilaResuelta[] | null>(null);
  const [filasCrudas, setFilasCrudas] = useState<FilaContratoCrudo[] | null>(null);
  const [pestana, setPestana] = useState<PestanaImportar>("crear");
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [loteAplicado, setLoteAplicado] = useState<LoteAplicado | null>(() => cargarLoteGuardado());
  const [ultimoResultado, setUltimoResultado] = useState<ResultadoAplicacion | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [confirmarAplicar, setConfirmarAplicar] = useState(false);
  const [confirmarDeshacer, setConfirmarDeshacer] = useState(false);

  useEffect(() => {
    guardarLote(loteAplicado);
  }, [loteAplicado]);

  function leerArchivo(archivo: File) {
    const lector = new FileReader();
    lector.onload = () => setTextoJson(String(lector.result ?? ""));
    lector.readAsText(archivo, "utf-8");
  }

  async function analizar() {
    let crudo: FilaContratoCrudo[];
    try {
      const parseado = JSON.parse(textoJson);
      if (!Array.isArray(parseado)) throw new Error("El JSON debe ser una lista de filas.");
      crudo = parseado as FilaContratoCrudo[];
    } catch (e) {
      mostrarToast(e instanceof Error ? `JSON inválido: ${e.message}` : "JSON inválido.", "error");
      return;
    }
    if (crudo.length === 0) {
      mostrarToast("El archivo no tiene filas.", "error");
      return;
    }

    setAnalizando(true);
    try {
      const fechas = Array.from(new Set(crudo.map((f) => f.fecha))).sort();
      const desde = fechas[0];
      const hasta = fechas[fechas.length - 1];

      const [respEmpleados, respAreas, respHistorial, respHorarios, respAsistencias, respPagos] = await Promise.all([
        // Sin filtrar por estado: empleados ya inactivos hoy pudieron trabajar en el rango del PDF.
        supabase.from("empleados").select("*"),
        supabase.from("areas").select("*"),
        supabase.from("historial_cuotas").select("*"),
        supabase.from("horario_diario").select("empleado_id, area_id, fecha").gte("fecha", desde).lte("fecha", hasta),
        supabase
          .from("asistencia_diaria")
          .select("empleado_id, area_id, fecha, eliminado")
          .gte("fecha", desde)
          .lte("fecha", hasta),
        supabase.from("pagos_cuota").select("empleado_id, area_id, fecha, estado").gte("fecha", desde).lte("fecha", hasta),
      ]);

      const error =
        respEmpleados.error ??
        respAreas.error ??
        respHistorial.error ??
        respHorarios.error ??
        respAsistencias.error ??
        respPagos.error;
      if (error) {
        mostrarToast(mensajeErrorConsulta(error, "No se pudo consultar el estado actual en CinemaQ."), "error");
        return;
      }

      const ctx: ContextoImportacion = {
        empleados: (respEmpleados.data as Empleado[]) ?? [],
        areas: (respAreas.data as Area[]) ?? [],
        historialCuotas: (respHistorial.data as HistorialCuota[]) ?? [],
        horarios: (respHorarios.data as Pick<HorarioDiario, "empleado_id" | "area_id" | "fecha">[]) ?? [],
        asistencias:
          (respAsistencias.data as Pick<AsistenciaDiaria, "empleado_id" | "area_id" | "fecha" | "eliminado">[]) ?? [],
        pagos: (respPagos.data as Pick<PagoCuota, "empleado_id" | "area_id" | "fecha" | "estado">[]) ?? [],
      };

      const resueltas = resolverImportacion(crudo, ctx);
      setFilasCrudas(crudo);
      setFilas(resueltas);
      setSeleccion(new Set(resueltas.map((_, i) => i).filter((i) => resueltas[i].accion === "crear")));
      setPestana("crear");
      mostrarToast(`Análisis listo: ${resueltas.length} filas del PDF procesadas.`, "exito");
    } finally {
      setAnalizando(false);
    }
  }

  const totales = filas ? calcularTotales(filas) : null;

  const filasCrear = (filas ?? []).map((f, i) => ({ f, i })).filter(({ f }) => f.accion === "crear");
  const filasConflicto = (filas ?? []).filter((f) => f.accion === "conflicto");
  const filasRevisar = (filas ?? []).filter((f) => f.accion === "revisar" || f.accion === "empleado_no_encontrado");
  const filasRegistrado = (filas ?? []).filter((f) => f.accion === "skip_ya_existe");

  function alternarSeleccion(indice: number) {
    setSeleccion((prev) => {
      const copia = new Set(prev);
      if (copia.has(indice)) copia.delete(indice);
      else copia.add(indice);
      return copia;
    });
  }

  function alternarTodaSeleccion() {
    if (seleccion.size === filasCrear.length) {
      setSeleccion(new Set());
    } else {
      setSeleccion(new Set(filasCrear.map(({ i }) => i)));
    }
  }

  async function aplicarSeleccionadas() {
    if (!filas || seleccion.size === 0) return;
    setAplicando(true);
    const filasAAplicar = filasCrear.filter(({ i }) => seleccion.has(i)).map(({ f }) => f);
    const exitosas: FilaLote[] = [];
    const resultadoDetalle: FilaResultadoAplicacion[] = [];
    let fallidas = 0;

    for (const f of filasAAplicar) {
      if (!f.empleado_id || !f.area_id) {
        fallidas += 1;
        resultadoDetalle.push({ fila: f, resultado: "error" });
        continue;
      }
      try {
        if (!f.ya_tiene_horario) {
          await llamarRpc("registrar_horario", { p_empleado_id: f.empleado_id, p_fecha: f.fecha });
        }
        await llamarRpc("registrar_asistencia", { p_empleado_id: f.empleado_id, p_fecha: f.fecha });
        exitosas.push({
          empleado_id: f.empleado_id,
          fecha: f.fecha,
          area_id: f.area_id,
          nombre_empleado_bd: f.nombre_empleado_bd,
          asistencia_id: null,
          creo_horario: !f.ya_tiene_horario,
        });
        resultadoDetalle.push({ fila: f, resultado: "creado" });
      } catch {
        fallidas += 1;
        resultadoDetalle.push({ fila: f, resultado: "error" });
      }
    }

    setUltimoResultado({ aplicado_en: new Date().toISOString(), filas: resultadoDetalle });

    // Recuperar los ids de asistencia recién creados, para poder deshacer con precisión.
    if (exitosas.length > 0) {
      const idsEmpleados = Array.from(new Set(exitosas.map((e) => e.empleado_id)));
      const fechas = Array.from(new Set(exitosas.map((e) => e.fecha)));
      const { data } = await supabase
        .from("asistencia_diaria")
        .select("id, empleado_id, fecha")
        .in("empleado_id", idsEmpleados)
        .in("fecha", fechas)
        .eq("eliminado", false);
      const mapaIds = new Map<string, string>();
      for (const row of (data as { id: string; empleado_id: string; fecha: string }[]) ?? []) {
        mapaIds.set(`${row.empleado_id}__${row.fecha}`, row.id);
      }
      for (const e of exitosas) {
        e.asistencia_id = mapaIds.get(`${e.empleado_id}__${e.fecha}`) ?? null;
      }
    }

    if (exitosas.length > 0) {
      const nuevoLote: LoteAplicado = {
        id: `${Date.now()}`,
        aplicado_en: new Date().toISOString(),
        aplicado_por: perfil?.nombre_completo ?? "—",
        filas: exitosas,
      };
      setLoteAplicado(nuevoLote);
    }

    setSeleccion(new Set());
    setAplicando(false);
    setConfirmarAplicar(false);

    if (fallidas === 0) {
      mostrarToast(`${exitosas.length} obligación(es) de cuota creada(s).`, "exito");
    } else {
      mostrarToast(`${exitosas.length} creadas; ${fallidas} con error (revisa e intenta de nuevo).`, "info");
    }

    if (filasCrudas) {
      // Re-analiza contra el estado ya actualizado para que las filas creadas pasen a "ya registrado".
      const textoActual = textoJson;
      setTextoJson(JSON.stringify(filasCrudas));
      await analizar();
      setTextoJson(textoActual);
    }
  }

  function exportarResultadoCsv() {
    if (!ultimoResultado || ultimoResultado.filas.length === 0) return;
    const encabezados = ["PS", "Empleado", "Área", "Fecha", "Monto esperado", "Resultado", "Creó horario"];
    const lineas = [filaCsv(encabezados)];
    for (const { fila, resultado } of ultimoResultado.filas) {
      lineas.push(
        filaCsv([
          fila.ps,
          fila.nombre_empleado_bd ?? fila.nombre_pdf,
          fila.nombre_area ?? "—",
          fila.fecha,
          (fila.monto_esperado ?? 0).toFixed(2),
          resultado === "creado" ? "Creado" : "Error",
          fila.ya_tiene_horario ? "No (ya existía)" : "Sí",
        ]),
      );
    }
    const ok = descargarCsv(`importacion_horario_${ultimoResultado.aplicado_en.slice(0, 10)}.csv`, lineas);
    mostrarToast(ok ? "CSV descargado." : "No se pudo descargar el CSV.", ok ? "exito" : "error");
  }

  async function deshacerUltimaImportacion() {
    if (!loteAplicado) return;
    setDeshaciendo(true);
    let deshechas = 0;
    const pendientes: FilaLote[] = [];

    for (const fila of loteAplicado.filas) {
      try {
        if (fila.asistencia_id) {
          await llamarRpc<RespuestaRpc>("soft_delete_asistencia", {
            p_asistencia_id: fila.asistencia_id,
            p_motivo: "Deshecho desde Importar horario (modo prueba, sin comprometer datos reales).",
          });
        }
        if (fila.creo_horario) {
          await llamarRpc("quitar_horario", { p_empleado_id: fila.empleado_id, p_fecha: fila.fecha });
        }
        deshechas += 1;
      } catch {
        pendientes.push(fila);
      }
    }

    const loteRestante = pendientes.length > 0 ? { ...loteAplicado, filas: pendientes } : null;
    setLoteAplicado(loteRestante);
    setDeshaciendo(false);
    setConfirmarDeshacer(false);

    if (pendientes.length === 0) {
      mostrarToast(`Se deshicieron ${deshechas} registro(s) de la última importación.`, "exito");
    } else {
      mostrarToast(`Se deshicieron ${deshechas}; ${pendientes.length} no se pudieron revertir. Reintenta.`, "info");
    }

    if (filasCrudas) {
      const textoActual = textoJson;
      setTextoJson(JSON.stringify(filasCrudas));
      await analizar();
      setTextoJson(textoActual);
    }
  }

  const pestanas = [
    { id: "crear", etiqueta: "Por crear", contador: filasCrear.length },
    { id: "conflictos", etiqueta: "Conflictos", contador: filasConflicto.length },
    { id: "revisar", etiqueta: "Revisar", contador: filasRevisar.length },
    { id: "registrado", etiqueta: "Ya registrado", contador: filasRegistrado.length },
  ];

  return (
    <div>
      <div className="barra-herramientas">
        <div className="cabecera-pagina">
          <h2>Importar horario</h2>
          <p className="texto-suave cabecera-pagina__subtitulo">
            Sube el JSON del PDF semanal (generado con parse_horario_v2.py) para ver qué obligaciones de cuota
            deberían existir y crear solo las que falten. Lo que ya esté registrado — a mano o por una importación
            previa — se detecta y se omite automáticamente.
          </p>
        </div>
      </div>

      <div className="barra-herramientas">
        <div className="grupo-filtros" style={{ flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="campo" style={{ marginBottom: 0, minWidth: 280 }}>
            <label htmlFor="importar-horario-archivo">Archivo JSON del contrato crudo</label>
            <input
              id="importar-horario-archivo"
              ref={refArchivo}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) leerArchivo(archivo);
              }}
            />
          </div>
          <div className="campo" style={{ marginBottom: 0, minWidth: 280, flex: 1 }}>
            <label htmlFor="importar-horario-texto">O pega aquí el JSON</label>
            <textarea
              id="importar-horario-texto"
              rows={4}
              value={textoJson}
              onChange={(e) => setTextoJson(e.target.value)}
              placeholder='[{"ps":"012345","nombre_pdf":"...","fecha":"2026-09-01", ...}]'
            />
          </div>
        </div>
        <button
          type="button"
          className="boton boton-primario"
          disabled={!textoJson.trim() || analizando}
          onClick={analizar}
        >
          <IconoSubir width={16} height={16} /> {analizando ? "Analizando…" : "Analizar"}
        </button>
      </div>

      {(ultimoResultado || (loteAplicado && loteAplicado.filas.length > 0)) && (
        <div className="barra-herramientas" role="status">
          <p className="texto-suave" style={{ margin: 0 }}>
            {ultimoResultado
              ? `Última aplicación: ${ultimoResultado.filas.filter((r) => r.resultado === "creado").length} creada(s), ${ultimoResultado.filas.filter((r) => r.resultado === "error").length} con error — ${formatoFechaHora(ultimoResultado.aplicado_en)}.`
              : `Última importación aplicada: ${loteAplicado?.filas.length} fila(s), ${formatoFecha(loteAplicado?.aplicado_en.slice(0, 10))}.`}
          </p>
          <div className="grupo-filtros" style={{ marginBottom: 0 }}>
            {ultimoResultado && (
              <button type="button" className="boton boton-secundario" onClick={exportarResultadoCsv}>
                <IconoDescarga width={16} height={16} /> Exportar CSV
              </button>
            )}
            {esAdminGeneral && loteAplicado && loteAplicado.filas.length > 0 && (
              <button
                type="button"
                className="boton boton-peligro"
                disabled={deshaciendo}
                onClick={() => setConfirmarDeshacer(true)}
                title="Solo visible para administrador general: revierte lo creado por esta importación, para poder probar sin comprometer datos reales."
              >
                <IconoDeshacer width={16} height={16} /> {deshaciendo ? "Deshaciendo…" : "Deshacer última importación (pruebas)"}
              </button>
            )}
          </div>
        </div>
      )}

      {analizando ? (
        <SkeletonTabla filas={6} />
      ) : !filas || !totales ? (
        <EstadoVacio
          icono={<IconoArchivo width={32} height={32} />}
          mensaje="Sube o pega el JSON generado por parse_horario_v2.py y presiona Analizar."
        />
      ) : (
        <>
          <div className="rejilla-kpi">
            <div className="tarjeta tarjeta-kpi">
              <div className="etiqueta-kpi">Debería estar recaudado</div>
              <div className="valor-kpi">{formatoMoneda(totales.deberiaEstarRecaudado)}</div>
            </div>
            <div className="tarjeta tarjeta-kpi">
              <div className="etiqueta-kpi">Ya registrado</div>
              <div className="valor-kpi">{totales.yaRegistrado}</div>
              <div className="texto-suave">{totales.yaValidado} validado(s)</div>
            </div>
            <div className="tarjeta tarjeta-kpi">
              <div className="etiqueta-kpi">Falta por crear</div>
              <div className="valor-kpi">{totales.porCrear}</div>
              <div className="texto-suave">{formatoMoneda(totales.montoPorCrear)}</div>
            </div>
            <div className="tarjeta tarjeta-kpi tarjeta-kpi--en-revision">
              <div className="etiqueta-kpi">Conflictos</div>
              <div className="valor-kpi">{totales.conflictos}</div>
            </div>
            <div className="tarjeta tarjeta-kpi tarjeta-kpi--en-revision">
              <div className="etiqueta-kpi">A revisar</div>
              <div className="valor-kpi">{totales.revisar + totales.empleadosNoEncontrados}</div>
            </div>
          </div>

          <Tabs pestanas={pestanas} activa={pestana} onChange={(id) => setPestana(id as PestanaImportar)}>
            {pestana === "crear" && (
              <>
                {filasCrear.length === 0 ? (
                  <EstadoVacio icono={<IconoArchivo width={32} height={32} />} mensaje="No hay filas pendientes por crear." />
                ) : (
                  <>
                    {esAdminGeneral && (
                      <div className="horario-barra-acciones">
                        <button type="button" className="boton boton-secundario" onClick={alternarTodaSeleccion} disabled={aplicando}>
                          {seleccion.size === filasCrear.length ? "Quitar selección" : "Seleccionar todas"}
                        </button>
                        <button
                          type="button"
                          className="boton boton-primario"
                          disabled={seleccion.size === 0 || aplicando}
                          onClick={() => setConfirmarAplicar(true)}
                        >
                          {aplicando ? "Aplicando…" : `Aplicar seleccionadas (${seleccion.size})`}
                        </button>
                      </div>
                    )}
                    <EnvoltorioTabla>
                      <table className="tabla-datos">
                        <thead>
                          <tr>
                            {esAdminGeneral && <th>Sel.</th>}
                            <th>PS</th>
                            <th>Empleado</th>
                            <th>Área</th>
                            <th>Fecha</th>
                            <th>Horario</th>
                            <th>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filasCrear.map(({ f, i }) => (
                            <tr key={i}>
                              {esAdminGeneral && (
                                <td>
                                  <input
                                    type="checkbox"
                                    className="checkbox-fila"
                                    checked={seleccion.has(i)}
                                    disabled={aplicando}
                                    onChange={() => alternarSeleccion(i)}
                                  />
                                </td>
                              )}
                              <td className="num-tabular">{f.ps}</td>
                              <td>
                                {f.nombre_empleado_bd ?? f.nombre_pdf}
                                {f.advertencia_nombre && (
                                  <span className="texto-suave" title={`En el PDF: ${f.nombre_pdf}`}>
                                    {" "}⚠ nombre distinto en PDF
                                  </span>
                                )}
                              </td>
                              <td><ChipArea nombre={f.nombre_area ?? "—"} /></td>
                              <td className="num-tabular">{formatoFecha(f.fecha)}</td>
                              <td className="num-tabular">{f.hora_inicio} – {f.hora_fin}</td>
                              <td className="num-tabular">
                                {formatoMoneda(f.monto_esperado)}
                                {f.monto_esperado_es_fallback && (
                                  <span className="texto-suave" title="No se encontró vigencia en historial_cuotas; se usó la cuota actual del área.">
                                    {" "}*
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </EnvoltorioTabla>
                  </>
                )}
              </>
            )}

            {pestana === "conflictos" && (
              <>
                {filasConflicto.length === 0 ? (
                  <EstadoVacio icono={<IconoArchivo width={32} height={32} />} mensaje="Sin conflictos en este archivo." />
                ) : (
                  <EnvoltorioTabla>
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>PS</th>
                          <th>Empleado</th>
                          <th>Fecha</th>
                          <th>Área en PDF</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasConflicto.map((f, i) => (
                          <tr key={i}>
                            <td className="num-tabular">{f.ps}</td>
                            <td>{f.nombre_empleado_bd ?? f.nombre_pdf}</td>
                            <td className="num-tabular">{formatoFecha(f.fecha)}</td>
                            <td><ChipArea nombre={f.nombre_area ?? "—"} /></td>
                            <td>{f.motivos_resolucion.join(" · ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </EnvoltorioTabla>
                )}
              </>
            )}

            {pestana === "revisar" && (
              <>
                {filasRevisar.length === 0 ? (
                  <EstadoVacio icono={<IconoArchivo width={32} height={32} />} mensaje="Sin filas pendientes de revisión." />
                ) : (
                  <EnvoltorioTabla>
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>PS</th>
                          <th>Nombre en PDF</th>
                          <th>Fecha</th>
                          <th>Celda original</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasRevisar.map((f, i) => (
                          <tr key={i}>
                            <td className="num-tabular">{f.ps}</td>
                            <td>{f.nombre_pdf}</td>
                            <td className="num-tabular">{formatoFecha(f.fecha)}</td>
                            <td>{f.raw_cell || "—"}</td>
                            <td>{[...f.motivos, ...f.motivos_resolucion].join(" · ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </EnvoltorioTabla>
                )}
              </>
            )}

            {pestana === "registrado" && (
              <>
                {filasRegistrado.length === 0 ? (
                  <EstadoVacio icono={<IconoArchivo width={32} height={32} />} mensaje="Nada coincide todavía con registros existentes." />
                ) : (
                  <EnvoltorioTabla>
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>PS</th>
                          <th>Empleado</th>
                          <th>Área</th>
                          <th>Fecha</th>
                          <th>Validado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasRegistrado.map((f, i) => (
                          <tr key={i}>
                            <td className="num-tabular">{f.ps}</td>
                            <td>{f.nombre_empleado_bd ?? f.nombre_pdf}</td>
                            <td><ChipArea nombre={f.nombre_area ?? "—"} /></td>
                            <td className="num-tabular">{formatoFecha(f.fecha)}</td>
                            <td>{f.pago_validado ? "Sí" : "No"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </EnvoltorioTabla>
                )}
              </>
            )}
          </Tabs>
        </>
      )}

      {confirmarAplicar && (
        <ModalConfirmacion
          titulo="Aplicar importación"
          mensaje={`Se creará horario y/o asistencia para ${seleccion.size} fila(s) seleccionada(s). Esto genera obligaciones de pago reales en CinemaQ.`}
          etiquetaBotonConfirmar="Aplicar"
          onCancelar={() => setConfirmarAplicar(false)}
          onConfirmar={aplicarSeleccionadas}
        />
      )}

      {confirmarDeshacer && loteAplicado && (
        <ModalConfirmacion
          titulo="Deshacer última importación"
          mensaje={`Se revertirán ${loteAplicado.filas.length} fila(s) creadas por la última importación (soft-delete de asistencia y baja de horario). No afecta registros hechos a mano antes de esa importación. Pensado para pruebas.`}
          etiquetaBotonConfirmar="Deshacer"
          peligro
          onCancelar={() => setConfirmarDeshacer(false)}
          onConfirmar={deshacerUltimaImportacion}
        />
      )}
    </div>
  );
}
