# Especificaciones — Modelo de Efectivo y Trazabilidad (Bloque 1)

> **Estado:** Borrador para revisión conjunta · **Fecha:** 2026-07-05 · **Rama:** `feature/bloque1-modelo-contable`
>
> Fuente de verdad de la remediación del modelo contable. El *qué* y el *porqué*
> viven aquí; el *cómo/cuándo* en [`01-plan-implementacion.md`](01-plan-implementacion.md);
> el avance real en [`02-bitacora.md`](02-bitacora.md).
>
> **Origen:** [auditoría de negocio/contable 2026-07-04](../auditorias/2026-07-04-auditoria-negocio-contable.md), sección 10 "Priorización final", **Bloque 1**.

---

## 1. Propósito y alcance

Cerrar las fallas del **modelo de flujo de efectivo** del ERP **antes de la primera
venta real**, mientras la base de datos está vacía y cualquier cambio de schema es
un `db push` barato (ADR [`0002`](../decisions/0002-sin-migraciones-hasta-produccion.md)).
Después de la primera venta, varios de estos cambios se vuelven **irreversibles**
(la atribución por usuario) o requieren migraciones de datos dolorosas.

**Este documento cubre el Bloque 1** (7 ítems). Los Bloques 2 y 3 de la auditoría
se listan en "Fuera de alcance" y se abordarán después; el diseño aquí los deja
preparados (no los bloquea).

**Alcance por sub-fase:** cada sub-fase entrega **backend + la adaptación de
frontend** necesaria para que la app siga usable de punta a punta (decisión del
usuario, ver §10).

## 2. Contexto y decisiones tomadas

- **Ventana:** instancia desplegada **sin datos reales**. El "reloj de costo"
  arranca con la primera venta. Objetivo: cerrar el modelo antes de ese día.
- **Usuario final:** dueña de tienda de colonia, no-contadora. La contabilidad
  correcta debe ocurrir **detrás de cámaras**; la cajera hace pocos toques.
- **D1 — Ventas fraccionadas: SÍ.** La tienda vende por peso/fracción (queso por
  libra, granel). → `cantidad`/`factor_conversion` pasan de `Int` a `Decimal`.
- **D2 — Alcance: backend + frontend** por sub-fase.

## 3. Diagnóstico (qué está mal hoy)

Verificado contra el código (`erp-tienda-backend/src/`). Cada fuga comparte una
causa raíz: **movimientos de efectivo con una sola pata** (no declaran de qué
cuenta sale ni a cuál entra el dinero).

| # | Problema | Evidencia en código | Sección auditoría |
|---|----------|---------------------|-------------------|
| F1 | **Retiro personal de la dueña no existe.** Registrarlo como `RETIRO_BOVEDA` infla la bóveda; como `EGRESO_OPERATIVO` deprime la utilidad. | `create-movimientos_financiero.dto.ts` (solo 3 tipos) | §2 |
| F2 | **Imposible pagar gastos desde la bóveda.** `MovimientosFinancieros.create` exige turno abierto y siempre descuenta gaveta. | `movimientos_financieros.service.ts:20-28` | §3 fuga A |
| F3 | **El flujo nocturno se registra como "faltante".** `abrir()` compara fondo vs último cierre → `AJUSTE_FALTANTE`/`INGRESO_CAPITAL` falsos. | `cajas_turnos.service.ts:56-81` | §3 fuga B |
| F4 | **`inyectarCapital` invisible para la contabilidad.** Crea fila en bóveda sin `movimiento_financiero` de origen. | `caja_general.service.ts:40-53` | §3 fuga C |
| F5 | **Puerta trasera de ajuste manual.** `POST /caja-general` genérico crea filas arbitrarias. | `caja_general.service.ts:10-29` | §3 fuga D |
| F6 | **Ninguna tabla transaccional tiene `usuario_id`.** No se puede auditar cuál cajera. El JWT ya expone `userId` en `request.user`. | schema + `jwt.strategy.ts:27-33` | §5 |
| F7 | **Cantidades enteras.** `Int` no representa venta fraccionada (D1 = sí se vende). | schema (`Int` en presentaciones/lotes/detalle) | §6 |

## 4. Principios de diseño

1. **Escalabilidad ante todo, sin sobreingeniería** (reglas del proyecto, `plan-fases.md`).
   No es partida doble completa ni multi-tenant — es su versión mínima proporcional
   a una tienda de colonia.
