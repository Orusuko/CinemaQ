import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";
import { IconoCandado } from "./Iconos";

export default function LoginModal({ onCerrar }: { onCerrar: () => void }) {
  const { iniciarSesion } = useAuth();
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarEnvio(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const { error: errorLogin } = await iniciarSesion(usuario, contrasena);
    if (errorLogin) {
      setEnviando(false);
      setError(errorLogin);
      return;
    }
    onCerrar();
    navegar("/panel/dashboard");
  }

  return (
    <Modal titulo="Iniciar sesión" onCerrar={onCerrar}>
      <form onSubmit={manejarEnvio} className="tarjeta-login">
        <div className="campo">
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            type="text"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="contrasena">Contraseña</label>
          <input
            id="contrasena"
            type="password"
            required
            autoComplete="current-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </div>
        {error && <p className="mensaje-error">{error}</p>}
        <button type="submit" className="boton boton-primario" style={{ width: "100%" }} disabled={enviando}>
          <IconoCandado width={16} height={16} />
          {enviando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </Modal>
  );
}
