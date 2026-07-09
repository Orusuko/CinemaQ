import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { usuarioAEmailInterno } from "../lib/authUsuario";
import { supabase, supabaseConfigurado } from "../lib/supabaseClient";
import type { Perfil } from "../lib/tipos";

interface AuthContextValor {
  sesion: Session | null;
  perfil: Perfil | null;
  cargando: boolean;
  iniciarSesion: (usuario: string, contrasena: string) => Promise<{ error: string | null }>;
  cerrarSesion: () => Promise<void>;
  recargarPerfil: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValor | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  async function cargarPerfil(userId: string): Promise<Perfil | null> {
    const { data } = await supabase.from("perfiles").select("*").eq("id", userId).single();
    const perfilCargado = (data as Perfil) ?? null;
    setPerfil(perfilCargado);
    return perfilCargado;
  }

  async function sincronizarSesion(session: Session | null) {
    setSesion(session);
    if (session?.user?.id) {
      await cargarPerfil(session.user.id);
    } else {
      setPerfil(null);
    }
  }

  useEffect(() => {
    let montado = true;

    // Un solo listener: evita carrera entre getSession() y onAuthStateChange.
    // setTimeout evita deadlock documentado de Supabase al llamar la API dentro del callback.
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      if (!montado) return;
      setCargando(true);
      setTimeout(() => {
        if (!montado) return;
        void sincronizarSesion(nuevaSesion).finally(() => {
          if (montado) setCargando(false);
        });
      }, 0);
    });

    return () => {
      montado = false;
      suscripcion.subscription.unsubscribe();
    };
  }, []);

  async function iniciarSesion(usuario: string, contrasena: string) {
    if (!supabaseConfigurado) {
      return {
        error:
          "Falta configurar la anon key de Supabase en frontend/.env (Dashboard → Settings → API → anon public). Reinicia npm run dev después de guardar.",
      };
    }

    const emailInterno = usuarioAEmailInterno(usuario);
    setCargando(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email: emailInterno, password: contrasena });

    if (error) {
      setCargando(false);
      const msg = error.message.toLowerCase();
      if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
        return {
          error:
            "Usuario o contraseña incorrectos. Si solo insertaste en perfiles, ejecuta supabase/seed/crear_usuario_orusuko.sql completo (crea auth.users + identities).",
        };
      }
      if (msg.includes("invalid api key") || msg.includes("apikey")) {
        return { error: "La anon key en frontend/.env no es válida. Cópiala de Supabase → Settings → API." };
      }
      if (msg.includes("email not confirmed")) {
        return { error: "El usuario existe pero el correo interno no está confirmado. Vuelve a ejecutar crear_usuario_orusuko.sql." };
      }
      return { error: `No se pudo iniciar sesión: ${error.message}` };
    }

    await sincronizarSesion(data.session);
    setCargando(false);

    if (!data.session) {
      return { error: "No se pudo establecer la sesión. Intenta de nuevo." };
    }

    return { error: null };
  }

  async function cerrarSesion() {
    setCargando(true);
    await supabase.auth.signOut();
    await sincronizarSesion(null);
    setCargando(false);
  }

  async function recargarPerfil() {
    if (sesion?.user?.id) {
      await cargarPerfil(sesion.user.id);
    }
  }

  return (
    <AuthContext.Provider value={{ sesion, perfil, cargando, iniciarSesion, cerrarSesion, recargarPerfil }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return contexto;
}
