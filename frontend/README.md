# Frontend — Sistema de Seguimiento de Cuotas de Propinas

App React + Vite (TypeScript). Se compila a un sitio 100% estático para
GitHub Pages y habla directo con Supabase mediante `@supabase/supabase-js`.

Para la documentación completa de instalación, despliegue y decisiones de
diseño, consulta el [README de la raíz del repositorio](../README.md).

## Comandos

```bash
npm install       # instalar dependencias
npm run dev       # servidor de desarrollo
npm run build     # compilar a frontend/dist
npm run lint      # oxlint
npm run preview   # previsualizar el build de producción
```

Copia `.env.example` a `.env` y completa `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` antes de correr `npm run dev`.
