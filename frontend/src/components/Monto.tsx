import { formatoMoneda } from "../lib/formato";

export type TipoMonto = "validado" | "revision" | "falta";

/** Monto con color por significado (verde validado, azul en revisión, rojo falta); en cero se atenúa. */
export default function Monto({ valor, tipo }: { valor: number; tipo: TipoMonto }) {
  return <span className={`num-tabular ${valor > 0 ? `monto-${tipo}` : "monto-cero"}`}>{formatoMoneda(valor)}</span>;
}
