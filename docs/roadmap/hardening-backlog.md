# Backlog de Endurecimiento (diferido a propósito)

Este documento existe para que lo diferido no se olvide. Cada ítem indica
**por qué** se dejó fuera de la Fase 0 y **cuándo** retomarlo. Referencias a
hallazgos: ver [`../auditorias/2026-07-02-auditoria-tecnica.md`](../auditorias/2026-07-02-auditoria-tecnica.md).

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

### 2b. Inmutabilidad de las tablas de libro a nivel BD (auditoría negocio §10, ítem 16)

**Por qué se difirió:** es un `REVOKE` de privilegios sobre el **rol de aplicación**
de la base de datos, no un cambio de schema — no se puede aplicar con `db push` ni
probar en este entorno (no hay un rol de app separado ni la Supabase real aquí).
Coherente con [`../decisions/0002-sin-migraciones-hasta-produccion.md`](../decisions/0002-sin-migraciones-hasta-produccion.md).
A nivel de aplicación estas tablas ya son *append-only* (nada las edita tras insertar).
**Cuándo:** al configurar el rol de app en producción, junto con el baseline del ítem 1.
**Qué aplicar** (solo sobre las tablas de **libro** verdaderamente inmutables — NO sobre
`ventas`/`cajas_turnos`/`lotes_inventario`, que el app sí actualiza legítimamente:
anular, cerrar turno, FIFO — y cuya integridad se cuida en la capa de app, ADR 0001):

```sql
-- El rol de la aplicación puede INSERT y SELECT, pero nunca UPDATE/DELETE
-- sobre el libro contable: movimientos de efectivo, puentes de costo FIFO,
-- devoluciones e historial de precios son inmutables por construcción.
REVOKE UPDATE, DELETE ON movimientos_financieros           FROM app_role;
REVOKE UPDATE, DELETE ON detalle_venta_lotes               FROM app_role;
REVOKE UPDATE, DELETE ON detalle_devoluciones              FROM app_role;
REVOKE UPDATE, DELETE ON historial_precios_presentaciones  FROM app_role;
```

**Nota sobre convención de signos (mismo ítem 16):** ya quedó unificada en el Bloque 1.C
— se eliminó `caja_general` (que guardaba `monto` con signo) y hoy solo existe
`movimientos_financieros.monto`, siempre positivo, con `tipo_movimiento` + `cuenta_origen`/
`cuenta_destino`. No hay dos convenciones que reconciliar.

## Importante, no bloqueante

### 3. Trazabilidad de autor en operaciones financieras (hallazgo H8)

**Por qué se difirió:** requiere agregar `usuario_id` a varias tablas
(`ventas`, `movimientos_financieros`, `cajas_turnos`, `ajustes_inventario`),
un decorator `@CurrentUser()` nuevo y tocar 5 services distintos — se evaluó
explícitamente incluirlo en Fase 1 junto con los índices y se decidió
diferirlo por ser un cambio más invasivo y de menor urgencia mientras el
negocio siga operando con un solo cajero activo.
**Cuándo:** junto con la adopción de migraciones, o antes si el negocio
empieza a tener más de un cajero y se vuelve necesario saber quién hizo qué.

### 4. Cookie JWT httpOnly

**Por qué se difirió:** requiere que el backend gestione la cookie (hoy la
pone el frontend vía `js-cookie`, que no puede marcarla `httpOnly`). Es un
cambio de contrato cliente-servidor, no un fix aislado. Fase 2 sí agregó los
flags `Secure`/`SameSite=Lax` y alineó la expiración al JWT real (ver ADR
[`0008-cookie-flags`](../decisions/0008-cookie-flags.md)) — lo que queda
pendiente aquí es específicamente pasar a una cookie `httpOnly` gestionada
por el backend, que mitigaría robo del token vía XSS.
**Cuándo:** cuando se revise el contrato de autenticación cliente-servidor
de forma más amplia (posiblemente junto con la Fase 3 o al escalar el
frontend).

## Escalabilidad (activar solo si se necesita)

### 5. Store compartido (Redis) para el rate-limiter

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
- **H13 — Server Components:** todas las páginas del dashboard son Client
  Components con fetch en el navegador. Aprovechar RSC requeriría rediseñar
  el data-fetching de cada página (POS, inventario, movimientos, gastos,
  stats) — un proyecto propio, no un ajuste puntual. Quedó fuera de Fase 2
  a propósito (estaba mal listado en el plan original sin un ítem de alcance
  correspondiente).
- **H30 — Accesibilidad:** el logout es un `<div onClick>` (no operable por
  teclado) en vez de `<button>`; los ítems de navegación son `<Link><span>`
  con el estilo de botón en el `<span>` en vez del `<a>`. Bajo riesgo (no es
  un bug funcional), corrección pequeña y aislada a
  `dashboard/layout.tsx` — buen candidato para cuando se retome el frontend.
