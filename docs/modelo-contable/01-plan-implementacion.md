# Plan de Implementación — Bloque 1 (Modelo de Efectivo)

> **Estado:** Borrador para revisión conjunta · **Fecha:** 2026-07-05 · **Rama:** `feature/bloque1-modelo-contable`
>
> El *qué/porqué* está en [`00-especificaciones.md`](00-especificaciones.md).
> Avance real en [`02-bitacora.md`](02-bitacora.md).

## Estrategia

- **Progresiva por sub-fases**, cada una **backend + frontend** y verificable.
- **La columna vertebral (origen/destino, 1.C) va antes** de lo que se apoya en ella
  (retiros, gastos-bóveda, traslados). `usuario_id` (1.A) y Decimal (1.B) son
  independientes y van primero por ser transversales al schema.
- Cada sub-fase termina con `db push` (Postgres desechable) + `build` + `lint` +
  tests verdes, y merge `--no-ff` a `master`.

## Flujo Git y verificación

- Rama `feature/bloque1-modelo-contable`; commits por tarea; merge `--no-ff` a
  `master` al cerrar cada sub-fase; push de ambas a `origin`.
- **Schema:** `npx prisma validate` + `db push` contra Postgres desechable (Docker,
  `docker-compose.yml`). ⚠️ El `db push` a **Supabase real es paso manual del usuario**.
- **Backend:** `npm run build`, `npm run lint:check`, tests e2e (`npm run test:e2e`
  contra Postgres desechable).
- **Frontend:** `npm run build`, `npm run lint` (preview visual no disponible en este
  entorno — ver bitácora del rediseño).

---

## Sub-fases

### 1.A — Trazabilidad por usuario (`usuario_id`)  §5.2
**Objetivo:** persistir quién hace cada operación. Aditivo, bajo riesgo, primero.

- **Schema:** `usuario_id Int?` + FK a `usuarios` en `cajas_turnos`, `ventas`,
  `movimientos_financieros`, `ajustes_inventario` (+ índices).
- **Backend:** decorator `@CurrentUser()` (`src/auth/decorators/current-user.decorator.ts`);
  controllers de ventas, cajas-turnos, movimientos, ajustes inyectan `userId` y lo
  pasan al service; services lo persisten. Movimientos automáticos (traslados) → `null`
  o el usuario que dispara el cierre.
- **Frontend:** nada se rompe (aditivo); opcional mostrar autor en Movimientos.
- **Aceptación:** una venta/turno/movimiento/ajuste guarda el `usuario_id` del JWT.

### 1.B — Cantidades a `Decimal` (fraccionados)  §5.3
**Objetivo:** soportar venta por peso/fracción (D1=SÍ).

- **Schema:** `Decimal(12,3)` en `factor_conversion`, `cantidad_inicial`,
  `cantidad_disponible`, `detalle_ventas.cantidad`, `detalle_venta_lotes.cantidad_descargada`,
  `ajustes_inventario.cantidad_ajustada`.
- **Backend:** FIFO (`ventas.service.ts`) con `Prisma.Decimal`; DTOs aceptan decimales;
  validaciones de stock con Decimal. Revisar `compras`, `ajustes`, `presentaciones`.
- **Frontend:** inputs de cantidad con `step` decimal; formateo (hasta 3 decimales).
- **Aceptación:** vender "0.5" de un producto descuenta 0.5 del lote; FIFO cruza lotes
  con decimales sin error de redondeo.

### 1.C — Modelo origen→destino + bóveda derivada  §5.1 (ítem 4 + fugas C/D)
**Objetivo:** la columna vertebral. Conservación del efectivo por construcción.

- **Schema:** `cuenta_origen`/`cuenta_destino` (VarChar, nullable) en
  `movimientos_financieros`; **eliminar tabla `caja_general`** (bóveda pasa a derivada).
- **Backend:** refactor `movimientos_financieros.service` para setear origen/destino;
  helper de "saldo de bóveda derivado" (`Σ destino=BOVEDA − Σ origen=BOVEDA`);
  `caja_general.service` reescrito: `getSaldo()` deriva del libro, `inyectarCapital()`
  crea `INGRESO_CAPITAL` (DUEÑOS→BOVEDA), se elimina el `POST` genérico; reportes que
  leían la tabla pasan al libro.
- **Frontend:** `GET /caja-general/saldo` mantiene contrato → sin cambios visibles.
- **Aceptación:** test de conservación (suma de patas = 0 por cuenta de efectivo);
  saldo de bóveda coincide con el derivado; no queda puerta trasera de ajuste.

### 1.D — Retiro personal, "Sacar dinero" y gastos desde bóveda  §5.4 + §5.6
**Objetivo:** cerrar F1 y F2 sobre la base de 1.C.

- **Backend:** `RETIRO_PERSONAL` (GAVETA→DUEÑOS) en DTO+service; `movimientos.create`
  acepta `origen_fondos` (GAVETA|BOVEDA) para egresos/retiros; reportes suman "retiros
  de dueños".
- **Frontend:** botón **"Sacar dinero"** con 3 opciones (Guardar en bóveda / Pagar algo
  / Retiro personal); Gastos permite origen gaveta/bóveda.
- **Aceptación:** retiro personal no infla bóveda ni baja utilidad; se paga un gasto
  desde bóveda sin turno.

### 1.E — Traslados en cierre/apertura  §5.5 (ítem 3, F3)
**Objetivo:** que el flujo nocturno normal no se registre como faltante.

- **Backend:** `cerrar()` traslada el excedente a bóveda (`TRASLADO_A_BOVEDA`) según
  "cuánto queda en gaveta"; `abrir()` toma de bóveda si hace falta (`TRASLADO_DESDE_BOVEDA`)
  y **deja de generar** `AJUSTE_FALTANTE`/`INGRESO_CAPITAL` falsos. `AJUSTE_*` solo
  para descuadre real (declarado ≠ esperado).
- **Frontend:** rediseño del flujo de cierre (pregunta "¿cuánto queda para mañana?")
  y apertura en el POS.
- **Aceptación:** cerrar con $300, dejar $100, abrir con $100 → $200 en bóveda, cero
  faltantes; descuadre real sí genera `AJUSTE_FALTANTE`.

### 1.F — Carga inicial de inventario  §5.7 (ítem 7)
**Objetivo:** poder cargar el stock del día 1.

- **Backend:** flujo "inventario inicial" (compra con `origen_fondos = CAPITAL_DUEÑOS`,
  sin exigir pago de caja).
- **Frontend:** asistente "Cargar inventario inicial" en Inventario.
- **Aceptación:** cargar inventario inicial crea lotes sin turno ni pago, y queda
  contablemente como aporte del dueño.

---

## Seguimiento

| Sub-fase | Descripción | Estado |
|---|---|---|
| 1.A | Trazabilidad `usuario_id` | ⬜ Pendiente |
| 1.B | Cantidades a Decimal | ⬜ Pendiente |
| 1.C | Modelo origen→destino + bóveda derivada | ⬜ Pendiente |
| 1.D | Retiro personal + Sacar dinero + gastos bóveda | ⬜ Pendiente |
| 1.E | Traslados en cierre/apertura | ⬜ Pendiente |
| 1.F | Carga inicial de inventario | ⬜ Pendiente |

> Al cerrar el Bloque 1: actualizar `plan-fases.md` y el SRS a v3.0.