2. **Conservación del efectivo por construcción:** todo movimiento de efectivo
   declara **cuenta origen** y **cuenta destino**. Nada entra a una cuenta sin salir
   de otra. Esta es la causa-raíz-fix de F1-F5.
3. **Una sola fuente de verdad para cada saldo:** el saldo de bóveda se **deriva**
   del libro de movimientos, no se mantiene en paralelo (elimina F4/F5 por diseño).
4. **La contabilidad correcta es invisible para la cajera:** un botón "Sacar dinero"
   con 3 opciones grandes traduce la intención a los asientos correctos por detrás.
5. **Sin migraciones todavía:** cambios de schema vía `db push` (ADR 0002). El
   `db push` contra la Supabase real es un **paso manual del usuario** (este entorno
   no tiene credenciales; se verifica contra un Postgres desechable, como Fases 0-1).
6. **Preservar lo que ya está bien:** motor FIFO con locks, congelado de costos por
   lote, "merma no toca efectivo". No se tocan salvo lo mínimo (Decimal en FIFO).

## 5. Diseño de la solución

### 5.1 Modelo origen→destino (la columna vertebral — ítem 4)

Se añaden a `movimientos_financieros` dos columnas de un **catálogo cerrado de 5
cuentas**:

| Cuenta | Significado | ¿Efectivo físico? |
|---|---|---|
| `GAVETA` | Caja registradora del turno (`efectivo_esperado`) | Sí |
| `BOVEDA` | Bóveda / caja general (dinero guardado) | Sí |
| `DUEÑOS` | Patrimonio del dueño (capital que entra/sale del negocio) | No (externa) |
| `GASTO` | Gasto operativo (P&L) | No (externa) |
| `PROVEEDOR` | Pago de inventario a proveedor | No (externa) |

**Invariante:** cada movimiento de efectivo mueve `monto` (positivo) de
`cuenta_origen` a `cuenta_destino`. `GAVETA` y `BOVEDA` son cuentas de efectivo real
(su saldo = dinero físico); las otras tres son contrapartes externas.

**Mapa tipo → (origen, destino)** — el `tipo_movimiento` se conserva como etiqueta
semántica para UX/reportes; `(origen, destino)` es la verdad para conservación y saldos:

| tipo_movimiento | origen | destino | Efecto GAVETA | Efecto BOVEDA |
|---|---|---|---|---|
| (venta, vía `ventas`) | — | GAVETA | +total | — |
| `INGRESO_CAPITAL` (a gaveta) | DUEÑOS | GAVETA | +monto | — |
| `INGRESO_CAPITAL` (a bóveda) | DUEÑOS | BOVEDA | — | +monto |
| `RETIRO_PERSONAL` | GAVETA | DUEÑOS | −monto | — |
| `TRASLADO_A_BOVEDA` | GAVETA | BOVEDA | −monto | +monto |
| `TRASLADO_DESDE_BOVEDA` | BOVEDA | GAVETA | +monto | −monto |
| `EGRESO_OPERATIVO` (gaveta) | GAVETA | GASTO | −monto | — |
| `EGRESO_OPERATIVO` (bóveda) | BOVEDA | GASTO | — | −monto |
| `PAGO_PROVEEDOR` (gaveta) | GAVETA | PROVEEDOR | −monto | — |
| `PAGO_PROVEEDOR` (bóveda) | BOVEDA | PROVEEDOR | — | −monto |
| `AJUSTE_FALTANTE` (descuadre real) | GAVETA | GASTO | −monto | — |
| `AJUSTE_SOBRANTE` (descuadre real) | GASTO | GAVETA | +monto | — |
| `MERMA_INVENTARIO` | *(null)* | *(null)* | — | — |

- **`MERMA_INVENTARIO` no es un movimiento de efectivo** (pérdida de inventario, no
  de gaveta). Sus columnas origen/destino quedan **nulas**; la invariante de
  conservación aplica solo a movimientos con ambas cuentas seteadas. El inventario
  sigue siendo su propio libro (lotes).
- **Saldos derivados:**
  - `GAVETA` de un turno = `efectivo_esperado` (se sigue manteniendo incrementalmente
    en `cajas_turnos` para lecturas rápidas y validación de fondos bajo lock).
  - `BOVEDA` = `Σ(mov. destino=BOVEDA) − Σ(mov. origen=BOVEDA)`. **Se deriva del libro**;
    la tabla `caja_general` deja de ser fuente de verdad.

