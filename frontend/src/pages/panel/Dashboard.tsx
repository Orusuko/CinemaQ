import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useArea } from "../../context/AreaContext";
import {
  formatoFecha,
  formatoFechaHora,
  formatoMoneda,
  ETIQUETAS_ESTADO_PAGO,
  claseEstadoPago,
  nombreCompletoEmpleado,
  fechaHoyInputCdmx,
} from "../../lib/formato";
import { calcularRango, type PeriodoBalance } from "../../lib/rangosFecha";
import {
  calcularPeriodoAbierto,
  cierreMasAntiguoEntre,
  formatoRangoPeriodo,
  hoyCdmx,
} from "../../lib/periodoAbierto";
import {
  calcularEvolucionDiaria,
  calcularTotalesDia,
  calcularTotalesPeriodo,
  diaAnteriorIso,
} from "../../lib/balanceAgregados";
import {
  claveCacheBalance,
  guardarCacheBalance,
  leerCacheBalance,
} from "../../lib/balanceCache";
import { descargarCsv, filaCsv, ENCABEZADOS_HISTORIAL, nombreArchivoCsv } from "../../lib/csv";
import { mensajeErrorConsulta } from "../../lib/consulta";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import Tabs from "../../components/Tabs";
import ChipArea from "../../components/ChipArea";
import Modal from "../../components/Modal";
import EstadoVacio from "../../components/EstadoVacio";
import SkeletonTabla from "../../components/SkeletonTabla";
import GraficaEvolucionDiaria from "../../components/GraficaEvolucionDiaria";
import IndicadorTendencia from "../../components/IndicadorTendencia";
import { IconoMoneda, IconoBillete, IconoCheck, IconoLista } from "../../components/Iconos";
import { useToast } from "../../context/ToastContext";
import type { PagoCuota } from "../../lib/tipos";

/* ------------------------------------------------------------------ */
/* Tipos locales                                                        */
/* ------------------------------------------------------------------ */
type FiltroDrillDown = "todos" | "pendiente" | "en_revision" | "con_marcado" | "sin_marcado";

function SkeletonKpi() {
  return (
    <div className="tarjeta tarjeta-kpi">
      <div className="skeleton skeleton-texto" style={{ width: "50%" }} />
      <div className="skeleton skeleton-kpi" />
    </div>
  );
}

