import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";

export default function MiCuenta() {
  const { perfil } = useAuth();
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "exito" | "error" } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cambiarPassword() {
    setMensaje(null);
    if (nuevaPassword.length < 8) {
      setMensaje({ texto: "La contraseña debe tener al menos 8 caracteres.", tipo: "error" });
      return;
    }
    if (nuevaPassword !== confirmar) {
      setMensaje({ texto: "Las contraseñas no coinciden.", tipo: "error" });
      return;
    }
    setEnviando(true);
    // Self-service: opera directo contra auth.users del usuario ya autenticado,
    // no requiere Edge Function ni service_role (ver README, sección 8.6).
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword });
    setEnviando(false);
    if (error) {
      setMensaje({ texto: "No se pudo actualizar la contraseña: " + error.message, tipo: "error" });
      return;
    }
    setNuevaPassword("");
    setConfirmar("");
    setMensaje({ texto: "Contraseña actualizada correctamente.", tipo: "exito" });
  }

  return (
    <div>
      <h2>Mi cuenta</h2>
      <div className="tarjeta" style={{ maxWidth: 420 }}>
        <p>
          <strong>{perfil?.nombre_completo}</strong>
        </p>
        <p className="texto-suave">Rol: {perfil?.rol}</p>

        <h4 style={{ marginTop: "1.2rem" }}>Cambiar contraseña</h4>
        <div className="campo">
          <label>Nueva contraseña</label>
          <input type="password" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} />
        </div>
        <div className="campo">
          <label>Confirmar contraseña</label>
          <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
        </div>
        {mensaje && <p className={mensaje.tipo === "error" ? "mensaje-error" : "texto-suave"}>{mensaje.texto}</p>}
        <button className="boton boton-primario" onClick={cambiarPassword} disabled={enviando}>
          {enviando ? "Guardando…" : "Actualizar contraseña"}
        </button>
      </div>
    </div>
  );
}
