import { useEffect, useState } from "react";

/** Estado que sobrevive a navegar entre secciones o recargar la pestaña (sessionStorage). */
export function usePersistente<T>(clave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() => {
    try {
      const guardado = sessionStorage.getItem(clave);
      return guardado === null ? inicial : (JSON.parse(guardado) as T);
    } catch {
      return inicial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* modo privado o cuota llena: se pierde solo la persistencia */
    }
  }, [clave, valor]);
  return [valor, setValor] as const;
}
