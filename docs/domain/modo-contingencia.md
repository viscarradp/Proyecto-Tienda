# Modo contingencia (cuando se cae el internet)

> **Origen:** [auditoría de negocio §9](../auditorias/2026-07-04-auditoria-negocio-contable.md) (talón de Aquiles: 100% cloud + internet doméstica) y Bloque 3.D, ítem 14.
> **Decisión de diseño:** *no* se implementa offline-first (sincronización, colas locales, resolución de conflictos FIFO) — sería sobreingeniería para una tienda de colonia. En su lugar, un **proceso de contingencia diseñado**, barato y honesto.
> Reglas de la venta en general: [`ventas-y-devoluciones.md`](ventas-y-devoluciones.md).

## El problema

El sistema es 100% en la nube: cada venta necesita internet. Cuando la conexión
se caiga (y se va a caer), la cajera no puede registrar ventas en vivo. Sin un plan,
la tienda vuelve al cuaderno — y cada regreso al cuaderno erosiona la adopción.

## El proceso

1. **Durante el apagón** — la cajera sigue vendiendo y anota cada venta en una **hoja
   física** simple: hora aproximada, artículos y monto. (El efectivo entra a la gaveta
   con normalidad.)
2. **Al volver la conexión** — se capturan esas ventas en lote desde el POS, una por una,
   activando el toggle **"Venta durante un apagón"** en el cobro e ingresando la **fecha y
   hora real** de cada una.

## Qué hace el sistema (y qué no)

- La venta se registra con su **fecha/hora real** (la del apagón), así el estado de
  resultados la ubica en el día en que **de verdad** ocurrió (según la zona horaria del
  negocio, ver [`reportes.md`](reportes.md)).
- El efectivo entra al **turno abierto actual** en el momento de la captura (el dinero
  llegó al sistema ahora, aunque la venta fuera antes). Es una asimetría consciente y
  honesta: para una tienda de colonia, la granularidad diaria del P&L es suficiente.
- El backend **rechaza fechas futuras** y fechas de **más de 30 días atrás** (`400`); el
  selector del POS también limita el máximo a "ahora".
- El descuento de inventario (FIFO) ocurre en el momento de la captura, con el stock
  disponible en ese momento. Desde el ciclo 2026-11 **ya no falla por falta de stock**: si
  durante el apagón se vendió algo que el sistema no tiene registrado, la venta se captura igual
  y queda como "deuda de stock" con un aviso (ver [`inventario.md`](inventario.md)). Como
  la captura es una venta normal, también admite `Idempotency-Key`.

## Lo que NO se construyó (a propósito)

- **Offline-first real**: sin PWA con cola local, sin sincronización, sin resolución de
  conflictos. Requeriría semanas de trabajo y meter complejidad de sincronización en el
  corazón del sistema (FIFO, turnos, efectivo). La auditoría lo descarta explícitamente.
- Si en el uso real los apagones resultan frecuentes y largos, se puede reconsiderar una
  captura offline más rica — pero solo cuando el dolor lo justifique, no antes. Pendiente
  de pulido (L9): que el modo apagón persista entre recargas de página.

## Referencias

- [Especificaciones Bloque 3](../historial/modelo-contable/bloque3-especificaciones.md) §3, ítem 14.
- [Auditoría de negocio](../auditorias/2026-07-04-auditoria-negocio-contable.md) §9.
