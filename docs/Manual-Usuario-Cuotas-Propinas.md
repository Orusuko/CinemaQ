---
title: Manual de Usuario
subtitle: Sistema de Cuotas de Propinas
author: CinemaQuote
date: Julio 2026
lang: es
---

<div style="page-break-after: always; text-align: center; padding-top: 180px;">

# Manual de Usuario

## Sistema de Seguimiento de Cuotas de Propinas

**Versión:** 1.0 · **Julio 2026**

Sitio web: **https://orusuko.github.io/CinemaQ/**

Este documento explica el uso diario del sistema para **empleados** y **personal administrativo de área** (Comanderos y Corredores).

*No incluye funciones reservadas al administrador general del sistema (gestión de usuarios, montos de cuota globales ni auditoría avanzada).*

</div>

---

## 1. ¿Qué es este sistema?

El **Sistema de Cuotas de Propinas** registra el pago diario de la cuota fija que aportan los empleados de **Comanderos** y **Corredores**. Funciona con **doble verificación**:

1. El **empleado** marca en la página pública que ya pagó.
2. Un **administrador de área** revisa y **valida** el pago en caja.

Así se mantiene un control claro de quién debe pagar, quién ya pagó y cuánto se ha recaudado en el periodo.

### Roles cubiertos en este manual

| Rol | ¿Quién es? | Qué hace |
|-----|------------|----------|
| **Empleado** | Personal operativo | Marca su pago del día en la web pública (sin contraseña). |
| **Administrador de área** | Encargado de Comanderos o Corredores | Registra horario y asistencia, valida pagos y consulta el balance de su área. |

> **Nota:** Existen otros perfiles (supervisión y administrador general) con permisos adicionales. Este manual **no** los describe.

---

## 2. Flujo del día (resumen)

El proceso habitual es el siguiente:

```
  MAÑANA / PREPARACIÓN          DURANTE EL TURNO              CIERRE DEL DÍA
  ───────────────────          ─────────────────             ────────────────
  1. Horario del día      →    2. Asistencia registrada  →   4. Empleado marca
     (quién trabaja)            (obligación de pago)          "Ya pagué"
                                                          →   5. Admin valida
                                                                en Pagos
                                                          →   6. Balance muestra
                                                                avance del día
```

**Orden recomendado para el administrador de área:**

1. **Horario** — indicar quién está enrolado hoy.
2. **Asistencia** — confirmar asistencia (genera la cuota del día).
3. **Pagos** — validar lo que los empleados marcaron como pagado.
4. **Balance** — revisar totales y pendientes.

---

## 3. Parte I — Guía para empleados

### 3.1 Acceso

1. Abre en el navegador del celular o computadora:  
   **https://orusuko.github.io/CinemaQ/**
2. **No necesitas usuario ni contraseña** para marcar tu pago.
3. La hora del sistema es **Ciudad de México (CDMX)**.

### 3.2 Marcar que ya pagaste

1. En la pantalla principal verás: **«¿Ya pagaste tu cuota de hoy?»**
2. Escribe en el buscador tu **número de empleado** o tu **nombre**.
3. Aparecerá una lista de coincidencias; elige la tuya (muestra área: Comanderos o Corredores).
4. Pulsa **«Ya pagué»**.
5. Si todo salió bien, verás un mensaje de confirmación.

### 3.3 Qué pasa después de marcar

| Paso | Qué significa |
|------|----------------|
| Tú marcas «Ya pagué» | El pago queda **en revisión**; aún no cuenta como validado en caja. |
| El administrador valida | El pago pasa a **Validado** y suma al recaudo del día. |
| El administrador rechaza | Vuelves a estado **Pendiente** y puedes marcar de nuevo si corresponde. |

### 3.4 Ventana horaria

El sistema puede **rechazar** marcas fuera del horario permitido (cierre a las **23:30 hora CDMX**). Si ves un mensaje de error al marcar, espera instrucciones de tu administrador o intenta dentro del horario válido.

### 3.5 Consejos

- Verifica que elegiste **tu nombre correcto** antes de pulsar «Ya pagué».
- Si te equivocaste, **avisa de inmediato** al administrador de tu área; ellos pueden corregir desde el panel.
- Marcar en la app **no sustituye** entregar el dinero en caja; solo es el registro digital.

---

