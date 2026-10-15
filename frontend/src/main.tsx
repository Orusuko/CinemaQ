import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";

// Tras un despliegue, una pestaña abierta pide archivos con el nombre viejo (404): se recarga para tomar la versión nueva.
// El margen de 1 min evita un bucle si el archivo de verdad no existe.
window.addEventListener("vite:preloadError", () => {
  const ultima = Number(sessionStorage.getItem("recarga_por_version") ?? 0);
  if (Date.now() - ultima < 60_000) return;
  sessionStorage.setItem("recarga_por_version", String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
