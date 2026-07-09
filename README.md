# Sistema de Seguimiento de Cuotas de Propinas

Aplicación web para gestionar el cobro diario de la cuota fija de propinas en
dos áreas (**Comanderos** y **Corredores**), con doble verificación
(empleado + administrativo), balance en tiempo real, horario del día,
solicitudes de cambio de área, notificaciones, cierre de periodo, auditoría
reforzada y exportación CSV.

- **Frontend:** React + Vite (sitio 100% estático), desplegado en **GitHub Pages**.
- **Backend/datos:** **Supabase** (Postgres + Auth + Row Level Security + funciones RPC + Edge Functions).
- **Idioma:** 100% español (UI, mensajes, estados, CSV).
- **Zona horaria del negocio:** America/Mexico_City (CDMX), calculada siempre en el servidor.

---

## 1. Estructura del repositorio

```
.
├── frontend/                     App React + Vite (se compila a sitio estático)
├── supabase/
│   ├── esquema_completo.sql      Todo el SQL en un solo archivo
│   ├── segmentos/                Mismo SQL dividido en 10 partes (ver LEEME.md)
│   └── functions/                Edge Functions (Deno) para gestión de usuarios admin
│       ├── _shared/                Helpers compartidos (CORS, verificación de rol)
│       ├── create-admin-user/
│       ├── update-admin-user/
│       └── deactivate-admin-user/
└── .github/workflows/deploy-pages.yml     CI/CD a GitHub Pages
```

---

## 2. Puesta en marcha de Supabase

### 2.1 Crear el proyecto

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com).
2. En **Project Settings → General**, configura la zona horaria en
   `America/Mexico_City` (aunque toda la lógica de fecha/hora del sistema usa
   explícitamente esa zona horaria en las funciones SQL, independientemente
   de esta configuración — es una capa adicional de consistencia).

### 2.2 Ejecutar el esquema (un solo SQL)

1. En Supabase → **Authentication → Providers → Email**, pon **Minimum password
   length** en **4** (para la contraseña de prueba `1234`).
2. Abre **SQL Editor → New query**.
3. Pega el SQL de una de estas opciones:
   - **Todo de una vez:** [`supabase/esquema_completo.sql`](supabase/esquema_completo.sql)
   - **Por partes (recomendado si hay errores):** carpeta [`supabase/segmentos/`](supabase/segmentos/) — ejecuta `01` … `10` en orden (ver [`LEEME.md`](supabase/segmentos/LEEME.md)).
4. **Run**. Incluye extensiones, tablas, funciones, triggers, RPC, RLS, áreas,
   pg_cron y el usuario **Orusuko / 1234** (administrador_general).

Es idempotente: puedes volver a ejecutarlo si algo falló a medias.

> **Si tu plan no soporta `pg_cron`:** comenta `create extension if not exists "pg_cron"`
> y el bloque `cron.schedule` al final del archivo.

### 2.3 Credenciales de prueba

Tras ejecutar `esquema_completo.sql`:

| Campo | Valor |
|-------|-------|
| Usuario | `Orusuko` |
| Contraseña | `1234` |
| Rol | `administrador_general` |

El login es por **nombre de usuario** (no correo). Auth usa internamente
`orusuko@cuotas.interno`.

### 2.4 Crear más usuarios administrativos

Desde el panel **Usuarios** (una vez dentro como Orusuko), con nombre de
usuario + contraseña. Requiere desplegar las Edge Functions (sección 2.6).

### 2.5 CORS

En **Project Settings → API → CORS**, agrega el dominio de tu GitHub Pages,
por ejemplo `https://tu-usuario.github.io`.

### 2.6 Edge Functions

```bash
supabase functions deploy create-admin-user
supabase functions deploy update-admin-user
supabase functions deploy deactivate-admin-user
```

Configura la variable de entorno `ALLOWED_ORIGIN` en cada función (Dashboard
→ Edge Functions → Settings) con el dominio de GitHub Pages, para que el
`CORS` de las funciones coincida. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
ya están disponibles automáticamente dentro del entorno de Edge Functions —
**nunca** las copies al frontend.

---

## 3. Puesta en marcha del frontend (local)

```bash
cd frontend
cp .env.example .env
# Edita .env con tu URL y anon key de Supabase
npm install
npm run dev
```