## 4. Parte II — Guía para administradores de área

### 4.1 Acceso al panel

1. Entra a **https://orusuko.github.io/CinemaQ/**
2. Pulsa **«Iniciar sesión»** (esquina superior).
3. Escribe tu **usuario** y **contraseña** (te los proporciona el administrador general).
4. Tras ingresar llegarás al **Balance** (panel principal).

Para salir: menú lateral → **Cerrar sesión**.

### 4.2 Menú del panel

El menú está organizado en grupos:

| Grupo | Pantallas | Uso |
|-------|-----------|-----|
| **Operación diaria** | Balance, Horario, Asistencia, Pagos | Trabajo del día a día |
| **Personal** | Empleados, Solicitudes de área | Catálogo y movimientos de personal |
| **Administración** | Cierres de periodo | Consultar cortes contables ya realizados |
| **Cuenta** | Notificaciones, Mi cuenta | Avisos y cambio de contraseña |

En **celular**, abre el menú con el icono ☰ (arriba a la izquierda).

> Solo verás datos de **tu área** (Comanderos o Corredores).

---

### 4.3 Horario del día

**Para qué sirve:** definir qué empleados activos están **enrolados** (programados) para trabajar en la fecha seleccionada.

**Pasos:**

1. Ve a **Horario**.
2. Confirma la **fecha** (por defecto: hoy).
3. Por cada empleado:
   - **Agregar** — lo marca como «En horario: Sí».
   - **Quitar** — lo saca del horario del día.
4. Opcional: marca varios con la casilla **Seleccionar** y usa **«Registrar asistencia de seleccionados»** para pasar al siguiente paso automáticamente.

**Importante:** solo puedes modificar el horario de **tu área**.

---

### 4.4 Asistencia

**Para qué sirve:** registrar quién **asistió** en una fecha. Al registrar asistencia se **genera la obligación de pago** (cuota) de ese día para el empleado.

**Pasos:**

1. Ve a **Asistencia**.
2. Elige la **fecha** (puedes consultar hasta **7 días atrás**).
3. Para agregar a alguien que no aparece:
   - Selecciónalo en el desplegable **«Agregar empleado…»**.
   - Pulsa **Agregar**.
4. La tabla muestra quién tiene asistencia y el **estado del pago** vinculado (Pendiente, En revisión, Validado, etc.).

**Eliminar una asistencia:**

1. Pulsa **Eliminar** en la fila correspondiente.
2. Indica el **motivo** (obligatorio).
3. Tras eliminar, aparece un aviso con opción **Revertir** por unos segundos por si fue un error.

> Eliminar asistencia afecta el pago del día. Úsalo solo cuando corresponda.

---

### 4.5 Pagos

**Para qué sirve:** revisar y **validar en caja** los pagos pendientes o marcados por empleados.

#### Filtros

- **Desde / Hasta:** rango de fechas a consultar.
- **Registrar pago manual:** para casos excepcionales (empleado pagó pero no marcó, o flujo especial). Solo si **no existe** ya un pago activo para ese día.

#### Pestaña «Pendientes y en revisión»

| Estado | Significado | Acciones disponibles |
|--------|-------------|----------------------|
| **Pendiente** | Debe pagar; aún no marcó o fue rechazado | **Validar** (si pagó en caja), **Eliminar** |
| **En revisión** | El empleado pulsó «Ya pagué» | **Validar**, **Rechazar**, **Eliminar** |

- **Validar** — confirma que recibiste el dinero; el pago cuenta en el balance.
- **Rechazar** — solo en «En revisión»; el empleado puede volver a marcar.
- **Eliminar** — borra el registro (usar con cuidado).

#### Pestaña «Validados»

Muestra pagos ya confirmados. Puedes **Revertir** (vuelven a pendiente; requiere motivo) o **Eliminar** si hubo error.

#### Atajo desde Balance

En **Balance**, la pestaña «Pendientes por cobrar» tiene enlaces **Validar →** que te llevan directo a Pagos con el periodo correcto.

---

### 4.6 Balance

**Para qué sirve:** ver el **resumen financiero** del periodo de tu área.

#### Indicadores (KPI)

