import type { ReactNode } from "react";

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
 * Estilo underline (no botones sólidos) para consistencia con UX moderna.
 */
export default function Tabs({ pestanas, activa, onChange, children }: TabsProps) {
  return (
    <div>
      <div className="barra-pestanas" role="tablist" aria-label="Pestañas">
        {pestanas.map((p) => {
          const seleccionada = p.id === activa;
          return (
            <button
              key={p.id}
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