La **anon key es pública por diseño**: es seguro que quede visible en el
código del sitio (GitHub Pages es público). La seguridad real de los datos
vive en las políticas de Row Level Security de Supabase, no en ocultar esta
llave. La llave `service_role` **nunca** debe usarse aquí.

---

## 4. Despliegue en GitHub Pages

1. Crea un repositorio **público** en GitHub y sube este proyecto a la rama `main`.
2. En **Settings → Pages**, selecciona la fuente **GitHub Actions**.
3. En **Settings → Secrets and variables → Actions**, crea:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Cada push a `main` dispara `.github/workflows/deploy-pages.yml`, que
   compila `frontend/` (inyectando los secrets y el `base path` con el
   nombre del repositorio) y publica el resultado en GitHub Pages.

El ruteo interno usa `HashRouter` (rutas tipo `/#/panel/dashboard`), por lo
que **no** se necesita el truco de `404.html` para SPAs en GitHub Pages: el
navegador nunca le pide al servidor una ruta que no exista, todo el ruteo
ocurre después de cargar `index.html`.

---

## 5. Decisiones de diseño y supuestos tomados

Estas decisiones se tomaron para cerrar ambigüedades de la especificación
original y poder construir el sistema sin bloquear el desarrollo. Si alguna
no es la deseada, es fácil de ajustar (se señala dónde en cada caso):

| # | Decisión | Dónde ajustar |
|---|----------|----------------|
| 1 | "Tiempo real" en balance = recalcular al cargar la pantalla o después de "Guardar cambios". **No** se usa Supabase Realtime en este MVP. | `Dashboard.tsx` (agregar suscripción Realtime si se desea) |
| 2 | El balance de la **página pública** muestra solo el **agregado del día actual por área** (esperado/recaudado/en revisión), sin desglose por empleado. | `balance_publico_hoy()` en `0005_rpc_publico.sql` + `PaginaPublica.tsx` |
| 3 | `cierres_periodo.detalle` guarda un **snapshot jsonb** del desglose por empleado en el momento del cierre. Las descargas posteriores del CSV usan ese snapshot, **no** recalculan contra `pagos_cuota` (que puede seguir cambiando después del cierre). | `cerrar_periodo()` en `0006_rpc_admin.sql` |
| 4 | `cerrar_periodo()` siempre inserta **2 filas** (una por área), aunque los totales sean $0.00. | `0006_rpc_admin.sql` |
| 5 | Colisión de identificador público (4 primeros dígitos repetidos entre empleados activos): se amplía automáticamente a 5 dígitos para ese subconjunto. | `listar_empleados_publicos()` en `0005_rpc_publico.sql` |
| 6 | Nombres de archivo CSV usan guiones bajos consistentes: `tipo_area_desde_hasta.csv`. | `src/lib/csv.ts` |
| 7 | El admin_area puede **validar directamente** un pago `pendiente` (sin esperar a que el empleado marque), no solo pagos `marcado_pendiente_validacion`. Esto cubre el "flujo alterno" descrito en la especificación original. | `validar_pago()` en `0006_rpc_admin.sql` |
| 8 | Al **rechazar** un pago en revisión, se limpia `marcado_por_empleado`/`marcado_empleado_en` para que el empleado pueda volver a marcar. | `rechazar_pago()` en `0006_rpc_admin.sql` |
| 9 | Al **revertir una validación**, también se limpian las banderas de marcado del empleado (vuelve a un estado "limpio" de pendiente). | `revertir_validacion()` en `0006_rpc_admin.sql` |
| 10 | Al **revertir la eliminación** de una asistencia, el pago vinculado regresa a `pendiente` (nunca directo a `validado`): re-acreditar dinero automáticamente saltaría el filtro humano de doble verificación. | `revertir_eliminacion_asistencia()` en `0006_rpc_admin.sql` |
| 11 | `registrar_pago_manual` solo aplica cuando **no existe** una obligación de pago para ese día (o esta fue cancelada). Si ya existe una fila `pendiente`/`en revisión`/`validado`, se rechaza sugiriendo usar "validar" o "revertir" en su lugar. | `registrar_pago_manual()` en `0006_rpc_admin.sql` |
| 12 | pg_cron programado a las **13:00 UTC** para `revisar_pagos_estancados()`. | Final de `esquema_completo.sql` |
| 13 | La ventana horaria del empleado (23:30 CDMX) se valida **únicamente en el servidor** dentro de `marcar_pago_empleado()`; el frontend no deshabilita el botón preventivamente por hora, solo muestra el mensaje de error que devuelve el servidor si ya cerró. | `marcar_pago_empleado()` + `PaginaPublica.tsx` |