| Indicador | Significado |
|-----------|-------------|
| **Total a recaudar** | Suma de cuotas esperadas (excluye cancelados). |
| **Validado en caja** | Dinero ya confirmado por ti. |
| **Diferencia** | Lo que falta por validar. |
| **En revisión** | Monto marcado por empleados, pendiente de tu validación. |

#### Periodo

Puedes filtrar por: **Hoy**, **Esta semana**, **Este mes** o **Rango libre**.

#### Pestañas

- **Pendientes por cobrar** — lista de pagos sin validar.
- **Todos los pagos** — historial completo del periodo.

#### Exportar

**Exportar CSV** descarga un archivo para Excel con el detalle del periodo seleccionado.

La **barra de avance** muestra el porcentaje recaudado del periodo.

---

### 4.7 Empleados

**Para qué sirve:** consultar el personal de tu área y dar de alta empleados nuevos.

#### Acciones disponibles (administrador de área)

| Acción | Descripción |
|--------|-------------|
| **Nuevo empleado** | Registrar número, nombres y datos básicos en tu área. |
| **Cambiar estado** | Activar o desactivar un empleado (inactivo no aparece en flujos normales). |
| **Solicitar a mi área** | Pedir incorporar a alguien que hoy está en la **otra área** (requiere aprobación posterior). |

> No puedes mover empleados de área directamente; eso lo resuelve el administrador general vía solicitudes.

---

### 4.8 Solicitudes de área

**Para qué sirve:** ver el estado de pedidos para que un empleado cambie de área.

Como administrador de área puedes **consultar** el listado (pendiente, aprobada, rechazada). La **aprobación o rechazo** la realiza el administrador general.

Si solicitaste traer a alguien de otra área, aquí verás si ya fue procesado.

---

### 4.9 Cierres de periodo

**Para qué sirve:** consultar **cortes contables** ya realizados (snapshots de un rango de fechas).

- Puedes ver rango, áreas, montos esperados, validados y diferencia.
- **Descargar CSV** obtiene el detalle guardado en el cierre.

> Crear un cierre nuevo es función del administrador general. Tú solo **consultas y descargas**.

Un cierre **no impide** seguir validando pagos de esas fechas; es un reporte de referencia.

---

### 4.10 Notificaciones

Icono de **campana** en el menú o barra móvil.

- Las notificaciones **nuevas** aparecen resaltadas.
- Pulsa **Marcar leída** cuando las hayas revisado.

---

### 4.11 Mi cuenta

- Consulta tu nombre y rol.
- **Cambiar contraseña:** mínimo 8 caracteres; confirma dos veces y guarda.

---

## 5. Estados del pago (glosario)

| Estado | Color habitual | Significado |
|--------|----------------|-------------|
| **Pendiente** | Amarillo | Debe pagar; no ha marcado o puede volver a marcar. |
| **En revisión** | Naranja | El empleado indicó que pagó; falta validación tuya. |
| **Validado** | Verde | Pago confirmado en caja. |
| **Cancelado** | Gris | Obligación anulada (por eliminación de asistencia u otro proceso). |

---

## 6. Preguntas frecuentes

**¿El empleado necesita instalar algo?**  
No. Solo un navegador web con internet.

**¿Puedo validar un pago aunque el empleado no haya marcado «Ya pagué»?**  
Sí. Desde **Pagos**, en estado Pendiente, usa **Validar** si ya recibiste el efectivo.

**¿Qué hago si un empleado marcó por error?**  
En **Pagos**, localiza el registro en «En revisión» y usa **Rechazar** o **Eliminar** según el caso.

**¿Por qué no veo empleados de la otra área en mi Horario?**  
Cada administrador de área solo gestiona su propia área.

**¿La app funciona en el teléfono?**  
Sí. El panel tiene menú adaptado a móvil (icono ☰).

**¿Qué pasa si olvido registrar asistencia?**  
Sin asistencia registrada, no se genera la cuota del día para ese empleado. Regístrala en **Asistencia** antes de validar pagos.

---

## 7. Soporte

| Tema | Contacto |
|------|----------|
| Usuario o contraseña del panel | Administrador general del sistema |
| Monto de la cuota diaria | Administrador general |
| Errores técnicos o acceso al sitio | Administrador general / soporte TI |

**URL del sistema:** https://orusuko.github.io/CinemaQ/

---

*Fin del manual de usuario · Sistema de Cuotas de Propinas · Julio 2026*
