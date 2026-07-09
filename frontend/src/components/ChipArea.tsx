import { claseChipArea } from "../lib/formato";

export default function ChipArea({ nombre }: { nombre: string }) {
  if (!nombre || nombre === "—") return <span>—</span>;
  return <span className={claseChipArea(nombre)}>{nombre}</span>;
}
