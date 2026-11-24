# Inventario

> Reglas vigentes (ciclo 2026-11). Verificadas contra `productos`, `presentaciones`, `compras`,
> `ajustes_inventario` y `common/pendientes-stock.ts`. Tablas: [`../architecture/data-model.md`](../architecture/data-model.md).

## Productos, presentaciones y factor

- `categorias` → `productos` → `presentaciones`. El stock se rastrea en la **unidad base** (la más chica) del producto.
- Una presentación tiene `factor_conversion` (cuántas unidades base representa: un six-pack = 6), `precio_venta` y un
  `codigo_barras` opcional y único (un `''` se guarda como `null`). El factor es **decimal** (0.001 a 99 999, hasta
  3 decimales) para vender por peso: si el producto se cuenta en kilos, una presentación de medio kilo tiene factor 0.5.
- Vender una presentación descuenta `cantidad × factor` unidades base. La UI muestra el stock **en la unidad de la
  presentación** (p. ej. "7 six-pack + 2 sueltas"), no en unidades base.
- Catálogo (crear/editar/borrar productos, presentaciones y categorías) y **precios**: solo la dueña. La cajera lee el
  catálogo y puede hacer **alta rápida**.

### Historial de precios

Cada vez que `PATCH /presentaciones/:id` cambia `precio_venta`, se guarda una fila en
`historial_precios_presentaciones` (precio anterior → nuevo, fecha, autor). Se lee con
`GET /presentaciones/:id/historial-precios`. Las ventas pasadas no cambian: el subtotal queda congelado en
`detalle_ventas`.

## Lotes y FIFO

- Cada **compra** genera uno o más **lotes** con su propio `costo_unitario_adquisicion` (hasta 4 decimales),
  `cantidad_inicial`, `cantidad_disponible`, `fecha_ingreso` (NOT NULL) y `fecha_vencimiento` opcional.
- La venta descarga del lote **más viejo primero** (`fecha_ingreso ASC, id ASC`), con `FOR UPDATE` sobre los lotes
  candidatos para impedir sobreventa concurrente ([ADR 0001](../decisions/0001-concurrencia-for-update.md)), y congela
  el costo real en `detalle_venta_lotes.costo_aplicado`.
- El valor del inventario (patrimonio) es `Σ cantidad_disponible × costo_unitario_adquisicion`.
- `GET /productos` devuelve por producto `stock_total`, `pendiente_total` y **solo los lotes con stock**.

## Deuda de stock (D-01: vender sin stock registrado)

Si al vender faltan unidades, la venta no se rechaza: lo que falta queda en `pendientes_stock` (en unidades base).

- **Costo congelado al estimado.** `costo_unitario_estimado` = costo del lote más reciente del producto (aunque esté
  agotado), o 0 si nunca tuvo lotes (el aviso dice que la ganancia saldrá alta). El estado de resultados y el margen
  por producto suman `cantidad_base × costo_unitario_estimado` de los pendientes de ventas `COMPLETADA` como costo de
  ventas, igual que el costo FIFO.
- **Resolución.** Cuando entra stock del producto —una **compra** nueva o un **conteo sobrante** (`CONTEO_SOBRANTE`)
  sobre un lote— se cubren los pendientes abiertos, del más viejo al más nuevo, descontando del lote lo pendiente
  (hasta donde alcance). Al llegar a 0 se marca `resuelto_en`; `lote_resuelto_id` guarda el último lote que cubrió algo.
- **Aproximación aceptada:** cubrir un pendiente **no** crea filas en `detalle_venta_lotes` ni cambia el costo ya
  congelado. La diferencia entre el costo estimado y el real se absorbe en el valor del inventario. **Excepción:** un
  estimado de $0 significa "no sabíamos el costo": al cubrirse (aunque sea en parte) pasa al costo del lote que lo
  cubre. Los estimados mayores a 0 siguen congelados.
- **Anular** la venta: lo no cubierto se cancela (`cantidad_pendiente = 0`); lo cubierto vuelve entero al último lote
  que lo cubrió. **Devolver** con `REINGRESO` baja la parte proporcional abierta o la devuelve al lote que la cubrió;
  con `MERMA` no cambia ([`ventas-y-devoluciones.md`](ventas-y-devoluciones.md)).
- Solo la compra y el sobrante de conteo cubren pendientes: un reingreso o una anulación que devuelven unidades a un
  lote no cubren pendientes de **otras** ventas hasta el siguiente ingreso.

## Alta rápida y "por revisar" (D-02)

Si lo que el cliente pide no está en el catálogo, la cajera lo da de alta con **nombre + precio**
(`POST /productos/rapido`, ADMIN y CAJERO) y lo vende en el acto. Queda en la categoría **"Por revisar"** (se crea
sola) con una presentación "Unidad" (factor 1; el nombre es opcional, p. ej. "Libra") y `productos.por_revisar = true`.
La dueña lo completa y lo marca revisado (`PATCH /productos/:id` con `por_revisar: false`, solo ADMIN). Un código de
barras repetido da 409 con el nombre del producto que ya lo tiene. Como no tiene lotes, su primera venta genera deuda
de stock con costo estimado 0 hasta que se registre la compra.

## Compras (solo ADMIN)

Registran lotes; el `monto_total` lo calcula el backend (suma por lote de `cantidad × costo`, cada lote redondeado a
2 decimales antes de sumar). Origen del dinero, crédito y abonos: [`dinero-y-cuentas.md`](dinero-y-cuentas.md). Al
crear los lotes se cubren los pendientes de stock de cada producto. La compra guarda quién la registró.

## Mermas y conteos (solo ADMIN)

`POST /ajustes-inventario` sobre un lote, con `tipo_ajuste`:

| Tipo | Efecto | Movimiento financiero |
|---|---|---|
| `QUEBRADO`, `VENCIDO`, `ROBO`, `CONTEO` | Resta del lote (no puede superar lo disponible, 400) | `MERMA_INVENTARIO` por `costo_asumido` (sin cuentas origen/destino) |
| `CONTEO_SOBRANTE` | **Suma** al lote (sin tope) y cubre pendientes de stock | Ninguno |

- `costo_asumido = cantidad × costo del lote`, redondeado a 2 decimales; es informativo/contable: **una merma no mueve
  efectivo** (es pérdida de inventario ya pagado), pero sí baja la utilidad en el estado de resultados.
- La merma se registra **haya o no turno abierto** (`caja_turno_id` nullable): una merma un domingo sin turno también
  llega al período correcto. Un sobrante no genera movimiento: su costo fluirá al venderse.
- Bloqueo del lote bajo `FOR UPDATE`; si hay turno abierto, se bloquea antes que el lote (orden global de locks).

## Pendiente (no construido todavía)

Buscador y cambio rápido de precio, alta de producto atómica, mermas registradas por la cajera, aviso al cambiar el
factor de una presentación con ventas (L11), reversos de compras/gastos/ajustes (L12): ver
[backlog](../roadmap/backlog-ciclo-2026-11.md).
