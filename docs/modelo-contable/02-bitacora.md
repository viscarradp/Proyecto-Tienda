# Bitácora — Bloque 1 (Modelo de Efectivo)

> Registro cronológico del avance. Fuente de verdad del **estado** — no confiar en
> la memoria de la conversación; leer aquí.

## Estado global

**Estado:** 🏁 **Bloque 1 COMPLETO** (1.A–1.F). Pendientes de cierre: meta-hallazgo (SRS v3) y follow-ups menores (ver abajo). El `db push` a Supabase real es paso manual del usuario.

| Sub-fase | Estado | Notas |
|---|---|---|
| 1.A · `usuario_id` | ✅ Completada | 4 tablas + `@CurrentUser()`; e2e 7/7 verdes. |
| 1.B · Decimal (fraccionados) | ✅ Completada | Cantidades a `Decimal(12,3)`; FIFO en Decimal; e2e 8/8 (nuevo test de media libra). |
| 1.C · origen→destino + bóveda derivada (+ ítem 6) | ✅ Completada | Cuentas origen/destino; `caja_general` eliminada (saldo derivado); gasto desde bóveda; fugas A/C/D cerradas; e2e 9/9 (nueva suite bóveda). |
| 1.D · retiro personal + "Sacar dinero" | ✅ Completada | `RETIRO_PERSONAL` (GAVETA→DUEÑOS); métrica retiros de dueños en reportes; diálogo "Sacar dinero" (3 opciones) en POS; e2e 10/10. |
| 1.E · traslados cierre/apertura | ✅ Completada | `TRASLADO_A_BOVEDA`/`TRASLADO_DESDE_BOVEDA`; apertura sin faltante falso (fuga F3); cierre con conteo físico + traslado; e2e 11/11. |
| 1.F · carga inicial de inventario | ✅ Completada | Flujo guiado "Inventario inicial" (compra `CAPITAL_DUEÑOS`, sin caja); fix `parseInt`→`parseFloat` en compras (fraccionado). |

### Follow-ups conocidos (no bloquean el Bloque 1)
- **Meta-hallazgo:** actualizar el SRS a v3.0 reflejando lo construido. Pendiente.
- **Venta fraccionada en el POS:** el backend ya vende decimales (verificado), pero el
  stepper del carrito del POS es entero. Falta un input de cantidad fraccionada en el
  POS para vender "0.5" desde la UI (la compra/inventario ya acepta decimales).
- **`db push` a Supabase real:** paso manual del usuario (aditivo salvo `DROP TABLE
  caja_general`, tabla vacía). Correr `cd erp-tienda-backend && npx prisma db push`.
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

### 2026-07-05 — Sub-fase 1.F: carga inicial de inventario ✅
- **Backend**: sin cambios — `compras` con `origen_fondos=CAPITAL_DUEÑOS` ya crea lotes
  como aporte del dueño en especie, sin salida de caja ni turno (ya lo ejercitan los e2e).
- **Frontend**: `CompraForm` gana un modo `inicial` (fuerza `CAPITAL_DUEÑOS`+`PAGADO`,
  oculta esos selectores, nota explicativa, labels "Inventario inicial"). La página de
  Inventario añade un botón **"Inventario inicial"** que abre ese flujo guiado.
- **Fix de fraccionados (1.B)**: `CompraForm` usaba `parseInt` para la cantidad (truncaba
  decimales) → `parseFloat`; input con `step="0.001"`, min > 0.
- **Verificación**: frontend build+lint limpios.

### 2026-07-05 — Sub-fase 1.E: traslados gaveta↔bóveda en cierre/apertura ✅
- **`cajas_turnos.service`**:
  - `abrir()`: **eliminada la comparación contra el último cierre** que inventaba
    `AJUSTE_FALTANTE`/`INGRESO_CAPITAL` (fuga F3). Opcional `desde_boveda` → registra
    `TRASLADO_DESDE_BOVEDA` (BOVEDA→GAVETA) validando el saldo derivado bajo lock.
  - `cerrar()`: el descuadre se calcula sobre el **conteo físico** vs esperado (solo
    descuadres reales → `AJUSTE_*`); nuevo `monto_a_boveda` → `TRASLADO_A_BOVEDA`
    (GAVETA→BOVEDA). `getUltimoCierre` deriva el fondo siguiente = declarado − traslado.
- **DTOs**: `close` gana `monto_a_boveda`, `create` gana `desde_boveda`.
- **Frontend POS**: el cierre envía el conteo físico + `monto_a_boveda` (el backend
  hace el traslado; se quitó el `RETIRO_BOVEDA` manual). La apertura ya no muestra el
  mensaje engañoso de "se registrará como inyección/faltante".
- **Verificación**: backend build+lint limpios, **e2e 11/11** (nuevo test: cerrar con
  traslado sube la bóveda 60 sin faltante, reabrir con menos no inventa faltante).
  Frontend build+lint limpios.

