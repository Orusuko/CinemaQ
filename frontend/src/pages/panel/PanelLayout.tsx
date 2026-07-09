import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AreaProvider, useArea } from "../../context/AreaContext";
import { supabase } from "../../lib/supabaseClient";
import {
  IconoGrafica,
  IconoCalendario,
  IconoLista,
  IconoBillete,
  IconoUsuarios,
  IconoIntercambio,
  IconoCampana,
  IconoEscudo,
  IconoEngranaje,
  IconoSalir,
  IconoUsuario,
  IconoArchivo,
  IconoMoneda,
  IconoMenu,
  IconoCerrar,
} from "../../components/Iconos";

const ETIQUETAS_ROL: Record<string, string> = {
  admin_area: "Administrador de área",
  administrador_general: "Administrador general",
  supervision: "Supervisión",
};

function SelectorArea() {
  const { areas, areaSeleccionada, setAreaSeleccionada, puedeElegirArea } = useArea();
  if (!puedeElegirArea) return null;
  return (
    <div className="selector-area">
      <label className="selector-area__etiqueta" htmlFor="selector-area-panel">
        Área
      </label>
      <select
        id="selector-area-panel"
        className="selector-area__control"
        value={areaSeleccionada}
        onChange={(e) => setAreaSeleccionada(e.target.value)}
        aria-label="Área"
      >
        <option value="ambas">Ambas áreas</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

function GrupoNav({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="nav-grupo" role="group" aria-label={titulo}>
      <div className="nav-grupo__titulo">{titulo}</div>
      {children}
    </div>
  );
}

function ContenidoPanel() {
  const { perfil, cerrarSesion } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [noLeidas, setNoLeidas] = useState(0);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    setMenuAbierto(false);
  }, [ubicacion.pathname]);

  useEffect(() => {
    if (!menuAbierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [menuAbierto]);

  useEffect(() => {
    let activo = true;
    async function cargarConteo() {
      if (!perfil) return;
      const { count } = await supabase
        .from("notificaciones")
        .select("id", { count: "exact", head: true })
        .eq("destinatario_id", perfil.id)
        .eq("leida", false);
      if (activo) setNoLeidas(count ?? 0);
    }
    cargarConteo();
    const intervalo = setInterval(cargarConteo, 60000);
    return () => {
      activo = false;
      clearInterval(intervalo);
    };
  }, [perfil]);

  const esAdminGeneral = perfil?.rol === "administrador_general";
  const esSupervision = perfil?.rol === "supervision";

  async function salir() {
    setMenuAbierto(false);
    await cerrarSesion();
    navegar("/");
  }

  function cerrarMenu() {
    setMenuAbierto(false);
  }

  function claseNav({ isActive }: { isActive: boolean }) {
    return `enlace-nav ${isActive ? "activo" : ""}`;
  }

  return (
    <div className="layout-panel">
      {menuAbierto && (
        <button type="button" className="overlay-nav-movil" aria-label="Cerrar menú" onClick={cerrarMenu} />
      )}

      <header className="cabecera-movil">
        <button
          type="button"
          className="boton-menu-movil"
          aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menuAbierto}
          onClick={() => setMenuAbierto((v) => !v)}
        >
          {menuAbierto ? <IconoCerrar /> : <IconoMenu />}
        </button>
        <span className="cabecera-movil__marca">Cuotas Propinas</span>
        <NavLink to="/panel/notificaciones" className="cabecera-movil__campana" aria-label="Notificaciones">
          <IconoCampana />
          {noLeidas > 0 && <span className="badge-contador badge-contador--movil">{noLeidas}</span>}
        </NavLink>
      </header>

      <aside className={`barra-lateral ${menuAbierto ? "abierta" : ""}`}>
        <div className="barra-lateral__encabezado-movil">
          <span className="marca">Cuotas Propinas</span>
          <button type="button" className="boton-cerrar-menu" aria-label="Cerrar menú" onClick={cerrarMenu}>
            <IconoCerrar />
          </button>
        </div>
        <div className="marca marca--escritorio">Cuotas Propinas</div>
        <nav aria-label="Menú principal">
          <GrupoNav titulo="Operación diaria">
            <NavLink to="/panel/dashboard" className={claseNav} onClick={cerrarMenu}>
              <IconoGrafica /> Balance
            </NavLink>
            <NavLink to="/panel/horario" className={claseNav} onClick={cerrarMenu}>
              <IconoCalendario /> Horario
            </NavLink>
            <NavLink to="/panel/asistencia" className={claseNav} onClick={cerrarMenu}>
              <IconoLista /> Asistencia
            </NavLink>
            <NavLink to="/panel/pagos" className={claseNav} onClick={cerrarMenu}>
              <IconoBillete /> Pagos
            </NavLink>
          </GrupoNav>

          <GrupoNav titulo="Personal">
            <NavLink to="/panel/empleados" className={claseNav} onClick={cerrarMenu}>
              <IconoUsuarios /> Empleados
            </NavLink>
            <NavLink to="/panel/solicitudes" className={claseNav} onClick={cerrarMenu}>
              <IconoIntercambio /> Solicitudes de área
            </NavLink>
          </GrupoNav>

          {(esAdminGeneral || esSupervision) && (
            <GrupoNav titulo="Administración">
              {esAdminGeneral && (
                <NavLink to="/panel/usuarios" className={claseNav} onClick={cerrarMenu}>
                  <IconoEngranaje /> Usuarios
                </NavLink>
              )}
              {esAdminGeneral && (
                <NavLink to="/panel/cuotas" className={claseNav} onClick={cerrarMenu}>
                  <IconoMoneda /> Cuotas
                </NavLink>
              )}
              <NavLink to="/panel/cierres" className={claseNav} onClick={cerrarMenu}>
                <IconoArchivo /> Cierres de periodo
              </NavLink>
              <NavLink to="/panel/auditoria" className={claseNav} onClick={cerrarMenu}>
                <IconoEscudo /> Auditoría
              </NavLink>
            </GrupoNav>
          )}

          {!esAdminGeneral && !esSupervision && (
            <GrupoNav titulo="Administración">
              <NavLink to="/panel/cierres" className={claseNav} onClick={cerrarMenu}>
                <IconoArchivo /> Cierres de periodo
              </NavLink>
            </GrupoNav>
          )}

          <GrupoNav titulo="Cuenta">
            <NavLink to="/panel/notificaciones" className={claseNav} onClick={cerrarMenu}>
              <IconoCampana /> Notificaciones
              {noLeidas > 0 && <span className="badge-contador">{noLeidas}</span>}
            </NavLink>
            <NavLink to="/panel/cuenta" className={claseNav} onClick={cerrarMenu}>
              <IconoUsuario /> Mi cuenta
            </NavLink>
          </GrupoNav>
        </nav>
        <div className="pie-barra-lateral">
          <button type="button" className="enlace-nav" onClick={salir}>
            <IconoSalir /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="contenido-panel">
        <div className="barra-superior">
          <div className="barra-superior__usuario">
            <strong>{perfil?.nombre_completo}</strong>
            <div className="texto-suave">{perfil ? ETIQUETAS_ROL[perfil.rol] : ""}</div>
          </div>
          <div className="barra-superior__acciones">
            <SelectorArea />
          </div>
        </div>
        <div className="area-principal">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default function PanelLayout() {
  return (
    <AreaProvider>
      <ContenidoPanel />
    </AreaProvider>
  );
}
