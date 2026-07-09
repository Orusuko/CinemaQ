import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { llamarRpc } from "../lib/rpc";
import { useAuth } from "../context/AuthContext";
import type { EmpleadoPublico, RespuestaRpc } from "../lib/tipos";
import LoginModal from "../components/LoginModal";
import { IconoBillete } from "../components/Iconos";

export default function PaginaPublica() {
  const { sesion, perfil, cargando: cargandoAuth } = useAuth();
  const [mostrarLogin, setMostrarLogin] = useState(false);
  const [empleados, setEmpleados] = useState<EmpleadoPublico[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState<EmpleadoPublico | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: "exito" | "error" } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cargandoLista, setCargandoLista] = useState(true);

  async function cargarDatos() {
    setCargandoLista(true);
    const { data: listaEmpleados } = await supabase.rpc("listar_empleados_publicos");
    setEmpleados((listaEmpleados as EmpleadoPublico[]) ?? []);
    setCargandoLista(false);
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  const resultados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return [];
    return empleados
      .filter((e) => e.id_publico.includes(texto) || e.nombre_publico.toLowerCase().includes(texto))
      .slice(0, 20);
  }, [busqueda, empleados]);

  async function marcarPago() {
    if (!seleccionado) return;
    setEnviando(true);
    setMensaje(null);
    try {
      const respuesta = await llamarRpc<RespuestaRpc>("marcar_pago_empleado", {
        p_empleado_id: seleccionado.id,
      });
      setMensaje({ texto: respuesta.mensaje, tipo: "exito" });
      setSeleccionado(null);
      setBusqueda("");
      cargarDatos();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : "Ocurrió un error.", tipo: "error" });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina-publica">
      <header className="encabezado-publico">
        <strong>Cuotas de Propinas</strong>
        {!cargandoAuth && sesion && perfil ? (
          <Link to="/panel/dashboard" className="boton boton-secundario">
            Ir al panel
          </Link>
        ) : (
          <button className="boton boton-secundario" onClick={() => setMostrarLogin(true)} disabled={cargandoAuth}>
            {cargandoAuth ? "Cargando…" : "Iniciar sesión"}
          </button>
        )}
      </header>

      <main className="contenido-publico">
        <div className="tarjeta-widget">
          <h2>¿Ya pagaste tu cuota de hoy?</h2>
          <p className="texto-suave">
            Busca tu número de empleado o tu nombre y marca tu pago. Un administrador lo validará después.
          </p>

          {!seleccionado ? (
            <div className="campo">
              <label htmlFor="busqueda">Número de empleado o nombre</label>
              <input
                id="busqueda"
                placeholder="Ej. 1234 o Juan Pérez"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                autoComplete="off"
              />
              {resultados.length > 0 && (
                <ul className="lista-resultados">
                  {resultados.map((r) => (
                    <li
                      key={r.id}
                      className="opcion-resultado"
                      onClick={() => {
                        setSeleccionado(r);
                        setBusqueda("");
                      }}
                    >
                      <strong>{r.id_publico}</strong> · {r.nombre_publico}{" "}
                      <span className="texto-suave">({r.area_nombre})</span>
                    </li>
                  ))}
                </ul>
              )}
              {busqueda.trim() && resultados.length === 0 && !cargandoLista && (
                <p className="texto-suave">No se encontraron coincidencias.</p>
              )}
            </div>
          ) : (
            <div className="chip-seleccion">
              <span>
                <strong>{seleccionado.id_publico}</strong> · {seleccionado.nombre_publico} ({seleccionado.area_nombre})
              </span>
              <button className="boton-texto" onClick={() => setSeleccionado(null)}>
                Cambiar
              </button>
            </div>
          )}

          <button
            className="boton boton-acento"
            style={{ width: "100%", marginTop: "1.2rem" }}
            disabled={!seleccionado || enviando}
            onClick={marcarPago}
          >
            <IconoBillete width={18} height={18} />
            {enviando ? "Enviando…" : "Ya pagué"}
          </button>

          {mensaje && (
            <p className={mensaje.tipo === "error" ? "mensaje-error" : "texto-suave"} style={{ marginTop: "0.8rem" }}>
              {mensaje.texto}
            </p>
          )}
        </div>
      </main>

      <footer className="pie-publico">Sistema de Seguimiento de Cuotas de Propinas — hora de Ciudad de México</footer>

      {mostrarLogin && <LoginModal onCerrar={() => setMostrarLogin(false)} />}
    </div>
  );
}
