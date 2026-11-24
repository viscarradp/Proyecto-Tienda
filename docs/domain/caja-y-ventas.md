# Reglas de Negocio — Caja y Ventas

Esto documenta el *comportamiento esperado* del negocio, no la implementación
línea por línea (para eso está el código y `architecture/data-model.md`).

## Turnos de caja

- Solo puede haber **un turno `ABIERTA` a la vez**. Abrir un turno nuevo
  mientras hay uno abierto debe rechazarse (`CajasTurnosService.abrir()`).
- Al abrir un turno, si el fondo inicial declarado no coincide con lo que
  quedó en la gaveta en el cierre anterior, el sistema registra
  automáticamente un `INGRESO_CAPITAL` (si es mayor) o `AJUSTE_FALTANTE`
  (si es menor) — nadie tiene que hacerlo a mano.
- Al cerrar un turno, se compara `efectivo_declarado` (conteo físico) contra
  `efectivo_esperado` (lo que el sistema calculó); la diferencia genera
  automáticamente un `AJUSTE_FALTANTE` o `AJUSTE_SOBRANTE` si supera un
  centavo de tolerancia.
- Una vez cerrado, un turno es **inmutable**: su `diferencia` es un cuadre
  histórico. Ninguna operación posterior (como anular una venta de ese turno)
  debe modificar su `efectivo_esperado`.

## Ventas

- Toda venta requiere un turno `ABIERTA`.
- El **total lo calcula siempre el backend** a partir de las presentaciones y
  cantidades enviadas — nunca se confía en un total declarado por el cliente.
- **Idempotencia:** `POST /ventas` acepta el header opcional
  `Idempotency-Key` (texto de 8 a 64 caracteres, p. ej. un UUID). Si llega una
  segunda petición con la misma clave, devuelve la venta ya creada sin tocar
  stock ni efectivo; así un reintento tras un corte de red no duplica la venta.
  Sin el header todo funciona como antes.
- **Redondeo por línea:** cada línea vale `cantidad × precio` redondeado a 2
  decimales (mitad hacia arriba) **antes** de sumar; `ventas.total` y el
  aumento de `efectivo_esperado` son la suma de esas líneas redondeadas. En una
  devolución parcial el reembolso se prorratea y redondea por línea, y cuando
  la línea queda devuelta por completo se reembolsa exactamente el saldo
  (subtotal − ya reembolsado); lo mismo para `costo_revertido`.
- El motor FIFO (ver `data-model.md`) descuenta stock de los lotes más
  antiguos primero. **Si no hay stock suficiente la venta NO se rechaza**: se
  vende igual y se avisa (ver «Venta sin stock registrado» más abajo).
- **Anular una venta** devuelve el stock exactamente a los lotes de donde
  salió, y reduce `efectivo_esperado` del turno — pero **solo si el turno
  sigue `ABIERTA`**. Anular una venta de un turno ya cerrado corrompería su
  cuadre histórico, así que está bloqueado. **Una venta que ya tiene alguna
  devolución no se puede anular** (409): revertirla completa duplicaría el
  stock y el efectivo ya devueltos; para el resto de los productos se usa
  «Devolver». La anulación bloquea turno y luego venta (`FOR UPDATE`) y
  re-valida bajo lock, así que un doble clic no revierte dos veces.
- **Decisión de producto (2026-07, Fase 3): el sistema es solo efectivo, a
  propósito.** No existe ni se planea agregar el concepto de método de pago
  (tarjeta, transferencia). Toda venta incrementa `efectivo_esperado` por el
  total completo. Esto no es una limitación temporal — es una decisión
  explícita para no agregar complejidad que el negocio no necesita.

### Venta por monto

Principio «apoyar, no imponer»: se vende por peso o suelto («dame $1 de
queso»). Cada línea de `POST /ventas` lleva **exactamente uno** de `cantidad` o
`monto` (400 si vienen los dos o ninguno). Con `monto` (0.01 a 999 999.99, 2
decimales) el backend calcula `cantidad = monto ÷ precio_venta`, redondeada
mitad hacia arriba a 3 decimales, y el **subtotal es exactamente el monto**
pedido. Un producto con precio $0 no se puede vender por monto (400).

### Venta sin stock registrado (deuda de stock)

Si el sistema cree que no hay stock, **se vende igual y se avisa**. El FIFO
consume los lotes disponibles; lo que falta queda en `pendientes_stock`
(«deuda de stock») y la respuesta de la venta trae `avisos` (un texto por línea
afectada, en la unidad de la presentación).