function SkeletonGrafica() {
  return (
    <div className="tarjeta grafica-evolucion" aria-hidden="true">
      <div className="skeleton skeleton-texto" style={{ width: "40%", marginBottom: "1rem" }} />
      <div className="skeleton" style={{ height: 220, borderRadius: "var(--radio-borde)" }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabla resumen por estado y área                                      */
/* ------------------------------------------------------------------ */
const ESTADOS_RESUMEN = ["validado", "marcado_pendiente_validacion", "pendiente", "cancelado"] as const;
const ETIQUETAS_ESTADO_RESUMEN: Record<string, string> = {
  validado: "Validado",
  marcado_pendiente_validacion: "En revisión",
  pendiente: "Pendiente",
  cancelado: "Cancelado",
};
const CLASE_INDICADOR_ESTADO: Record<string, string> = {
  validado: "indicador-color--validado",
  marcado_pendiente_validacion: "indicador-color--revision",
  pendiente: "indicador-color--pendiente",
  cancelado: "indicador-color--cancelado",
};

function TablaResumenEstado({
  pagos,
  nombreArea,
  areas,
}: {
  pagos: PagoCuota[];
  nombreArea: (id: string) => string;
  areas: { id: string; nombre: string }[];
}) {
  /* Obtener áreas únicas presentes en los pagos */
  const areasPresentes = useMemo(() => {
    const ids = new Set(pagos.map((p) => p.area_id));
    return areas.filter((a) => ids.has(a.id));
  }, [pagos, areas]);

  const datos = useMemo(() => {
    return ESTADOS_RESUMEN.map((estado) => {
      const pagosFiltrados = pagos.filter((p) => p.estado === estado);
      const total = pagosFiltrados.reduce((s, p) => s + Number(p.monto_esperado), 0);
      const porArea = areasPresentes.map((area) => {
        const pArea = pagosFiltrados.filter((p) => p.area_id === area.id);
        return pArea.reduce((s, p) => s + Number(p.monto_esperado), 0);
      });
      return { estado, etiqueta: ETIQUETAS_ESTADO_RESUMEN[estado], total, porArea, conteo: pagosFiltrados.length };
    });
  }, [pagos, areasPresentes]);

  if (pagos.length === 0) return null;

  return (
    <div className="tarjeta tabla-resumen-balance">
      <div className="tabla-resumen-balance__titulo">Resumen por estado</div>

      {/* Escritorio: tabla compacta */}
      <div className="tabla-resumen-balance__escritorio envoltorio-tabla">
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Estado</th>
              <th>Cuotas</th>
              {areasPresentes.map((a) => (
                <th key={a.id}>{nombreArea(a.id)}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((d) => (
              <tr key={d.estado}>
                <td>
                  <span className={`indicador-color ${CLASE_INDICADOR_ESTADO[d.estado]}`} aria-hidden="true" />
                  {d.etiqueta}
                </td>
                <td className="num-tabular">{d.conteo}</td>
                {d.porArea.map((m, i) => (
                  <td key={areasPresentes[i].id} className="num-tabular">{formatoMoneda(m)}</td>
                ))}
                <td className="num-tabular"><strong>{formatoMoneda(d.total)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Móvil: tarjetas densas (evita el apilado genérico tabla→tarjeta) */}
      <div className="tabla-resumen-balance__movil" role="list">
        {datos.map((d) => (
          <article key={d.estado} className="resumen-estado-card" role="listitem">
            <header className="resumen-estado-card__cabecera">
              <span className="resumen-estado-card__estado">
                <span className={`indicador-color ${CLASE_INDICADOR_ESTADO[d.estado]}`} aria-hidden="true" />
                {d.etiqueta}
              </span>
              <strong className="resumen-estado-card__total num-tabular">{formatoMoneda(d.total)}</strong>
            </header>
            <p className="resumen-estado-card__meta">
              {d.conteo} cuota{d.conteo !== 1 ? "s" : ""}
            </p>
            {areasPresentes.length > 0 && (
              <div className="resumen-estado-card__areas">
                {areasPresentes.map((area, i) => (
                  <div key={area.id} className="resumen-estado-card__area">
                    <span className="resumen-estado-card__area-nombre">{nombreArea(area.id)}</span>
                    <span className="num-tabular">{formatoMoneda(d.porArea[i])}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Componente principal                                                */
/* ------------------------------------------------------------------ */
export default function Dashboard() {
  const { perfil } = useAuth();
  const esSupervision = perfil?.rol === "supervision";
  const { areas, areaIdsFiltro, cargando: cargandoAreas } = useArea();
  const { mostrarToast } = useToast();

  /* --- Estado periodo abierto (hidrata desde caché si se vuelve a la ruta) --- */
  const claveBalance = claveCacheBalance(areaIdsFiltro);
  const cacheInicial = leerCacheBalance(claveBalance);
  const [pagosPeriodo, setPagosPeriodo] = useState<PagoCuota[]>(() => cacheInicial?.pagos ?? []);
  const [cargandoPeriodo, setCargandoPeriodo] = useState(() => !cacheInicial);
  const [rangoPeriodo, setRangoPeriodo] = useState(() => cacheInicial?.rango ?? { desde: "", hasta: "" });

  /* --- Estado vista histórica --- */
  const [periodo, setPeriodo] = useState<PeriodoBalance>("dia");
  const [rangoManual, setRangoManual] = useState({ desde: fechaHoyInputCdmx(), hasta: fechaHoyInputCdmx() });
  const [pagosHistorico, setPagosHistorico] = useState<PagoCuota[]>([]);
  const [cargandoHistorico, setCargandoHistorico] = useState(false);
  const [historicoAbierto, setHistoricoAbierto] = useState(false);
  const [pestanaHistorico, setPestanaHistorico] = useState<"pendientes" | "todos">("pendientes");

  /* --- Modal drill-down --- */
  const [modalAbierto, setModalAbierto] = useState(false);
  const [filtroModal, setFiltroModal] = useState<FiltroDrillDown>("todos");

  const rangoHistorico = useMemo(() => calcularRango(periodo, rangoManual), [periodo, rangoManual]);

  function abrirDrillDown(filtro: FiltroDrillDown) {
    setFiltroModal(filtro);
    setModalAbierto(true);
  }

  /* ---------------------------------------------------------------- */
  /* Cargar periodo contable abierto                                    */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (cargandoAreas) return;
    let cancelado = false;
    const clave = claveCacheBalance(areaIdsFiltro);
    const cache = leerCacheBalance(clave);
    /* Si hay caché, mostrar datos al instante y refrescar en silencio (sin skeleton). */
    const silencioso = Boolean(cache);
    if (cache) {
      setPagosPeriodo(cache.pagos);
      setRangoPeriodo(cache.rango);
      setCargandoPeriodo(false);
    }

    async function cargar() {
      if (!silencioso) setCargandoPeriodo(true);
      const hoy = hoyCdmx();

      /* 1. Obtener último cierre por área */
      let consultaCierres = supabase
        .from("cierres_periodo")
        .select("hasta")
        .order("cerrado_en", { ascending: false });

      if (areaIdsFiltro) {
        consultaCierres = consultaCierres.in("area_id", areaIdsFiltro);
      }

      const { data: cierresData } = await consultaCierres;
      if (cancelado) return;

      let ultimoCierre: { hasta: string } | null = null;
      if (cierresData && cierresData.length > 0) {
        if (!areaIdsFiltro || areaIdsFiltro.length <= 1) {
          ultimoCierre = { hasta: (cierresData[0] as { hasta: string }).hasta };
        } else {
          const cierresUnicos = cierresData.map((c) => ({ hasta: (c as { hasta: string }).hasta }));
          ultimoCierre = cierreMasAntiguoEntre(cierresUnicos);
        }
      }

      /* 2. Calcular rango del periodo abierto */
      const rango = calcularPeriodoAbierto(ultimoCierre, hoy);
      setRangoPeriodo(rango);

      /* 3. Consultar pagos del periodo abierto */
      let consultaPagos = supabase
        .from("pagos_cuota")
        .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
        .gte("fecha", rango.desde)
        .lte("fecha", rango.hasta);

      if (areaIdsFiltro) consultaPagos = consultaPagos.in("area_id", areaIdsFiltro);

      const { data: pagosData, error } = await consultaPagos;
      if (cancelado) return;

      if (error) {
        mostrarToast(mensajeErrorConsulta(error, "No se pudo cargar el balance del periodo."), "error");
        if (!silencioso) setPagosPeriodo([]);
      } else {
        const pagos = (pagosData as PagoCuota[]) ?? [];
        setPagosPeriodo(pagos);
        guardarCacheBalance(clave, pagos, rango);
      }
      setCargandoPeriodo(false);
    }

    cargar();
    return () => { cancelado = true; };
  }, [areaIdsFiltro, cargandoAreas]);

  /* ---------------------------------------------------------------- */
  /* Cargar vista histórica (solo cuando se abre)                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!historicoAbierto || cargandoAreas) return;
    let cancelado = false;

    async function cargar() {
      setCargandoHistorico(true);
      let consulta = supabase
        .from("pagos_cuota")
        .select("*, empleados(numero_empleado, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)")
        .gte("fecha", rangoHistorico.desde)
        .lte("fecha", rangoHistorico.hasta);

      if (areaIdsFiltro) consulta = consulta.in("area_id", areaIdsFiltro);

      const { data, error } = await consulta;
      if (cancelado) return;

      if (error) {
        mostrarToast(mensajeErrorConsulta(error, "No se pudo cargar el historial."), "error");
        setPagosHistorico([]);
      } else {
        setPagosHistorico((data as PagoCuota[]) ?? []);
      }
      setCargandoHistorico(false);
    }

    cargar();
    return () => { cancelado = true; };
  }, [rangoHistorico, areaIdsFiltro, cargandoAreas, historicoAbierto]);

  /* ---------------------------------------------------------------- */
  /* Cálculos derivados — Periodo abierto                               */
  /* ---------------------------------------------------------------- */
  const totalesPeriodo = useMemo(() => calcularTotalesPeriodo(pagosPeriodo), [pagosPeriodo]);

  const pctRecaudado = totalesPeriodo.esperado > 0
    ? Math.min(100, Math.round((totalesPeriodo.recaudado / totalesPeriodo.esperado) * 100))
    : 0;

  const hoy = hoyCdmx();
  const ayer = useMemo(() => diaAnteriorIso(hoy), [hoy]);

  const pagosHoy = useMemo(() => pagosPeriodo.filter((p) => p.fecha === hoy), [pagosPeriodo, hoy]);
  const pagosAyer = useMemo(() => pagosPeriodo.filter((p) => p.fecha === ayer), [pagosPeriodo, ayer]);

  const totalesHoy = useMemo(() => calcularTotalesDia(pagosHoy), [pagosHoy]);
  const totalesAyer = useMemo(() => calcularTotalesDia(pagosAyer), [pagosAyer]);

  const evolucionDiaria = useMemo(
    () => calcularEvolucionDiaria(pagosPeriodo, rangoPeriodo),
    [pagosPeriodo, rangoPeriodo],
  );

  /* Pagos para el modal drill-down (pendientes + en revisión del periodo) */
  const pagosDrillDown = useMemo(() => {
    const noResueltos = pagosPeriodo.filter(
      (p) => p.estado === "pendiente" || p.estado === "marcado_pendiente_validacion",
    );
    noResueltos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    return noResueltos;
  }, [pagosPeriodo]);

  const pagosDrillDownFiltrados = useMemo(() => {
    switch (filtroModal) {
      case "pendiente":
        return pagosDrillDown.filter((p) => p.estado === "pendiente");
      case "en_revision":
        return pagosDrillDown.filter((p) => p.estado === "marcado_pendiente_validacion");
      case "con_marcado":
        return pagosDrillDown.filter((p) => p.marcado_por_empleado);
      case "sin_marcado":
        return pagosDrillDown.filter((p) => !p.marcado_por_empleado);
      default:
        return pagosDrillDown;
    }
  }, [pagosDrillDown, filtroModal]);

  /* ---------------------------------------------------------------- */
  /* Cálculos derivados — Vista histórica                               */
  /* ---------------------------------------------------------------- */
  const totalesHistorico = useMemo(() => {
    let esperado = 0;
    let recaudado = 0;
    let enRevision = 0;
    for (const p of pagosHistorico) {
      if (p.estado !== "cancelado") esperado += Number(p.monto_esperado);
      if (p.estado === "validado") recaudado += Number(p.monto_esperado);
      if (p.estado === "marcado_pendiente_validacion") enRevision += Number(p.monto_esperado);
    }
    return { esperado, recaudado, enRevision, diferencia: esperado - recaudado };
  }, [pagosHistorico]);

  const pendientesHistorico = pagosHistorico.filter(
    (p) => p.estado === "pendiente" || p.estado === "marcado_pendiente_validacion",
  );

  /* ---------------------------------------------------------------- */
  /* Helpers                                                            */
  /* ---------------------------------------------------------------- */
  function nombreArea(areaId: string) {
    return areas.find((a) => a.id === areaId)?.nombre ?? "—";
  }

  function exportarBalance(pagos: PagoCuota[], desde: string, hasta: string, prefijo: string) {
    const lineas = [filaCsv(ENCABEZADOS_HISTORIAL)];
    for (const p of pagos) {
      lineas.push(
        filaCsv([
          p.fecha,
          nombreArea(p.area_id),
          p.empleados?.numero_empleado ?? "",
          "",
          p.empleados ? nombreCompletoEmpleado(p.empleados) : "",
          Number(p.monto_esperado).toFixed(2),
          ETIQUETAS_ESTADO_PAGO[p.estado],
          p.marcado_por_empleado ? "Sí" : "No",
          p.marcado_empleado_en ?? "",
          p.validado_por ?? "",
          p.validado_en ?? "",
          p.origen,
          p.notas ?? "",
          p.motivo_reversion ?? "",
        ]),
      );
    }
    const nombreAreaArchivo = areaIdsFiltro && areaIdsFiltro.length === 1 ? nombreArea(areaIdsFiltro[0]) : "ambas";
    const ok = descargarCsv(nombreArchivoCsv(prefijo, nombreAreaArchivo, desde, hasta), lineas);
    mostrarToast(ok ? "CSV descargado." : "No se pudo descargar el CSV.", ok ? "exito" : "error");
  }

  const etiquetaArea = (() => {
    if (!areaIdsFiltro) return "Ambas áreas";
    if (areaIdsFiltro.length === 1) return nombreArea(areaIdsFiltro[0]);
    return "Ambas áreas";
  })();

  const subtituloPeriodo = rangoPeriodo.desde
    ? `Periodo abierto: ${formatoRangoPeriodo(rangoPeriodo.desde, rangoPeriodo.hasta)} · ${etiquetaArea}`
    : "";

  const enlacePagosHoy = `/panel/pagos?pestana=revision&desde=${encodeURIComponent(hoy)}&hasta=${encodeURIComponent(hoy)}`;

  const ETIQUETAS_PERIODO: Record<PeriodoBalance, string> = {
    dia: "Hoy",
    semana: "Esta semana",
    mes: "Este mes",
    rango: `${rangoHistorico.desde} – ${rangoHistorico.hasta}`,
  };

  const subtituloHistorico = `${ETIQUETAS_PERIODO[periodo]} · ${etiquetaArea}`;

  function enlacePagosFila(fecha: string) {
    return `/panel/pagos?pestana=revision&desde=${encodeURIComponent(fecha)}&hasta=${encodeURIComponent(fecha)}`;
  }

  const FILTROS_MODAL: { id: FiltroDrillDown; etiqueta: string }[] = [
    { id: "todos", etiqueta: "Todos" },
    { id: "pendiente", etiqueta: "Solo pendiente" },
    { id: "en_revision", etiqueta: "Solo en revisión" },
    { id: "con_marcado", etiqueta: "Con marcado" },
    { id: "sin_marcado", etiqueta: "Sin marcado" },
  ];

  /* ---------------------------------------------------------------- */
  /* Render                                                             */
  /* ---------------------------------------------------------------- */
  return (
    <div>
      {/* =========================================================== */}
      {/* HERO — Periodo contable abierto                              */}
      {/* =========================================================== */}
      <div className="barra-herramientas">
        <div className="cabecera-pagina">
          <h2>Balance</h2>
          {subtituloPeriodo && (
            <p className="texto-suave cabecera-pagina__subtitulo" style={{ fontSize: "0.85rem" }}>
              {subtituloPeriodo}
            </p>
          )}
        </div>
        <button
          className="boton boton-secundario"
          onClick={() => exportarBalance(pagosPeriodo, rangoPeriodo.desde, rangoPeriodo.hasta, "balance_periodo")}
          disabled={cargandoPeriodo}
        >
          Exportar CSV
        </button>
      </div>

      {/* KPIs hero (2 principales) */}
      {cargandoPeriodo ? (
        <div className="rejilla-kpi--hero-dos">
          <SkeletonKpi />
          <SkeletonKpi />
        </div>
      ) : (
        <div className="rejilla-kpi--hero-dos">
          <div className="tarjeta tarjeta-kpi tarjeta-kpi--hero">
            <div className="tarjeta-kpi__icono tarjeta-kpi__icono--primario">
              <IconoMoneda width={24} height={24} />
            </div>
            <div className="tarjeta-kpi__cuerpo">
              <div className="etiqueta-kpi">Total a recaudar</div>
              <div className="valor-kpi">{formatoMoneda(totalesPeriodo.esperado)}</div>
              <IndicadorTendencia
                actual={totalesHoy.esperado}
                anterior={totalesAyer.esperado}
                etiqueta="hoy vs ayer"
              />
            </div>
          </div>

          <div className="tarjeta tarjeta-kpi tarjeta-kpi--hero">
            <div className="tarjeta-kpi__icono tarjeta-kpi__icono--exito">
              <IconoBillete width={24} height={24} />
            </div>
            <div className="tarjeta-kpi__cuerpo">
              <div className="etiqueta-kpi">Validado en caja</div>
              <div className="valor-kpi">{formatoMoneda(totalesPeriodo.recaudado)}</div>
              <IndicadorTendencia
                actual={totalesHoy.recaudado}
                anterior={totalesAyer.recaudado}
                etiqueta="hoy vs ayer"
              />
            </div>
          </div>
        </div>
      )}

      {/* KPIs secundarios del periodo */}
      {!cargandoPeriodo && (
        <div className="rejilla-kpi" style={{ marginBottom: "1rem" }}>
          <div
            className="tarjeta tarjeta-kpi tarjeta-kpi--clicable"
            onClick={() => abrirDrillDown("pendiente")}
            role="button"
            tabIndex={0}
            aria-label="Ver detalle: falta por cobrar"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirDrillDown("pendiente"); } }}
          >
            <div className="etiqueta-kpi">Falta por cobrar</div>
            <div className={`valor-kpi ${totalesPeriodo.faltaPorCobrar === 0 ? "diferencia-cero" : "diferencia"}`}>
              {formatoMoneda(totalesPeriodo.faltaPorCobrar)}
            </div>
            <div className="texto-suave" style={{ fontSize: "0.82rem" }}>{totalesPeriodo.pendientes} cuota{totalesPeriodo.pendientes !== 1 ? "s" : ""}</div>
          </div>
          <div
            className="tarjeta tarjeta-kpi tarjeta-kpi--en-revision tarjeta-kpi--clicable"
            onClick={() => abrirDrillDown("en_revision")}
            role="button"
            tabIndex={0}
            aria-label="Ver detalle: en revisión"
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrirDrillDown("en_revision"); } }}
          >
            <div className="etiqueta-kpi">En revisión</div>
            <div className="valor-kpi" style={{ color: "var(--color-advertencia)" }}>
              {formatoMoneda(totalesPeriodo.enRevision)}
            </div>
          </div>
        </div>
      )}

      {/* Barra de avance (incluye el %) */}
      {!cargandoPeriodo && totalesPeriodo.esperado > 0 && (
        <div className="barra-progreso-recaudo tarjeta">
          <div className="barra-progreso-recaudo__cabecera">
            <span className="texto-suave">Avance del periodo</span>
            <strong>{pctRecaudado}% recaudado</strong>
          </div>
          <div className="barra-progreso-recaudo__pista" role="progressbar" aria-valuenow={pctRecaudado} aria-valuemin={0} aria-valuemax={100}>
            <div className="barra-progreso-recaudo__relleno" style={{ width: `${pctRecaudado}%` }} />
          </div>
        </div>
      )}

      {/* =========================================================== */}
      {/* GRÁFICA — Evolución diaria                                    */}
      {/* =========================================================== */}
      {cargandoPeriodo ? (
        <SkeletonGrafica />
      ) : (
        <GraficaEvolucionDiaria datos={evolucionDiaria} />
      )}

      {/* =========================================================== */}
      {/* TABLA RESUMEN — Por estado y área                             */}
      {/* =========================================================== */}
      {!cargandoPeriodo && pagosPeriodo.length > 0 && (
        <TablaResumenEstado pagos={pagosPeriodo} nombreArea={nombreArea} areas={areas} />
      )}

      {/* =========================================================== */}
      {/* BLOQUE HOY — Operación diaria compacta                       */}
      {/* =========================================================== */}
      {!cargandoPeriodo && (
        <div className="tarjeta bloque-hoy">
          <div className="bloque-hoy__titulo">Hoy</div>
          <div className="bloque-hoy__kpis">
            <div className="bloque-hoy__kpi">
              <span className="bloque-hoy__kpi-valor">{totalesHoy.pendientes}</span>
              <span className="bloque-hoy__kpi-etiqueta">Pendientes</span>
            </div>
            <div className="bloque-hoy__kpi">
              <span className="bloque-hoy__kpi-valor" style={{ color: "var(--color-advertencia)" }}>
                {totalesHoy.enRevision}
              </span>
              <span className="bloque-hoy__kpi-etiqueta">En revisión</span>
            </div>
            <div className="bloque-hoy__kpi">
              <span className="bloque-hoy__kpi-valor" style={{ color: "var(--color-exito)" }}>
                {totalesHoy.validados}
              </span>
              <span className="bloque-hoy__kpi-etiqueta">Validados</span>
            </div>
          </div>
          <Link to={enlacePagosHoy} className="enlace-accion" style={{ marginLeft: "auto" }}>
            Ir a Pagos →
          </Link>
        </div>
      )}

      {/* =========================================================== */}
      {/* VISTA HISTÓRICA — colapsable                                  */}
      {/* =========================================================== */}
      <details
        className="vista-historica"
        open={historicoAbierto}
        onToggle={(e) => setHistoricoAbierto((e.target as HTMLDetailsElement).open)}
      >
        <summary>Vista histórica</summary>
        <div className="vista-historica__contenido">
          <div className="barra-herramientas">
            <p className="texto-suave" style={{ margin: 0, fontSize: "0.85rem" }}>
              {subtituloHistorico}
            </p>
            <div className="grupo-filtros">
              <div className="campo" style={{ marginBottom: 0 }}>
                <label htmlFor="balance-filtro-periodo">Periodo</label>
                <select
                  id="balance-filtro-periodo"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value as PeriodoBalance)}
                >
                  <option value="dia">Hoy</option>
                  <option value="semana">Esta semana</option>
                  <option value="mes">Este mes</option>
                  <option value="rango">Rango libre</option>
                </select>
              </div>
              {periodo === "rango" && (
                <>
                  <div className="campo" style={{ marginBottom: 0 }}>
                    <label htmlFor="balance-filtro-desde">Desde</label>
                    <input
                      id="balance-filtro-desde"
                      type="date"
                      value={rangoManual.desde}
                      onChange={(e) => setRangoManual((r) => ({ ...r, desde: e.target.value }))}
                    />
                  </div>
                  <div className="campo" style={{ marginBottom: 0 }}>
                    <label htmlFor="balance-filtro-hasta">Hasta</label>
                    <input
                      id="balance-filtro-hasta"
                      type="date"
                      value={rangoManual.hasta}
                      onChange={(e) => setRangoManual((r) => ({ ...r, hasta: e.target.value }))}
                    />
                  </div>
                </>
              )}
              <button
                className="boton boton-secundario"
                onClick={() => exportarBalance(pagosHistorico, rangoHistorico.desde, rangoHistorico.hasta, "balance")}
                disabled={cargandoHistorico}
              >
                Exportar CSV
              </button>
            </div>
          </div>

          {/* KPIs históricos compactos */}
          {cargandoHistorico ? (
            <div className="rejilla-kpi">
              <SkeletonKpi />
              <SkeletonKpi />
              <SkeletonKpi />
              <SkeletonKpi />
            </div>
          ) : (
            <div className="rejilla-kpi">
              <div className="tarjeta tarjeta-kpi">
                <div className="etiqueta-kpi">Total a recaudar</div>
                <div className="valor-kpi">{formatoMoneda(totalesHistorico.esperado)}</div>
              </div>
              <div className="tarjeta tarjeta-kpi">
                <div className="etiqueta-kpi">Validado en caja</div>
                <div className="valor-kpi">{formatoMoneda(totalesHistorico.recaudado)}</div>
              </div>
              <div className="tarjeta tarjeta-kpi">
                <div className="etiqueta-kpi">Diferencia</div>
                <div className={`valor-kpi ${totalesHistorico.diferencia === 0 ? "diferencia-cero" : "diferencia"}`}>
                  {formatoMoneda(totalesHistorico.diferencia)}
                </div>
              </div>
              <div className="tarjeta tarjeta-kpi tarjeta-kpi--en-revision">
                <div className="etiqueta-kpi">En revisión</div>
                <div className="valor-kpi" style={{ color: "var(--color-advertencia)" }}>
                  {formatoMoneda(totalesHistorico.enRevision)}
                </div>
              </div>
            </div>
          )}

          {/* Tabs del historial */}
          <Tabs
            pestanas={[
              { id: "pendientes", etiqueta: "Pendientes", contador: pendientesHistorico.length },
              { id: "todos", etiqueta: "Todos", contador: pagosHistorico.length },
            ]}
            activa={pestanaHistorico}
            onChange={(id) => setPestanaHistorico(id as "pendientes" | "todos")}
          >
            {pestanaHistorico === "pendientes" && (
              <>
                {cargandoHistorico ? (
                  <SkeletonTabla />
                ) : pendientesHistorico.length === 0 ? (
                  <EstadoVacio
                    icono={<IconoCheck width={32} height={32} />}
                    mensaje="No hay pagos pendientes en este periodo."
                  />
                ) : (
                  <TablaResumenHistorico pagos={pendientesHistorico} nombreArea={nombreArea} esSupervision={esSupervision} rango={rangoHistorico} />
                )}
              </>
            )}
            {pestanaHistorico === "todos" && (
              <>
                {cargandoHistorico ? (
                  <SkeletonTabla filas={6} />
                ) : pagosHistorico.length === 0 ? (
                  <EstadoVacio
                    icono={<IconoLista width={32} height={32} />}
                    mensaje="No hay pagos registrados en este periodo."
                  />
                ) : (
                  <TablaResumenHistorico pagos={pagosHistorico} nombreArea={nombreArea} esSupervision={esSupervision} rango={rangoHistorico} soloLectura />
                )}
              </>
            )}
          </Tabs>
        </div>
      </details>

      {/* =========================================================== */}
      {/* MODAL DRILL-DOWN — Detalle de adeudos del periodo             */}
      {/* =========================================================== */}
      {modalAbierto && (
        <Modal
          titulo="Detalle de adeudos del periodo"
          onCerrar={() => setModalAbierto(false)}
          extraAncho
        >
          <p className="texto-suave" style={{ margin: "0 0 0.75rem", fontSize: "0.85rem" }}>
            {subtituloPeriodo} · {pagosDrillDownFiltrados.length} registros
          </p>

          <div className="filtros-rapidos">
            {FILTROS_MODAL.map((f) => (
              <button
                key={f.id}
                className={`filtro-chip ${filtroModal === f.id ? "filtro-chip--activo" : ""}`}
                onClick={() => setFiltroModal(f.id)}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>

          {pagosDrillDownFiltrados.length === 0 ? (
            <EstadoVacio
              icono={<IconoCheck width={32} height={32} />}
              mensaje="No hay registros con este filtro."
            />
          ) : (
            <EnvoltorioTabla>
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Área</th>
                    <th>Fecha cuota</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th>Marcado empleado</th>
                    <th>Validado</th>
                    <th>Notas / Motivo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagosDrillDownFiltrados.map((p) => (
                    <tr key={p.id}>
                      <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
                      <td><ChipArea nombre={nombreArea(p.area_id)} /></td>
                      <td>{formatoFecha(p.fecha)}</td>
                      <td>{formatoMoneda(p.monto_esperado)}</td>
                      <td>
                        <span className={claseEstadoPago(p.estado)}>
                          {ETIQUETAS_ESTADO_PAGO[p.estado]}
                        </span>
                      </td>
                      <td>
                        {p.marcado_por_empleado ? (
                          <span>
                            Sí
                            <br />
                            <span className="texto-suave" style={{ fontSize: "0.78rem" }}>
                              {formatoFechaHora(p.marcado_empleado_en)}
                            </span>
                          </span>
                        ) : (
                          "No"
                        )}
                      </td>
                      <td>
                        {p.validado ? (
                          <span>
                            Sí
                            <br />
                            <span className="texto-suave" style={{ fontSize: "0.78rem" }}>
                              {formatoFechaHora(p.validado_en)}
                            </span>
                          </span>
                        ) : (
                          "No"
                        )}
                      </td>
                      <td style={{ maxWidth: "180px", fontSize: "0.82rem" }}>
                        {p.motivo_reversion || p.notas || "—"}
                      </td>
                      <td>
                        <Link to={enlacePagosFila(p.fecha)} className="enlace-accion" style={{ fontSize: "0.82rem" }}>
                          {esSupervision ? "Ver →" : "Validar →"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </EnvoltorioTabla>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabla resumen reutilizable para vista histórica                      */
/* ------------------------------------------------------------------ */
function TablaResumenHistorico({
  pagos,
  nombreArea,
  esSupervision,
  rango,
  soloLectura,
}: {
  pagos: PagoCuota[];
  nombreArea: (id: string) => string;
  esSupervision: boolean;
  rango: { desde: string; hasta: string };
  soloLectura?: boolean;
}) {
  const enlace = `/panel/pagos?pestana=revision&desde=${encodeURIComponent(rango.desde)}&hasta=${encodeURIComponent(rango.hasta)}`;

  return (
    <EnvoltorioTabla>
      <table className="tabla-datos">
        <thead>
          <tr>
            <th>Empleado</th>
            <th>Área</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Monto</th>
            {!soloLectura && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {pagos.map((p) => (
            <tr key={p.id}>
              <td>{p.empleados ? nombreCompletoEmpleado(p.empleados) : "—"}</td>
              <td><ChipArea nombre={nombreArea(p.area_id)} /></td>
              <td>{formatoFecha(p.fecha)}</td>
              <td>
                <span className={claseEstadoPago(p.estado)}>{ETIQUETAS_ESTADO_PAGO[p.estado]}</span>
              </td>
              <td>{formatoMoneda(p.monto_esperado)}</td>
              {!soloLectura && (
                <td>
                  <Link to={enlace} className="enlace-accion">
                    {esSupervision ? "Ver en Pagos →" : "Validar →"}
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </EnvoltorioTabla>
  );
}
