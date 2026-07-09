import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "./AuthContext";
import type { Area } from "../lib/tipos";

interface AreaContextValor {
  areas: Area[];
  areaSeleccionada: string; // id de área, o 'ambas'
  setAreaSeleccionada: (v: string) => void;
  puedeElegirArea: boolean;
  areaIdsFiltro: string[] | null; // null = todas las áreas visibles para el rol
  cargando: boolean;
}

const AreaContext = createContext<AreaContextValor | undefined>(undefined);

export function AreaProvider({ children }: { children: ReactNode }) {
  const { perfil } = useAuth();
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaSeleccionada, setAreaSeleccionada] = useState<string>("ambas");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    async function cargarAreas() {
      setCargando(true);
      const { data, error } = await supabase.from("areas").select("*").order("nombre");
      if (cancelado) return;
      setAreas(error ? [] : ((data as Area[]) ?? []));
      setCargando(false);
    }
    cargarAreas();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (perfil?.rol === "admin_area" && perfil.area_id) {
      setAreaSeleccionada(perfil.area_id);
    }
  }, [perfil]);

  const puedeElegirArea = perfil?.rol === "administrador_general" || perfil?.rol === "supervision";

  const areaIdsFiltro = useMemo(() => {
    if (perfil?.rol === "admin_area") return perfil.area_id ? [perfil.area_id] : [];
    if (areaSeleccionada === "ambas") return null;
    return [areaSeleccionada];
  }, [perfil, areaSeleccionada]);

  return (
    <AreaContext.Provider value={{ areas, areaSeleccionada, setAreaSeleccionada, puedeElegirArea, areaIdsFiltro, cargando }}>
      {children}
    </AreaContext.Provider>
  );
}

export function useArea(): AreaContextValor {
  const contexto = useContext(AreaContext);
  if (!contexto) throw new Error("useArea debe usarse dentro de AreaProvider");
  return contexto;
}
