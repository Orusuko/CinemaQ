import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type TipoToast = "exito" | "error" | "info";

export interface ToastAccion {
  etiqueta: string;
  al_hacer_click: () => void;
}

export interface ToastItem {
  id: number;
  mensaje: string;
  tipo: TipoToast;
  accion?: ToastAccion;
}

interface ToastContextValor {
  toasts: ToastItem[];
  mostrarToast: (mensaje: string, tipo?: TipoToast, accion?: ToastAccion, duracionMs?: number) => void;
}

const ToastContext = createContext<ToastContextValor | undefined>(undefined);

let contador = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const mostrarToast = useCallback(
    (mensaje: string, tipo: TipoToast = "info", accion?: ToastAccion, duracionMs = 5000) => {
      const id = ++contador;
      setToasts((prev) => [...prev, { id, mensaje, tipo, accion }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duracionMs);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toasts, mostrarToast }}>
      {children}
      <div className="contenedor-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo}`}>
            <span>{t.mensaje}</span>
            {t.accion && (
              <button
                className="toast-accion"
                onClick={() => {
                  t.accion?.al_hacer_click();
                  setToasts((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                {t.accion.etiqueta}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValor {
  const contexto = useContext(ToastContext);
  if (!contexto) throw new Error("useToast debe usarse dentro de ToastProvider");
  return contexto;
}
