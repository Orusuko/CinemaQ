import type { ReactNode } from "react";

interface EstadoVacioProps {
  icono: ReactNode;
  mensaje: string;
  accion?: ReactNode;
}

export default function EstadoVacio({ icono, mensaje, accion }: EstadoVacioProps) {
  return (
    <div className="estado-vacio-ilustrado">
      <span className="icono-vacio">{icono}</span>
      <p>{mensaje}</p>
      {accion}
    </div>
  );
}
