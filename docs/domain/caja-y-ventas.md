# Reglas de negocio — índice

Las reglas de negocio vigentes están divididas **por tema**. Este archivo se conserva solo como índice porque hay
comentarios del código que lo referencian.

| Tema | Documento |
|---|---|
| Apertura (diferencia y origen), cierre, tolerancia, cierre forzado, reapertura automática | [`caja-y-turnos.md`](caja-y-turnos.md) |
| Venta por cantidad y por monto, redondeo, idempotencia, venta sin stock, anulación, devolución, contingencia | [`ventas-y-devoluciones.md`](ventas-y-devoluciones.md) |
| Presentaciones y factor, FIFO, deuda de stock, mermas y conteos, alta rápida, historial de precios | [`inventario.md`](inventario.md) |
| Modelo origen→destino y todos los tipos de movimiento, gaveta y bóveda, "registrar y avisar", arqueo, compras y crédito | [`dinero-y-cuentas.md`](dinero-y-cuentas.md) |
| Estado de resultados (fórmula), patrimonio, flujo de efectivo, top y margen, zona horaria | [`reportes.md`](reportes.md) |
| Matriz de permisos, usuarios desactivables, validación por request | [`roles-y-permisos.md`](roles-y-permisos.md) |
| Qué hacer cuando se cae el internet | [`modo-contingencia.md`](modo-contingencia.md) |

Decisión de producto que cruza todos los temas (Fase 3, 2026-07): el sistema es **solo efectivo**, a propósito. No existe
método de pago (tarjeta, transferencia) ni fiado a clientes, y no se planea agregarlos.

Principio rector del ciclo 2026-11: **apoyar, no imponer** — ante la duda, registrar y avisar en vez de bloquear
([ADR 0011](../decisions/0011-registrar-y-avisar.md)).
