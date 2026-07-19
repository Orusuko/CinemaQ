import { useState } from "react";
import { formatoMoneda } from "../lib/formato";
import type { TotalesDia } from "../lib/balanceAgregados";

function fechaCorta(fecha: string) {
  const d = new Date(`${fecha}T12:00:00`);
  return d.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  });
}

function montoCorto(v: number) {
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `$${v}`;
}

export default function GraficaEvolucionDiaria({ datos }: { datos: TotalesDia[] }) {
  const [puntoActivo, setPuntoActivo] = useState<number | null>(null);

  if (datos.length === 0) {
    return (
      <div className="tarjeta grafica-evolucion grafica-evolucion--vacio">
        <div className="grafica-evolucion__titulo">Evolución diaria</div>
        <p className="texto-suave" style={{ margin: 0 }}>
          Sin datos en este periodo.
        </p>
      </div>
    );
  }

  const W = 700;
  const H = 220;
  const PAD_IZQ = 55;
  const PAD_DER = 15;
  const PAD_ARR = 25;
  const PAD_ABA = 35;
  const anchoUtil = W - PAD_IZQ - PAD_DER;
  const altoUtil = H - PAD_ARR - PAD_ABA;

  const maxVal = Math.max(...datos.map((d) => Math.max(d.recaudado, d.esperado)), 1);
  const paso = maxVal <= 500 ? 100 : maxVal <= 2000 ? 500 : maxVal <= 10000 ? 2000 : 5000;
  const escalaY = Math.ceil(maxVal / paso) * paso;

  const puntos = datos.map((d, i) => {
    const x =
      datos.length === 1
        ? PAD_IZQ + anchoUtil / 2
        : PAD_IZQ + (i / (datos.length - 1)) * anchoUtil;
    const yRec = PAD_ARR + altoUtil - (d.recaudado / escalaY) * altoUtil;
    const yEsp = PAD_ARR + altoUtil - (d.esperado / escalaY) * altoUtil;
    return { x, yRec, yEsp, ...d };
  });

  const lineaRecaudado = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.yRec}`).join(" ");
  const areaRecaudado = `${lineaRecaudado} L${puntos[puntos.length - 1].x},${PAD_ARR + altoUtil} L${puntos[0].x},${PAD_ARR + altoUtil} Z`;
  const lineaEsperado = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.yEsp}`).join(" ");

  const numGuias = 4;
  const guias = Array.from({ length: numGuias + 1 }, (_, i) => {
    const valor = (escalaY / numGuias) * i;
    const y = PAD_ARR + altoUtil - (valor / escalaY) * altoUtil;
    return { valor, y };
  });

  const activo = puntoActivo !== null ? puntos[puntoActivo] : null;

  return (
    <div className="tarjeta grafica-evolucion">
      <div className="grafica-evolucion__cabecera">
        <div className="grafica-evolucion__titulo">Evolución diaria</div>
        <div className="grafica-evolucion__leyenda">
          <span className="grafica-evolucion__leyenda-item">
            <span className="grafica-evolucion__leyenda-linea grafica-evolucion__leyenda-linea--primario" />
            Validado
          </span>
          <span className="grafica-evolucion__leyenda-item">
            <span className="grafica-evolucion__leyenda-linea grafica-evolucion__leyenda-linea--suave" />
            Esperado
          </span>
        </div>
      </div>

      {activo && (
        <div className="grafica-evolucion__detalle-activo" aria-live="polite">
          <strong>{fechaCorta(activo.fecha)}</strong>
          <span>Validado: {formatoMoneda(activo.recaudado)}</span>
          <span>Esperado: {formatoMoneda(activo.esperado)}</span>
        </div>
      )}

      <svg
        className="grafica-evolucion__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Gráfica de evolución diaria del periodo"
      >
        {guias.map((g) => (
          <g key={g.valor}>
            <line
              className="grafica-evolucion__linea-guia"
              x1={PAD_IZQ}
              y1={g.y}
              x2={W - PAD_DER}
              y2={g.y}
            />
            <text className="grafica-evolucion__etiqueta-eje" x={PAD_IZQ - 8} y={g.y + 4} textAnchor="end">
              {montoCorto(g.valor)}
            </text>
          </g>
        ))}

        <path className="grafica-evolucion__area" d={areaRecaudado} />
        <path className="grafica-evolucion__linea grafica-evolucion__linea--suave" d={lineaEsperado} />
        <path className="grafica-evolucion__linea" d={lineaRecaudado} />

        {puntos.map((p, i) => (
          <g key={p.fecha}>
            <circle
              className={`grafica-evolucion__punto ${puntoActivo === i ? "grafica-evolucion__punto--activo" : ""}`}
              cx={p.x}
              cy={p.yRec}
              r={puntoActivo === i ? 6 : 4}
              onMouseEnter={() => setPuntoActivo(i)}
              onMouseLeave={() => setPuntoActivo(null)}
              onFocus={() => setPuntoActivo(i)}
              onBlur={() => setPuntoActivo(null)}
              tabIndex={0}
              role="button"
              aria-label={`${fechaCorta(p.fecha)}: validado ${formatoMoneda(p.recaudado)}`}
            />
          </g>
        ))}

        {puntos.map((p, i) => {
          const pasoEtiqueta = Math.max(1, Math.ceil(puntos.length / 8));
          if (i % pasoEtiqueta !== 0 && i !== puntos.length - 1) return null;
          return (
            <text
              key={`eje-${p.fecha}`}
              className="grafica-evolucion__etiqueta-eje"
              x={p.x}
              y={H - 8}
              textAnchor="middle"
            >
              {fechaCorta(p.fecha)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
