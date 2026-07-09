import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages de proyecto (usuario.github.io/repositorio) sirve los archivos
// bajo un subdirectorio, así que Vite necesita conocer ese "base" al compilar
// para que las rutas de los assets (JS/CSS) generados sean correctas.
// Se inyecta desde GitHub Actions como VITE_BASE_PATH="/nombre-del-repo/".
// El ruteo interno usa HashRouter (ver src/main.tsx), así que no depende del
// "base" para funcionar: no hace falta el truco de 404.html de GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "/",
});
