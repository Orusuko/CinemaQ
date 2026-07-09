import type { ReactNode } from "react";

interface ModalProps {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  ancho?: boolean;
}

export default function Modal({ titulo, onCerrar, children, ancho }: ModalProps) {
  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <div className={`caja-modal ${ancho ? "ancho" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="encabezado-modal">
          <h3>{titulo}</h3>
          <button className="cerrar-modal" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
