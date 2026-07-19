import { useEffect, useRef, useId, type ReactNode } from "react";

interface ModalProps {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  ancho?: boolean;
  extraAncho?: boolean;
}

export default function Modal({ titulo, onCerrar, children, ancho, extraAncho }: ModalProps) {
  const tituloId = useId();
  const refModal = useRef<HTMLDivElement>(null);
  const refFocoPrevio = useRef<Element | null>(null);

  const clases = ["caja-modal", ancho ? "ancho" : "", extraAncho ? "extra-ancho" : ""]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    refFocoPrevio.current = document.activeElement;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = requestAnimationFrame(() => {
      refModal.current?.focus();
    });

    return () => {
      cancelAnimationFrame(timer);
      document.body.style.overflow = overflowPrevio;
      if (refFocoPrevio.current instanceof HTMLElement) {
        refFocoPrevio.current.focus();
      }
    };
  }, []);

  function manejarTecla(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCerrar();
      return;
    }

    // Focus trap: ciclar Tab/Shift+Tab entre focusables internos
    if (e.key === "Tab" && refModal.current) {
      const focusables = refModal.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;

      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === primero || document.activeElement === refModal.current) {
          e.preventDefault();
          ultimo.focus();
        }
      } else {
        if (document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    }
  }

  return (
    <div className="fondo-modal" onClick={onCerrar}>
      <div
        ref={refModal}
        className={clases}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={manejarTecla}
      >
        <div className="encabezado-modal">
          <h3 id={tituloId}>{titulo}</h3>
          <button className="cerrar-modal" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
