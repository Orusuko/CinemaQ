import { useLayoutEffect, useRef, type ReactNode } from "react";

function aplicarEtiquetasMovil(contenedor: HTMLElement) {
  contenedor.querySelectorAll("table.tabla-datos").forEach((table) => {
    const encabezados = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");

    table.querySelectorAll("tbody tr").forEach((fila) => {
      const celdas = Array.from(fila.querySelectorAll(":scope > td"));
      if (celdas.length === 1 && celdas[0].hasAttribute("colspan")) {
        celdas[0].removeAttribute("data-label");
        return;
      }

      celdas.forEach((celda, indice) => {
        if (celda.classList.contains("sin-etiqueta-movil")) {
          celda.removeAttribute("data-label");
          return;
        }

        let etiqueta = encabezados[indice] ?? "";
        if (!etiqueta && celda.classList.contains("fila-acciones")) {
          etiqueta = "Acciones";
        }
        if (!etiqueta && celda.querySelector('input[type="checkbox"]')) {
          etiqueta = "Seleccionar";
        }

        if (etiqueta) {
          celda.setAttribute("data-label", etiqueta);
        } else {
          celda.removeAttribute("data-label");
        }
      });
    });
  });
}

export default function EnvoltorioTabla({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (ref.current) aplicarEtiquetasMovil(ref.current);
  });

  const clases = ["envoltorio-tabla", "envoltorio-tabla--tarjetas", className].filter(Boolean).join(" ");

  return (
    <div ref={ref} className={clases}>
      {children}
    </div>
  );
}
