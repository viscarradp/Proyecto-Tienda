# Bitácora — Bloque 1 (Modelo de Efectivo)

> Registro cronológico del avance. Fuente de verdad del **estado** — no confiar en
> la memoria de la conversación; leer aquí.

## Estado global

**Sub-fase actual:** 1.A completada; siguiente = 1.B (Decimal).

| Sub-fase | Estado | Notas |
|---|---|---|
| 1.A · `usuario_id` | ✅ Completada | 4 tablas + `@CurrentUser()`; e2e 7/7 verdes. |
| 1.B · Decimal (fraccionados) | ⬜ Pendiente | — |
| 1.C · origen→destino + bóveda derivada | ⬜ Pendiente | — |
| 1.D · retiro personal + gastos bóveda | ⬜ Pendiente | — |
| 1.E · traslados cierre/apertura | ⬜ Pendiente | — |
| 1.F · carga inicial inventario | ⬜ Pendiente | — |

---

## Entradas

### 2026-07-05 — Arranque
- Leído el `plan-fases.md`: Fases 0-3 del plan técnico original cerradas. El trabajo
  abierto es el **Bloque 1** de la [auditoría de negocio/contable](../auditorias/2026-07-04-auditoria-negocio-contable.md) §10.
- Explorado el backend (schema, servicios de movimientos/cajas/caja_general/ajustes,
  jwt.strategy). Diagnóstico F1-F7 documentado en [`00-especificaciones.md`](00-especificaciones.md) §3.
- Decisiones del usuario: **D1 fraccionados = SÍ** (Decimal), **D2 alcance = backend + frontend**.
- Decisión de diseño **D3**: bóveda derivada del libro origen/destino (single source of
  truth); se elimina la tabla `caja_general` como fuente y se arrastran las fugas C/D al
  Bloque 1 por estar acopladas al ítem 4.
- Creada la rama `feature/bloque1-modelo-contable` y `docs/modelo-contable/` con Specs + Plan.

### 2026-07-05 — Sub-fase 1.A: trazabilidad `usuario_id` ✅
- **Schema**: `usuario_id Int?` (FK a `usuarios`, `onDelete: SetNull`) + índice en
  `cajas_turnos`, `ventas`, `movimientos_financieros`, `ajustes_inventario`; back-relations
  en `usuarios`.
- **`@CurrentUser()`** (`src/auth/decorators/current-user.decorator.ts`) extrae `request.user`.
- Los controllers de ventas, cajas-turnos, movimientos y ajustes inyectan `userId` y lo
  pasan al service; se persiste en cada create (incluidos los movimientos automáticos de
  apertura/cierre y la merma). `userId` opcional para no romper llamadas internas/tests.
- **Verificación**: `prisma validate` OK, `build` limpio, `lint:check` 0 errores; **e2e
  7/7 verdes** contra Postgres desechable (`db push --force-reset` con consentimiento del
  usuario, patrón Fase 3).

---

## Decisiones (tracking)

| ID | Decisión | Estado |
|---|---|---|
| D1 | Fraccionados → Int vs Decimal | ✅ Decimal(12,3) propuesto |
| D2 | Alcance backend-only vs +frontend | ✅ Backend + frontend por sub-fase |
| D3 | Bóveda derivada vs tabla caja_general | ✅ Derivada (elimina caja_general) |
| — | Precisión decimal exacta | 🔲 Por confirmar (1.B) |
| — | Etiquetas/íconos "Sacar dinero" | 🔲 Por confirmar (1.D) |
