import Monto from "./Monto";

interface Props {
  validado: number;
  enRevision: number;
  falta: number;
}

/** Barra proporcional + leyenda: se entiende el avance de cobro sin leer tablas. */
export default function ResumenEstados({ validado, enRevision, falta }: Props) {
  const total = validado + enRevision + falta;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return (
    <div className="resumen-estados">
      <div
        className="resumen-estados__barra"
        role="img"
        aria-label={`Validado ${Math.round(pct(validado))}%, en revisión ${Math.round(pct(enRevision))}%, falta ${Math.round(pct(falta))}%`}
      >
        <span className="resumen-estados__seg resumen-estados__seg--validado" style={{ width: `${pct(validado)}%` }} />
        <span className="resumen-estados__seg resumen-estados__seg--revision" style={{ width: `${pct(enRevision)}%` }} />
        <span className="resumen-estados__seg resumen-estados__seg--falta" style={{ width: `${pct(falta)}%` }} />
      </div>
      <div className="resumen-estados__leyenda">
        <span className="resumen-estados__item">
          <i className="resumen-estados__punto resumen-estados__seg--validado" />
          Validado <Monto valor={validado} tipo="validado" />
        </span>
        <span className="resumen-estados__item">
          <i className="resumen-estados__punto resumen-estados__seg--revision" />
          En revisión <Monto valor={enRevision} tipo="revision" />
        </span>
        <span className="resumen-estados__item">
          <i className="resumen-estados__punto resumen-estados__seg--falta" />
          Falta <Monto valor={falta} tipo="falta" />
        </span>
      </div>
    </div>
  );
}
