import { useRef, type ReactNode } from "react";

export interface Pestana {
  id: string;
  etiqueta: string;
  contador?: number;
}

interface TabsProps {
  pestanas: Pestana[];
  activa: string;
  onChange: (id: string) => void;
  children: ReactNode;
}

/**
 * Componente de pestañas reutilizable con accesibilidad ARIA completa.
 * Navegación con flechas ←/→ (wrap circular). Estilo underline.
 */
export default function Tabs({ pestanas, activa, onChange, children }: TabsProps) {
  const refsBoton = useRef<(HTMLButtonElement | null)[]>([]);

  function manejarTeclaPestana(e: React.KeyboardEvent) {
    const indiceActual = pestanas.findIndex((p) => p.id === activa);
    let nuevoIndice = -1;

    if (e.key === "ArrowRight") {
      nuevoIndice = (indiceActual + 1) % pestanas.length;
    } else if (e.key === "ArrowLeft") {
      nuevoIndice = (indiceActual - 1 + pestanas.length) % pestanas.length;
    } else if (e.key === "Home") {
      nuevoIndice = 0;
    } else if (e.key === "End") {
      nuevoIndice = pestanas.length - 1;
    }

    if (nuevoIndice >= 0) {
      e.preventDefault();
      onChange(pestanas[nuevoIndice].id);
      refsBoton.current[nuevoIndice]?.focus();
    }
  }

  return (
    <div>
      <div className="barra-pestanas" role="tablist" aria-label="Pestañas" onKeyDown={manejarTeclaPestana}>
        {pestanas.map((p, i) => {
          const seleccionada = p.id === activa;
          return (
            <button
              key={p.id}
              ref={(el) => { refsBoton.current[i] = el; }}
              role="tab"
              id={`tab-${p.id}`}
              aria-selected={seleccionada}
              aria-controls={`panel-${p.id}`}
              tabIndex={seleccionada ? 0 : -1}
              className={`pestana${seleccionada ? " pestana--activa" : ""}`}
              onClick={() => onChange(p.id)}
            >
              {p.etiqueta}
              {p.contador !== undefined && (
                <span className="pestana__contador">{p.contador}</span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`panel-${activa}`}
        aria-labelledby={`tab-${activa}`}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
