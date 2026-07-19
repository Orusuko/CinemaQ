/** Badge de variación porcentual vs periodo anterior (ej. ayer). */
export default function IndicadorTendencia({
  actual,
  anterior,
  etiqueta,
}: {
  actual: number;
  anterior: number;
  etiqueta: string;
}) {
  if (anterior === 0 && actual === 0) {
    return <span className="tendencia tendencia--neutra">— {etiqueta}</span>;
  }
  if (anterior === 0) {
    return <span className="tendencia tendencia--positiva">↑ nuevo {etiqueta}</span>;
  }
  const pct = ((actual - anterior) / anterior) * 100;
  const signo = pct >= 0 ? "↑" : "↓";
  const clase =
    pct > 0 ? "tendencia--positiva" : pct < 0 ? "tendencia--negativa" : "tendencia--neutra";
  return (
    <span className={`tendencia ${clase}`}>
      {signo} {Math.abs(pct).toFixed(1).replace(".", ",")}% {etiqueta}
    </span>
  );
}