**Consecuencia — se resuelven F4 y F5 aquí mismo** (están inseparablemente unidas al
ítem 4): `inyectarCapital` pasa a ser un movimiento `INGRESO_CAPITAL` (DUEÑOS→BOVEDA);
el `POST /caja-general` genérico se elimina. El endpoint `GET /caja-general/saldo` se
conserva (mismo contrato para el frontend) pero recalcula desde el libro. *(El arqueo
de bóveda formal — declarado vs esperado — es Bloque 2.)*

### 5.2 Trazabilidad por usuario (ítem 1 — F6)

- `usuario_id Int?` (FK a `usuarios`, nullable) en `cajas_turnos`, `ventas`,
  `movimientos_financieros`, `ajustes_inventario`.
- Nuevo decorator `@CurrentUser()` que extrae `request.user` (ya poblado por
  `JwtStrategy.validate` → `{ userId, nombre, rol }`).
- Cada controller pasa `userId` a su service; el service lo persiste.
- Nullable porque hay filas de sistema (p. ej. traslados automáticos) y para no
  romper si falta; pero las operaciones de cajera siempre lo llevan.

### 5.3 Cantidades a `Decimal` (ítem 5 — F7, D1=SÍ)

- `presentaciones.factor_conversion`, `lotes_inventario.cantidad_inicial` y
  `cantidad_disponible`, `detalle_ventas.cantidad`, `detalle_venta_lotes.cantidad_descargada`,
  `ajustes_inventario.cantidad_ajustada` → `Decimal(12,3)` (3 decimales: soporta
  gramos/onzas; ajustable).
- El motor FIFO (`ventas.service.ts`) opera con `Prisma.Decimal` en vez de `number`.
- DTOs aceptan decimales (`@IsNumber` con `maxDecimalPlaces`); validaciones de stock
  comparan Decimales.
- Frontend: inputs de cantidad aceptan decimales; formateo con hasta 3 decimales.

### 5.4 Retiro personal + "Sacar dinero" (ítem 2 — F1)

- Nuevo `tipo_movimiento` = `RETIRO_PERSONAL` (GAVETA→DUEÑOS): resta `efectivo_esperado`
  (cero fricción al cierre), **no** toca bóveda, se acumula como "Retiros de dueños".
- Reportes: cuenta "Retiros de dueños del período" = `Σ(destino=DUEÑOS)` (o por tipo),
  para explicar "el negocio ganó $X y vos retiraste $Y".
- **Frontend:** un botón **"Sacar dinero"** con 3 opciones grandes:
  *Guardar en bóveda* (`TRASLADO_A_BOVEDA`) · *Pagar algo* (`EGRESO_OPERATIVO`/`PAGO_PROVEEDOR`)
  · *Retiro personal* (`RETIRO_PERSONAL`). Tres toques, contabilidad correcta detrás.

### 5.5 Traslados gaveta↔bóveda en cierre/apertura (ítem 3 — F3)

- **Cierre:** además de declarar el efectivo contado, pregunta **"¿cuánto queda en
  gaveta para mañana?"**. El resto se traslada a bóveda automáticamente
  (`TRASLADO_A_BOVEDA`). `AJUSTE_FALTANTE`/`AJUSTE_SOBRANTE` quedan **reservados solo
  para descuadres reales** (declarado ≠ esperado).
- **Apertura:** si el fondo necesario supera el remanente en gaveta, se toma de bóveda
  (`TRASLADO_DESDE_BOVEDA`). Se **elimina** la lógica que generaba `AJUSTE_FALTANTE`/
  `INGRESO_CAPITAL` falsos al comparar contra el último cierre.
- **Frontend:** el diálogo de cierre del POS (ya rediseñado) cambia su flujo; la
  apertura idem.

### 5.6 Gastos y retiros pagables desde bóveda (ítem 6 — F2)

- `MovimientosFinancieros.create` acepta un `origen_fondos` (`GAVETA` | `BOVEDA`),
  simétrico a lo que ya hacen las compras.
  - `GAVETA`: exige turno abierto, valida y descuenta `efectivo_esperado` (como hoy).
  - `BOVEDA`: no exige turno; valida saldo de bóveda derivado y descuenta de bóveda.