---

## 6. Seguridad — checklist de despliegue

Antes de dar por buena una instalación en producción, verifica:

- [ ] `ENABLE ROW LEVEL SECURITY` está activo en **todas** las tablas de negocio (lo hace `0007_rls.sql`; puedes confirmarlo en el Dashboard → Table Editor → cada tabla).
- [ ] El rol `anon` **no** tiene acceso directo de lectura/escritura a ninguna tabla (solo `EXECUTE` en `marcar_pago_empleado`, `listar_empleados_publicos`, `balance_publico_hoy`).
- [ ] La llave `service_role` **no** aparece en ningún archivo del repositorio ni en `frontend/`.
- [ ] Las variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` están configuradas como GitHub Secrets, no hardcodeadas.
- [ ] CORS de Supabase permite el dominio real de GitHub Pages.
- [ ] Los 4 usuarios iniciales tienen contraseñas temporales fuertes y las cambian en su primer ingreso desde "Mi cuenta".
- [ ] `pg_cron` (o su alternativa) está corriendo `revisar_pagos_estancados()` diariamente.

---

## 7. Respaldo de datos

Este es un proyecto de bajo volumen (hobby/negocio pequeño), por lo que no es
necesario contratar el plan pagado de Supabase solo por retención extendida
de backups. Como respaldo informal, se recomienda exportar mensualmente el
CSV de "Historial completo" desde el panel de Administrador o Supervisión y
guardarlo fuera de Supabase (por ejemplo, en una carpeta compartida).

---

## 8. Guía rápida por rol

| Rol | Accede a | Login |
|-----|----------|-------|
| Empleado | Página principal (`/`) — selecciona su registro y marca "Ya pagué" | No requiere cuenta |
| Andre / Tony (`admin_area`) | Panel completo de su área: horario, asistencia, pagos, empleados, solicitudes, cierres (lectura), notificaciones | Sí |
| Administrador (`administrador_general`) | Todo lo anterior en ambas áreas + usuarios, cuotas, cierre de periodo, auditoría completa | Sí |
| Supervisión (`supervision`) | Todo en modo solo lectura + exportación de todos los reportes | Sí |

---

## 9. Pruebas manuales sugeridas (end-to-end)

1. **Flujo normal de pago:** registra asistencia de un empleado hoy → verifica que aparezca un `pagos_cuota` en estado `pendiente` → desde la página pública, marca "Ya pagué" con ese empleado → verifica que pase a "En revisión" → desde el panel del admin de esa área, valida el pago → verifica que el balance recaudado suba y la diferencia baje.
2. **Pago manual:** desde el panel, registra un pago manual para un empleado sin asistencia previa → verifica que quede `validado` de inmediato y que **no** se haya creado una fila en `asistencia_diaria`.
3. **Revertir validación:** revierte el pago anterior sin indicar motivo (debe fallar) y luego con motivo (debe funcionar y volver a `pendiente`).
4. **Eliminar asistencia con pago validado:** valida un pago, luego elimina la asistencia vinculada sin motivo (debe fallar) y con motivo (debe funcionar, el pago pasa a `cancelado`, y aparece en Auditoría). Prueba también el botón "Revertir" del toast.
5. **Cambio de área:** como `admin_area`, solicita mover a un empleado de área → como `administrador_general`, apruébalo → verifica `historial_area_empleado`.
6. **Cierre de periodo:** cierra un periodo con `administrador_general` → descarga el CSV y confirma que tenga dos bloques (uno por área) con totales. Intenta cerrar un rango que se traslape → debe fallar.
7. **RLS:** intenta, desde la consola del navegador con la anon key (sin sesión), hacer un `select` directo a `pagos_cuota` vía `supabase-js` → debe regresar un arreglo vacío o error de permisos, nunca datos.
8. **Usuarios:** como `administrador_general`, crea un nuevo `admin_area`, e inicia sesión con esa cuenta para confirmar que solo ve su área asignada.
