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
- El motor FIFO (ver `data-model.md`) descuenta stock de los lotes más
  antiguos primero. Si no hay stock suficiente en ningún lote, la venta
  completa se rechaza (no hay ventas parciales).
- **Anular una venta** devuelve el stock exactamente a los lotes de donde
  salió, y reduce `efectivo_esperado` del turno — pero **solo si el turno
  sigue `ABIERTA`**. Anular una venta de un turno ya cerrado corrompería su
  cuadre histórico, así que está bloqueado.
- **Decisión de producto (2026-07, Fase 3): el sistema es solo efectivo, a
  propósito.** No existe ni se planea agregar el concepto de método de pago
  (tarjeta, transferencia). Toda venta incrementa `efectivo_esperado` por el
  total completo. Esto no es una limitación temporal — es una decisión
  explícita para no agregar complejidad que el negocio no necesita.

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