- **Costo congelado al estimado.** El pendiente guarda
  `costo_unitario_estimado` = costo del lote más reciente del producto (aunque
  esté agotado) o 0 si nunca tuvo lotes (el aviso lo dice: la ganancia saldrá
  alta). El estado de resultados y el margen por producto suman
  `cantidad_base × costo_unitario_estimado` de los pendientes de ventas
  COMPLETADA como parte del costo de ventas, igual que el costo FIFO.
- **Resolución.** Cuando entra stock del producto (una compra nueva o un conteo
  `CONTEO_SOBRANTE` sobre un lote) se cubren los pendientes abiertos, del más
  viejo al más nuevo, descontando del lote lo pendiente (hasta donde alcance).
  Si llega a 0 se marca `resuelto_en`; `lote_resuelto_id` guarda el último lote
  que cubrió algo.
- **Aproximación aceptada:** cubrir un pendiente NO crea filas en
  `detalle_venta_lotes` ni cambia el costo ya congelado. La diferencia entre el
  costo estimado y el costo real del lote que lo cubrió no se corrige: se
  absorbe en el valor del inventario. **Excepción:** un estimado de $0 significa
  «no sabíamos el costo», no un costo real; al cubrir ese pendiente (aunque sea
  en parte) su `costo_unitario_estimado` pasa al costo del lote que lo cubre, y
  el estado de resultados muestra el costo verdadero. Los estimados mayores a 0
  siguen congelados. Si un pendiente lo cubrieron varios lotes,
  lo cubierto vuelve entero al último si la venta se anula.
- **Anular** una venta con pendientes: la parte no cubierta se cancela
  (`cantidad_pendiente = 0`) y la cubierta vuelve a su lote.
- **Devolver** (proporcional por línea): el costo de la línea incluye el
  estimado de sus pendientes. Con destino REINGRESO la parte proporcional del
  pendiente baja si sigue abierta (la unidad volvió al estante) o vuelve al lote
  que la cubrió; con MERMA el pendiente no cambia (la compra igual debe cubrirlo).
- **Inventario:** `GET /productos` trae por producto `stock_total`,
  `pendiente_total` y solo los lotes con stock.
- Hoy solo la compra y el sobrante de conteo cubren pendientes; una anulación o
  un reingreso que devuelve unidades a un lote no cubre pendientes de otras
  ventas hasta el siguiente ingreso.

### Alta rápida

Si un producto no está en el catálogo, la cajera lo da de alta con nombre +
precio (`POST /productos/rapido`, roles ADMIN y CAJERO) y puede venderlo en el
acto. Queda en la categoría «Por revisar» con una presentación «Unidad»
(factor 1; el nombre de la presentación es opcional con `descripcion`, p. ej.
«Libra») y `por_revisar = true`; la dueña lo completa y lo marca revisado
(`PATCH /productos/:id` con `por_revisar: false`, solo ADMIN). Un código de
barras repetido da 409 con el nombre del producto que ya lo tiene.

## Compras y pago

- Una compra genera lotes de inventario y, según `origen_fondos`, puede
  impactar la caja del día (`CAJA_POS`), la bóveda (`CAJA_GENERAL`) o no
  impactar ninguna caja (`CAPITAL_DUEÑOS`, capital propio inyectado fuera del
  flujo de caja registrado).
- Una compra `AL_CREDITO` genera una deuda (`cuentas_por_pagar`) y **no**
  puede simultáneamente descontar de una caja real (sería pagarla dos veces).
- El `monto_total` de la compra lo calcula el backend sumando los lotes
  declarados — nunca se confía en un monto declarado por el cliente.

## Movimientos financieros

Tipos reconocidos por el sistema (`movimientos_financieros.tipo_movimiento`):

| Tipo | Efecto en `efectivo_esperado` del turno |
|---|---|
| `INGRESO_CAPITAL` | Incrementa |
| `EGRESO_OPERATIVO` | Decrementa (requiere categoría de gasto) |
| `RETIRO_BOVEDA` | Decrementa (y se refleja como ingreso en `caja_general`) |
| `PAGO_PROVEEDOR` | Decrementa (generado automáticamente por una compra `CAJA_POS`) |
| `AJUSTE_FALTANTE` / `AJUSTE_SOBRANTE` | Generados automáticamente al abrir/cerrar turno |

Ningún egreso puede dejar `efectivo_esperado` en negativo — se valida antes
de aplicar el movimiento.

## Mermas

Registrar una merma (`ajustes_inventario`) reduce el stock del lote afectado
y calcula la pérdida económica (`costo_asumido` = cantidad × costo de
adquisición de ese lote). Es informativa/contable: no mueve efectivo de
ninguna caja (una merma no es una salida de dinero, es una pérdida de
inventario ya pagado).
