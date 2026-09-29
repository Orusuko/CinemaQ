import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import PaginaPublica from "./pages/PaginaPublica";
import PanelLayout from "./pages/panel/PanelLayout";
import Dashboard from "./pages/panel/Dashboard";
import Horario from "./pages/panel/Horario";
import Asistencia from "./pages/panel/Asistencia";
import Pagos from "./pages/panel/Pagos";
import Empleados from "./pages/panel/Empleados";
import Solicitudes from "./pages/panel/Solicitudes";
import Usuarios from "./pages/panel/Usuarios";
import Cuotas from "./pages/panel/Cuotas";
import Cierres from "./pages/panel/Cierres";
import Auditoria from "./pages/panel/Auditoria";
import Notificaciones from "./pages/panel/Notificaciones";
import MiCuenta from "./pages/panel/MiCuenta";

function CargandoPantallaCompleta() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      Cargando…
    </div>
  );
}

function RutaProtegida({ children }: { children: ReactNode }) {
  const { sesion, perfil, cargando } = useAuth();
  if (cargando) return <CargandoPantallaCompleta />;
  if (!sesion || !perfil) return <Navigate to="/" replace />;
  if (!perfil.activo) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SoloRoles({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { perfil } = useAuth();
  if (!perfil || !roles.includes(perfil.rol)) {
    return <Navigate to="/panel/dashboard" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PaginaPublica />} />
      <Route
        path="/panel"
        element={
          <RutaProtegida>
            <PanelLayout />
          </RutaProtegida>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="horario" element={<Horario />} />
        <Route path="asistencia" element={<Asistencia />} />
        <Route path="pagos" element={<Pagos />} />
        <Route path="empleados" element={<Empleados />} />
        <Route path="solicitudes" element={<Solicitudes />} />
        <Route
          path="usuarios"
          element={
            <SoloRoles roles={["administrador_general"]}>
              <Usuarios />
            </SoloRoles>
          }
        />
        <Route
          path="cuotas"
          element={
            <SoloRoles roles={["administrador_general"]}>
              <Cuotas />
            </SoloRoles>
          }
        />
        <Route path="cierres" element={<Cierres />} />
        <Route
          path="auditoria"
          element={
            <SoloRoles roles={["administrador_general", "supervision"]}>
              <Auditoria />
            </SoloRoles>
          }
        />
        <Route path="notificaciones" element={<Notificaciones />} />
        <Route path="cuenta" element={<MiCuenta />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
