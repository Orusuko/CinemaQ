# Ejecutar el esquema por segmentos

## Si `perfiles` sigue en `false`

El SQL Editor ejecuta **cada archivo como una transacción**. Si **un** `CREATE` falla al final del archivo, **revierte todo** ese archivo (pero los archivos **anteriores** ya ejecutados sí quedan).

Por eso `02_tablas_core.sql` (monolítico) se reemplazó por **4 archivos pequeños**.

## Orden

| # | Archivo | Qué crea |
|---|---------|----------|
| — | `DIAGNOSTICO.sql` | Estado actual (ejecutar si hay problemas) |
| 01 | `01_extensiones_enums.sql` | Extensiones + ENUMs |
| 02a | `02a_areas_perfiles.sql` | `areas`, `historial_cuotas`, **`perfiles`** |
| 02b | `02b_empleados_asistencia.sql` | empleados, horario, asistencia |
| 02c | `02c_pagos_notificaciones.sql` | pagos, solicitudes, notificaciones |
| 02d | `02d_cierres.sql` | logs + cierres_periodo |
| 03–10 | resto | funciones, triggers, RPC, RLS, seed |

## Pasos ahora

1. Ejecuta `DIAGNOSTICO.sql` y revisa **todas** las pestañas de resultado.
2. Ejecuta `01_extensiones_enums.sql` (si `rol_perfil` no aparece en diagnóstico).
3. Ejecuta **`02a_areas_perfiles.sql`** solamente.
   - Debe devolver `perfiles_ok = true`.
   - Si falla, **copia el error rojo completo** (no solo el SELECT del final).
4. Si 02a pasa, ejecuta 02b → 02c → 02d → 03…

## Importante

- Usa **Run** en el archivo completo, no solo la verificación del final.
- Si ves `false` pero también un error rojo arriba, el error rojo es la causa real.
- Los archivos viejos `02_tablas_core.sql` y `02b_tablas_cierres.sql` ya no se usan.