### 2026-07-05 — Sub-fase 1.D: retiro personal + "Sacar dinero" ✅
- **Backend**: nuevo tipo `RETIRO_PERSONAL` (GAVETA→DUEÑOS) en DTO + switch de
  `movimientos.service` (baja la gaveta, no toca bóveda, no exige categoría).
  `reportes.getEstadoResultados` añade `retiros_duenos` (distribución de patrimonio,
  **no resta la utilidad**) para el insight "el negocio ganó $X y vos retiraste $Y".
- **Frontend**: `components/pos/SacarDineroDialog.tsx` — un botón **"Sacar dinero"** en
  el POS (con caja abierta) con 3 opciones: *Guardar en bóveda* (RETIRO_BOVEDA),
  *Pagar algo* (EGRESO_OPERATIVO), *Retiro personal* (RETIRO_PERSONAL). Estadísticas
  muestra "Retiros de dueños" bajo la utilidad neta.
- **Verificación**: backend build+lint limpios, **e2e 10/10** (nuevo test de retiro
  personal: baja gaveta, bóveda intacta, aparece como retiro no gasto). Frontend build+lint limpios.

### 2026-07-05 — Sub-fase 1.C: origen→destino + bóveda derivada (+ ítem 6) ✅
- **Decisión de alcance**: se fusionó el ítem 6 (gastos desde bóveda) en 1.C, porque
  eliminar `caja_general` obliga a enrutar el gasto-desde-bóveda por el nuevo modelo.
  Así se cierran las fugas A/C/D juntas.
- **Schema**: `cuenta_origen`/`cuenta_destino` (VarChar nullable) + índices en
  `movimientos_financieros`; **tabla `caja_general` eliminada** (bóveda derivada).
- **`common/cuentas-efectivo.ts`**: catálogo cerrado (GAVETA/BOVEDA/DUEÑOS/GASTO/
  PROVEEDOR), `BOVEDA_LEDGER_LOCK` y `saldoBovedaDerivado` (`Σ destino=BOVEDA − Σ origen=BOVEDA`).
- **`movimientos.service`**: setea origen/destino por tipo; acepta `origen_fondos`
  (GAVETA|BOVEDA); egreso desde bóveda no exige turno y valida saldo derivado bajo lock.
- **`compras.service`** (rama CAJA_GENERAL): crea `PAGO_PROVEEDOR` BOVEDA→PROVEEDOR;
  autor cableado. **`caja_general.service`**: `getSaldo` derivado, `inyectarCapital`→
  `INGRESO_CAPITAL` DUEÑOS→BOVEDA, **POST genérico eliminado** (fuga D). Movimientos
  automáticos de apertura/cierre con sus cuentas.
- **Frontend**: Gastos enruta el gasto-desde-bóveda por `/movimientos-financieros`
  (origen_fondos=BOVEDA); categoría requerida para ambos orígenes.
- **Verificación**: prisma validate OK, backend build+lint limpios, **e2e 9/9** (nueva
  suite `boveda.e2e-spec.ts`: inyección→saldo derivado→gasto desde bóveda sin turno→
  validación de fondos). Frontend build+lint limpios.

### 2026-07-05 — Sub-fase 1.B: cantidades a `Decimal` (fraccionados) ✅
- **Schema**: `Int → Decimal(12,3)` en `presentaciones.factor_conversion`,
  `lotes_inventario.cantidad_inicial`/`cantidad_disponible`, `detalle_ventas.cantidad`,
  `detalle_venta_lotes.cantidad_descargada`, `ajustes_inventario.cantidad_ajustada`.
- **Motor FIFO** (`ventas.service.ts`) reescrito con `Prisma.Decimal` (`.mul`, `.sub`,
  `Prisma.Decimal.min`, `.greaterThan`) — antes usaba `number`/`Math.min`.
- **DTOs**: `@IsInt`→`@IsNumber({maxDecimalPlaces:3})` en venta, ajuste, compra (lote) y
  presentación. `common/concurrency.ts`: `cantidad_disponible` del row FIFO → Decimal|string.
- **compras.service** (`montoCalculado` y validaciones de fondos) y **reportes.service**
  (`unidadesBase`) migrados a Decimal.
- **Tests**: helper del FIFO parsea Decimales (JSON los serializa como string); **nuevo
  test de venta fraccionada** (media libra → lote 3 queda en 2.5).
- **Verificación**: `prisma validate` OK, build limpio, `lint:check` 0 errores, **e2e 8/8**.

---

## Decisiones (tracking)

| ID | Decisión | Estado |
|---|---|---|
| D1 | Fraccionados → Int vs Decimal | ✅ Decimal(12,3) propuesto |
| D2 | Alcance backend-only vs +frontend | ✅ Backend + frontend por sub-fase |
| D3 | Bóveda derivada vs tabla caja_general | ✅ Derivada (elimina caja_general) |
| — | Precisión decimal exacta | 🔲 Por confirmar (1.B) |
| — | Etiquetas/íconos "Sacar dinero" | 🔲 Por confirmar (1.D) |