- **Frontend:** la pantalla de Gastos (ya rediseñada) permite elegir el origen; el
  select ya existe (POS/Bóveda) — se conecta a la nueva mecánica.

### 5.7 Carga inicial de inventario (ítem 7)

- Flujo guiado de **"inventario inicial"**: registra el stock del día 1 como una
  compra con `origen_fondos = CAPITAL_DUEÑOS` (aporte en especie), contablemente
  correcto, pero presentado como un paso explícito, no un truco.
- **Backend:** endpoint/ópción dedicada (reutiliza `compras` con marca de "inicial")
  que crea lotes sin exigir pago de caja.
- **Frontend:** un asistente "Cargar inventario inicial" en Inventario.

## 6. Impacto en el frontend (pantallas afectadas)

| Pantalla | Cambio |
|---|---|
| POS — cierre/apertura de caja | Nuevo flujo de traslado a bóveda (§5.5) |
| POS / global — "Sacar dinero" | Nuevo flujo de 3 opciones (§5.4) |
| Gastos | Elegir origen gaveta/bóveda (§5.6) |
| Inventario | Asistente de inventario inicial (§5.7); cantidades decimales (§5.3) |
| Movimientos / Estadísticas | Mostrar retiros de dueños; saldo de bóveda derivado |

## 7. Restricciones y no-funcionales

- **Sin migraciones Prisma** (ADR 0002): `db push`. El push a Supabase real es paso
  manual del usuario. Verificación en Postgres desechable (Docker) como Fases 0-1.
- **Agnóstico de proveedor:** nada se ata a GCP/AWS/Supabase; todo por env.
- **Concurrencia preservada:** los `FOR UPDATE`/advisory locks y el **orden lock-antes-de-INSERT**
  (ADR 0001) se mantienen en todo movimiento nuevo.
- **Git:** rama `feature/bloque1-modelo-contable`, merge `--no-ff` a `master` por
  sub-fase, push a `origin`.
- **Tests:** extender los e2e (Fase 3) para cubrir los invariantes nuevos
  (conservación origen/destino, retiro personal, traslados, gasto desde bóveda).

## 8. Fuera de alcance (Bloques 2 y 3)

- Faltantes/sobrantes al P&L; merma sin turno; umbral de tolerancia; cierre forzado
  ADMIN; arqueo de bóveda formal; backup automatizado; ajustes positivos de inventario
  (Bloque 2).
- Devoluciones post-turno; modo contingencia sin internet; endpoint de patrimonio y
  flujo de efectivo en dashboard; historial de precios; desempate FIFO; inmutabilidad
  a nivel BD; depreciación/DTE/multi-tienda (Bloque 3).
- **Actualizar el SRS a v3.0** (meta-hallazgo) — se hará al cerrar el bloque.

## 9. Criterios de aceptación (Bloque 1)

1. Toda operación de cajera persiste `usuario_id`.
2. Todo movimiento de efectivo tiene `(origen, destino)` de las 5 cuentas; la suma
   por cuenta conserva el efectivo (verificable por test).
3. El saldo de bóveda se deriva del libro; no hay puerta trasera de ajuste manual.
4. `RETIRO_PERSONAL` existe y no infla bóveda ni deprime la utilidad.
5. Cierre/apertura ya no generan `AJUSTE_FALTANTE`/`INGRESO_CAPITAL` falsos; el
   traslado a bóveda es explícito.
6. Se puede pagar un gasto desde bóveda sin turno abierto.
7. Cantidades fraccionadas funcionan de punta a punta (venta de "media libra").
8. Existe un flujo guiado de inventario inicial.
9. La app frontend sigue funcional en cada sub-fase; `build`+`lint`+tests verdes.

## 10. Decisiones

- **D1 — Fraccionados:** ✅ SÍ → `Decimal`.
- **D2 — Alcance:** ✅ Backend + frontend por sub-fase.
- **D3 — Bóveda derivada vs tabla `caja_general`:** ✅ **derivada del libro**
  (single source of truth). `caja_general` se elimina como fuente; el endpoint de
  saldo se conserva recalculando. Decisión de implementación siguiendo el principio
  de escalabilidad; arrastra las fugas C/D al Bloque 1 por estar acopladas al ítem 4.
- **Abiertas (para confirmar en su sub-fase):** precisión decimal exacta (propuesto
  `Decimal(12,3)`); etiqueta/íconos del flujo "Sacar dinero".
