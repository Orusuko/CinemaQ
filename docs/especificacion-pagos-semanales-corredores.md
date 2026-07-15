# Especificación: Pagos Semanales para Corredores

> **Estado:** Borrador — pendiente validación con operación  
> **Fecha:** julio 2026  
> **Área afectada:** Corredores  
> **Régimen actual:** cobro diario (igual que Comanderos)

---

## 1. Hipótesis de negocio

Los **Corredores** podrían migrar a un régimen de cobro **semanal** en lugar del cobro diario actual. Bajo esta modalidad:

- Cada Corredor trabaja **6 de 7 días** a la semana (1 día de descanso).
- La obligación semanal sería pagar la cuota correspondiente a los 6 días laborales.
- El monto semanal = `6 × cuota_diaria` (hipótesis inicial, **pendiente confirmar** si hay un monto fijo distinto).
- **Comanderos** permanecen en régimen 100% diario, sin cambios.

---

## 2. Preguntas abiertas para operación

| # | Pregunta | Impacto si cambia la respuesta |
|---|----------|-------------------------------|
| 1 | ¿Todos los Corredores son semanales o solo un subconjunto? | Si es subconjunto, necesitamos flag por empleado, no por área |
| 2 | ¿El día de descanso es fijo por empleado o rotativo? | Afecta cómo se genera la obligación semanal |
| 3 | ¿La cuota semanal = 6 × cuota diaria o monto fijo distinto? | Cambia la fórmula de cálculo y la tabla de cuotas |
| 4 | ¿El empleado marca «Ya pagué» una vez por semana o sigue siendo diario con consolidación admin? | Impacta página pública y flujo de marcado |
| 5 | ¿Cuándo se considera «pagada» la semana? ¿Puede pagar parcialmente? | Define el estado de la obligación semanal |
| 6 | ¿Cómo interactúa con `cerrar_periodo`? ¿El cierre se alinea a semana laboral? | Puede requerir ajustes al cierre contable |
| 7 | ¿Qué pasa si un Corredor cambia de área a mitad de semana? | Regla de prorrateo o cancelación |
| 8 | ¿El inicio de la semana laboral es lunes o domingo? | Afecta agrupación de días |

---

## 3. Reglas propuestas

### 3.1 Semana laboral

- **Días laborales:** 6 de 7 (constante `DIAS_LABORALES_SEMANA = 6`)
- **Inicio de semana:** Lunes (alineado con el resto del sistema)
- **Día de descanso:** Determinado por registro en `asistencia_diaria` o por campo en empleado (TBD)

### 3.2 Obligación semanal

- Se genera una **obligación semanal** por cada Corredor al inicio de la semana (o al primer día hábil del empleado en la semana).
- Monto esperado: `cuota_diaria × 6` (o `cuota_semanal` si se define un monto fijo distinto).
- La obligación se satisface cuando el total de pagos diarios validados en esa semana ≥ monto esperado.

### 3.3 Estados de la obligación semanal

| Estado | Definición |
|--------|-----------|
| `pendiente` | No se han validado suficientes pagos diarios |
| `parcial` | Se han validado pagos pero no alcanzan el monto semanal |
| `completada` | Total validado ≥ monto esperado semanal |
| `incompleta` | Semana cerrada sin completar el monto |

### 3.4 Interacción con pagos diarios existentes

Dos opciones (decisión pendiente):

**Opción A — Pagos diarios se mantienen, obligación semanal es vista agregada:**
- `pagos_cuota` sigue generando registros diarios para Corredores.
- La "obligación semanal" es una vista calculada que agrupa los pagos diarios de Lun-Dom.
- Ventaja: menor cambio en BD y triggers.
- Desventaja: la UI debe mostrar tanto diario como semanal.

**Opción B — Nueva tabla `obligaciones_semanales`:**
- Se crea una tabla separada que registra la obligación por semana.
- Los pagos diarios se vinculan a la obligación semanal.
- Ventaja: modelo más limpio para reportes y cierres.
- Desventaja: mayor esfuerzo de migración, triggers, y reconciliación.

**Recomendación:** Opción A para fase inicial (mínimo impacto), migrar a Opción B si la complejidad lo requiere.

---

## 4. Impacto por módulo

### 4.1 `pagos_cuota`

- **Opción A:** Sin cambios en esquema. La generación diaria sigue igual.
- **Opción B:** Agregar campo `obligacion_semanal_id` (FK nullable).

### 4.2 `asistencia_diaria`

- Se usa para determinar qué día es el de descanso del Corredor.
- Si el descanso es fijo, podría estar en `empleados` en vez de inferirse.

### 4.3 Balance (Dashboard)

- Los KPIs del periodo abierto deben mostrar el acumulado semanal para Corredores.
- Posible nueva vista: "Obligaciones semanales" con estado de cada una.
- Los KPIs principales (Total a recaudar, Validado, Falta por cobrar) siguen siendo montos absolutos.

### 4.4 Cierres de periodo

- El cierre ya es rango libre y area-específico; no requiere cambios si la obligación semanal es vista calculada.
- Si se adopta Opción B, el cierre podría incluir snapshot de obligaciones semanales.

