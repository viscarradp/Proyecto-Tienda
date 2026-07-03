# Backlog de Endurecimiento (diferido a propósito)

Este documento existe para que lo diferido no se olvide. Cada ítem indica
**por qué** se dejó fuera de la Fase 0 y **cuándo** retomarlo. Referencias a
hallazgos: ver `AUDITORIA-TECNICA.md` en la raíz del repo.

## Antes de entrar a producción (bloqueante)

### 1. Adoptar migraciones de Prisma versionadas
**Por qué se difirió:** el proyecto está en desarrollo activo, sin instancias
de producción — ver [`../decisions/0002-sin-migraciones-hasta-produccion.md`](../decisions/0002-sin-migraciones-hasta-produccion.md).
**Cuándo:** antes del primer despliegue a producción.
**Cómo:** `prisma migrate diff` + `migrate resolve --applied` para
establecer un baseline desde el estado actual de Supabase; de ahí en
adelante, todo cambio de schema pasa por `migrate dev`/`migrate deploy`.

### 2. Constraints de base de datos como defensa en profundidad
**Por qué se difirió:** las invariantes ya están garantizadas en la capa de
aplicación (ADR 0001); aplicar esto ahora, sin migraciones, generaría drift
entre el schema versionado y la BD real.
**Cuándo:** como parte de la migración baseline del ítem anterior.
**Qué aplicar:**

```sql
-- Nunca permitir stock negativo, ni siquiera por un bug futuro que se salte el lock de aplicación.
ALTER TABLE lotes_inventario
  ADD CONSTRAINT chk_cantidad_disponible_no_negativa CHECK (cantidad_disponible >= 0);

-- Solo un turno de caja ABIERTA a la vez, garantizado por la BD (hoy solo por advisory lock).
CREATE UNIQUE INDEX ux_cajas_turnos_una_abierta
  ON cajas_turnos (estado) WHERE estado = 'ABIERTA';
```

### 3. Índices sobre columnas FK y de filtro (hallazgo H5)
**Por qué se difirió:** con el volumen de datos actual (desarrollo, pocos
registros) no hay impacto medible; agregarlos ahora sin medir es
optimización prematura.
**Cuándo:** antes de producción, o antes si el histórico de datos de
desarrollo/staging empieza a sentirse lento.
**Qué aplicar** (vía migración, no a mano en Supabase):
`lotes_inventario.producto_id`, `detalle_ventas.venta_id`,
`detalle_ventas.presentacion_id`, `detalle_venta_lotes.detalle_venta_id`,
`detalle_venta_lotes.lote_id`, `ventas.caja_turno_id`, `ventas.fecha`,
`movimientos_financieros.caja_turno_id`, `movimientos_financieros.tipo_movimiento`,
`movimientos_financieros.fecha`. Considerar un índice compuesto
`lotes_inventario(producto_id, fecha_ingreso)` para acelerar el orden FIFO.

## Importante, no bloqueante

### 4. `middleware.ts` en el frontend
**Por qué se difirió:** fuera del alcance de Fase 0 (backend/integridad). La
autorización real ya la garantiza el backend; hoy el frontend solo pierde
"defensa en profundidad" de UX (un usuario sin sesión ve el shell de la UI
antes de ser redirigido).
**Cuándo:** Fase 2 del plan de auditoría original (frontend).

### 5. Trazabilidad de autor en operaciones financieras (hallazgo H8)
**Por qué se difirió:** requiere agregar `usuario_id` a varias tablas
(`ventas`, `movimientos_financieros`, `cajas_turnos`, `ajustes_inventario`),
lo cual toca el schema — más natural de hacer junto con el ítem 1
(migraciones) que a mano ahora.
**Cuándo:** junto con la adopción de migraciones, o antes si el negocio
empieza a tener más de un cajero y se vuelve necesario saber quién hizo qué.

### 6. Cookie JWT httpOnly
**Por qué se difirió:** requiere que el backend gestione la cookie (hoy la
pone el frontend vía `js-cookie`, que no puede marcarla `httpOnly`). Es un
cambio de contrato cliente-servidor, no un fix aislado.
**Cuándo:** evaluar junto con el ítem 4, al revisar seguridad del frontend.

## Escalabilidad (activar solo si se necesita)

### 7. Store compartido (Redis) para el rate-limiter
**Por qué se difirió:** el backend corre en una sola instancia hoy; Redis
agregaría una dependencia de infraestructura sin beneficio actual —
"soluciones escalables" no significa "infraestructura que no se usa
todavía".
**Cuándo:** si el backend pasa a correr en más de una instancia
(autoescalado), porque el store en memoria del throttler ya no compartiría
el conteo entre instancias.

## Menores (cuando se toque el archivo por otra razón)

- Enums en el schema para campos de estado (`ventas.estado`,
  `cajas_turnos.estado`, `usuarios.rol`, etc.) en vez de `String` libre —
  hoy validados solo por DTOs (`@IsIn`). Aplicar junto con el ítem 1.
- Endpoint `POST /caja-general/inyeccion` usa un tipo inline en vez de un DTO
  — evade el `ValidationPipe` global. Bajo riesgo (ya está tras
  `@Roles('ADMIN')`), pero es una corrección de una sola clase DTO.
- Filtro global de excepciones para traducir errores de Prisma (ej. `P2002`
  de `usuarios.create`) a respuestas HTTP claras en vez del 500 genérico de
  Nest.
