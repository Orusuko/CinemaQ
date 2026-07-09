import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useArea } from "../../context/AreaContext";
import { useToast } from "../../context/ToastContext";
import { llamarEdgeFunction } from "../../lib/edgeFunctions";
import Modal from "../../components/Modal";
import EnvoltorioTabla from "../../components/EnvoltorioTabla";
import ChipArea from "../../components/ChipArea";
import type { Perfil, RolPerfil } from "../../lib/tipos";

const ETIQUETAS_ROL: Record<RolPerfil, string> = {
  admin_area: "Administrador de área",
  administrador_general: "Administrador general",
  supervision: "Supervisión",
};

export default function Usuarios() {
  const { areas } = useArea();
  const { mostrarToast } = useToast();
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [editando, setEditando] = useState<Perfil | null>(null);

  async function cargar() {
    setCargando(true);
    const { data } = await supabase.from("perfiles").select("*").order("nombre_completo");
    setUsuarios((data as Perfil[]) ?? []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  function nombreArea(id: string | null) {
    if (!id) return "—";
    return areas.find((a) => a.id === id)?.nombre ?? "—";
  }

  async function alternarActivo(usuario: Perfil) {
    try {
      await llamarEdgeFunction("deactivate-admin-user", { id: usuario.id, activo: !usuario.activo });
      mostrarToast(usuario.activo ? "Usuario desactivado." : "Usuario reactivado.", "exito");
      cargar();
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "Ocurrió un error.", "error");
    }
  }

  return (
    <div>
      <div className="barra-herramientas">
        <h2>Usuarios administrativos</h2>
        <button className="boton boton-primario" onClick={() => setMostrarCrear(true)}>
          Nuevo usuario
        </button>
      </div>

      <EnvoltorioTabla>
        <table className="tabla-datos">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Área</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td><code>{u.nombre_usuario}</code></td>
                <td>{u.nombre_completo}</td>
                <td>{ETIQUETAS_ROL[u.rol]}</td>
                <td><ChipArea nombre={nombreArea(u.area_id)} /></td>
                <td>
                  <span className={u.activo ? "etiqueta etiqueta-exito" : "etiqueta etiqueta-neutral"}>
                    {u.activo ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td className="fila-acciones">
                  <button className="boton boton-chico boton-secundario" onClick={() => setEditando(u)}>
                    Editar
                  </button>
                  <button className="boton boton-chico boton-peligro" onClick={() => alternarActivo(u)}>
                    {u.activo ? "Desactivar" : "Reactivar"}
                  </button>
                </td>
              </tr>
            ))}
            {!cargando && usuarios.length === 0 && (
              <tr>
                <td colSpan={6} className="estado-vacio">
                  No hay usuarios registrados todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </EnvoltorioTabla>

      {mostrarCrear && (
        <ModalUsuario
          areas={areas}
          onCerrar={() => setMostrarCrear(false)}
          onListo={() => {
            setMostrarCrear(false);
            cargar();
          }}
        />
      )}

      {editando && (
        <ModalUsuario
          usuario={editando}
          areas={areas}
          onCerrar={() => setEditando(null)}
          onListo={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalUsuario({
  usuario,
  areas,
  onCerrar,
  onListo,
}: {
  usuario?: Perfil;
  areas: { id: string; nombre: string }[];
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [nombreUsuario, setNombreUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState(usuario?.nombre_completo ?? "");
  const [rol, setRol] = useState<RolPerfil>(usuario?.rol ?? "admin_area");
  const [areaId, setAreaId] = useState(usuario?.area_id ?? areas[0]?.id ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!usuario && (!nombreUsuario.trim() || !password)) {
      setError("Usuario y contraseña temporal son obligatorios.");
      return;
    }
    if (!usuario && !/^[a-zA-Z0-9_]{2,32}$/.test(nombreUsuario.trim())) {
      setError("El usuario solo puede tener letras, números y guión bajo (2–32 caracteres).");
      return;
    }
    setEnviando(true);
    try {
      if (usuario) {
        await llamarEdgeFunction("update-admin-user", {
          id: usuario.id,
          nombre_completo: nombre.trim(),
          rol,
          area_id: rol === "admin_area" ? areaId : null,
          ...(password ? { nueva_password: password } : {}),
        });
      } else {
        await llamarEdgeFunction("create-admin-user", {
          nombre_usuario: nombreUsuario.trim(),
          password,
          nombre_completo: nombre.trim(),
          rol,
          area_id: rol === "admin_area" ? areaId : null,
        });
      }
      onListo();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ocurrió un error.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={usuario ? "Editar usuario" : "Nuevo usuario administrativo"} onCerrar={onCerrar}>
      {!usuario && (
        <div className="campo">
          <label>Usuario (para iniciar sesión)</label>
          <input
            value={nombreUsuario}
            onChange={(e) => setNombreUsuario(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="ej. andre"
          />
        </div>
      )}
      <div className="campo">
        <label>{usuario ? "Nueva contraseña (opcional)" : "Contraseña temporal"}</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="campo">
        <label>Nombre completo</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div className="campo">
        <label>Rol</label>
        <select value={rol} onChange={(e) => setRol(e.target.value as RolPerfil)}>
          <option value="admin_area">Administrador de área</option>
          <option value="administrador_general">Administrador general</option>
          <option value="supervision">Supervisión</option>
        </select>
      </div>
      {rol === "admin_area" && (
        <div className="campo">
          <label>Área asignada</label>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="mensaje-error">{error}</p>}
      <div className="fila-acciones" style={{ justifyContent: "flex-end" }}>
        <button className="boton boton-secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </button>
        <button className="boton boton-primario" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
