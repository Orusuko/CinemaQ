import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase, supabaseConfigurado } from "../lib/supabaseClient";
import { mensajeErrorConsulta } from "../lib/consulta";
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
    if (!supabaseConfigurado) {
      setEmpleados([]);
      setMensaje({
        texto: "La aplicación no está configurada. Contacta al administrador del sistema.",
        tipo: "error",
      });
      setCargandoLista(false);
      return;
    }
    const { data: listaEmpleados, error } = await supabase.rpc("listar_empleados_publicos");
    if (error) {
      setEmpleados([]);
      setMensaje({ texto: mensajeErrorConsulta(error, "No se pudo cargar la lista de empleados."), tipo: "error" });
    } else {
      setEmpleados((listaEmpleados as EmpleadoPublico[]) ?? []);
    }
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

  const [indiceResaltado, setIndiceResaltado] = useState(-1);

  // Resetear índice cuando cambia la búsqueda o los resultados
  useEffect(() => {
    setIndiceResaltado(-1);
  }, [busqueda]);

  function manejarTeclaAutocompletado(e: React.KeyboardEvent) {
    if (resultados.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIndiceResaltado((prev) => (prev + 1) % resultados.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setIndiceResaltado((prev) => (prev - 1 + resultados.length) % resultados.length);
        break;
      case "Enter":
        e.preventDefault();
        {
          const indice = indiceResaltado >= 0 ? indiceResaltado : 0;
          if (indice < resultados.length) {
            setSeleccionado(resultados[indice]);
            setBusqueda("");
            setIndiceResaltado(-1);
          }
        }
        break;
      case "Escape":
        e.preventDefault();
        setBusqueda("");
        break;
    }
  }

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
                onKeyDown={manejarTeclaAutocompletado}
                autoComplete="off"
                role="combobox"
                aria-expanded={resultados.length > 0}
                aria-controls="lista-autocompletado"
                aria-activedescendant={indiceResaltado >= 0 ? `opcion-${indiceResaltado}` : undefined}
                aria-autocomplete="list"
                disabled={cargandoLista}
                aria-busy={cargandoLista}
              />
              {cargandoLista && (
                <p className="texto-suave" role="status">Cargando empleados…</p>
              )}
              {resultados.length > 0 && (
                <ul className="lista-resultados" role="listbox" id="lista-autocompletado">
                  {resultados.map((r, i) => (
                    <li
                      key={r.id}
                      id={`opcion-${i}`}
                      role="option"
                      aria-selected={i === indiceResaltado}
                      className={`opcion-resultado${i === indiceResaltado ? " resaltado" : ""}`}
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
          {!seleccionado && (
            <p className="texto-suave" style={{ marginTop: "0.55rem", textAlign: "center", fontSize: "0.88rem" }}>
              Selecciona tu nombre para continuar
            </p>
          )}

          {mensaje && (
            <p
              className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-exito-publico"}
              style={{ marginTop: "0.8rem" }}
              role="status"
              aria-live="polite"
            >
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
