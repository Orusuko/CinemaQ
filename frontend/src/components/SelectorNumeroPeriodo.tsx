import { useEffect, useState } from "react";
import { fechaHoyInputCdmx } from "../lib/formato";
import { catorcenaNumerada, fechaDeNumero, moverPeriodo, semanaNumerada, type TipoPeriodo } from "../lib/periodosPago";

/** Elige la semana o la catorcena por su número (el de la portada del horario), sin buscar la fecha en el calendario. */
export default function SelectorNumeroPeriodo({
  id,
  tipo,
  fecha,
  onCambiarFecha,
}: {
  id: string;
  tipo: TipoPeriodo;
  fecha: string;
  onCambiarFecha: (fecha: string) => void;
}) {
  const sem = semanaNumerada(fecha);
  const cat = catorcenaNumerada(fecha);
  const info = tipo === "semanal" ? sem : cat;
  const [borrador, setBorrador] = useState(String(info.numero));

  useEffect(() => {
    setBorrador(String(info.numero));
  }, [info.numero, info.anio]);

  function confirmar() {
    const n = Number(borrador);
    if (!Number.isInteger(n) || n < 1) {
      setBorrador(String(info.numero));
      return;
    }
    onCambiarFecha(fechaDeNumero(tipo, info.anio, n));
  }

  return (
    <div className="periodo-nav">
      <button
        type="button"
        className="boton boton-secundario boton-chico"
        aria-label="Periodo anterior"
        onClick={() => onCambiarFecha(moverPeriodo(tipo, info.desde, -1))}
      >
        ‹
      </button>
      <div className="campo" style={{ marginBottom: 0 }}>
        <label htmlFor={id}>{tipo === "semanal" ? "Semana" : "Catorcena"}</label>
        <div className="periodo-numero-fila">
          <input
            id={id}
            className="periodo-numero"
            inputMode="numeric"
            aria-label={tipo === "semanal" ? "Número de semana" : "Número de catorcena"}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value.replace(/\D/g, ""))}
            onBlur={confirmar}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <span className="periodo-anio">{info.anio}</span>
        </div>
      </div>
      <button
        type="button"
        className="boton boton-secundario boton-chico"
        aria-label="Periodo siguiente"
        onClick={() => onCambiarFecha(moverPeriodo(tipo, info.desde, 1))}
      >
        ›
      </button>
      <button type="button" className="boton boton-secundario boton-chico" onClick={() => onCambiarFecha(fechaHoyInputCdmx())}>
        Hoy
      </button>
      {tipo === "catorcenal" && (
        <span className="periodo-semanas">
          semanas {cat.semanaDesde} y {cat.semanaHasta}
        </span>
      )}
    </div>
  );
}