### 4.5 Página pública (empleado)

- **Si el empleado sigue marcando diario:** sin cambios en la página pública.
- **Si marca una vez por semana:** la página pública necesita mostrar el estado de la obligación semanal y permitir un solo marcado.

### 4.6 Panel de Pagos (`Pagos.tsx`)

- Agregar vista de "Obligaciones semanales" para Corredores (filtro por área).
- La vista de revisión individual diaria se mantiene para Comanderos.

---

## 5. Matriz de escenarios edge case

| # | Escenario | Resultado esperado |
|---|-----------|-------------------|
| 1 | Corredor falta 2 días en la semana | Obligación semanal se reduce a `4 × cuota_diaria` (si descanso+falta=3 de 7) o se mantiene en `6 × cuota_diaria` (si solo se descuenta el descanso oficial). **Decisión pendiente.** |
| 2 | Corredor paga 3 cuotas a mitad de semana | Estado = `parcial`. Falta = `3 × cuota_diaria`. |
| 3 | Corredor cambia de área a Comanderos a mitad de semana | Obligación semanal se cancela o prorratea. Desde el día del cambio, régimen diario. |
| 4 | Semana tiene un feriado (ej. 25 dic) | ¿Se descuenta del total semanal? Depende de política de la empresa. |
| 5 | Corredor entra a mitad de semana (nuevo ingreso) | Obligación prorrateada por los días restantes de la semana. |
| 6 | Cierre de periodo corta a mitad de semana | El cierre incluye pagos hasta la fecha de corte; la obligación semanal queda parcial en ese cierre y continúa en el siguiente. |
| 7 | Admin revierte un pago validado en la semana | El estado de la obligación semanal recalcula automáticamente. |
| 8 | Empleado inactivo durante toda la semana | No se genera obligación semanal (no aparece en horario). |

---

## 6. Propuesta de esquema futuro

### Opción A — Vista calculada (recomendada para fase inicial)

Sin cambios en BD. En el frontend:

```typescript
interface ObligacionSemanal {
  empleadoId: string;
  areaId: string;
  inicioSemana: string;    // YYYY-MM-DD (lunes)
  finSemana: string;       // YYYY-MM-DD (domingo)
  diasLaborales: number;   // típicamente 6
  montoEsperado: number;   // diasLaborales × cuota_diaria
  montoValidado: number;   // suma de pagos validados en la semana
  estado: EstadoObligacionSemanal;
  pagos: PagoCuota[];      // referencias a los pagos diarios
}
```

### Opción B — Tabla `obligaciones_semanales`

```sql
CREATE TABLE obligaciones_semanales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID REFERENCES empleados(id),
  area_id UUID REFERENCES areas(id),
  inicio_semana DATE NOT NULL,
  fin_semana DATE NOT NULL,
  dias_laborales INT NOT NULL DEFAULT 6,
  monto_esperado NUMERIC(10,2) NOT NULL,
  monto_validado NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'parcial', 'completada', 'incompleta')),
  creado_en TIMESTAMPTZ DEFAULT now(),
  actualizado_en TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empleado_id, inicio_semana)
);
```

### Opción C — Flag en `empleados`

Agregar `modo_cobro TEXT DEFAULT 'diario' CHECK (modo_cobro IN ('diario', 'semanal'))` a la tabla `empleados`. Esto permite mezclar modos dentro de la misma área.

**Recomendación:** Combinar Opción A (fase inicial) con Opción C (flag) para marcar quién es semanal. Migrar a Opción B si la complejidad crece.

---

## 7. Fases de implementación

| Fase | Nombre | Alcance | Dependencias |
|------|--------|---------|-------------|
| 11a | Validación operativa | Cerrar preguntas abiertas con Andre/Tony/operación | Ninguna |
| 11b | Migración Supabase | Flag `modo_cobro` en empleados (Opción C) + RLS | 11a |
| 11c | Generación de obligaciones | Trigger o job que genera obligaciones semanales para Corredores con `modo_cobro = 'semanal'` | 11b |
| 11d | UI: página pública + Pagos | Adaptar marcado y revisión para régimen semanal | 11c |
| 11e | Balance y cierres | Adaptar Dashboard KPIs, drill-down, y cierres para obligaciones semanales | 11d |
| 11f | Manual + pruebas | Actualizar manual de usuario, tests e2e | 11e |

### Diagrama de dependencias

```
11a → 11b → 11c → 11d → 11e → 11f
```

Cada fase debe ser aprobada antes de iniciar la siguiente. No se procede a 11b sin tener respuestas confirmadas de 11a.

---

## 8. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Decisión de negocio cambia después de implementar | Mantener Opción A (vista calculada) el mayor tiempo posible para minimizar migración |
| Complejidad de prorrateo en edge cases | Definir regla simple (ej. "si falta, se descuenta del esperado") y documentar excepciones |
| Impacto en rendimiento con muchas obligaciones semanales | Monitorear queries; implementar RPC agregado si necesario |
| Confusión del usuario al ver dos regímenes | UI clara con separación por pestaña o filtro de área |
