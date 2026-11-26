# Modelo de Datos

Esquema completo en [`erp-tienda-backend/prisma/schema.prisma`](../../erp-tienda-backend/prisma/schema.prisma).
Este documento explica el *porqué* de las tablas clave, no repite el schema. Las reglas de negocio de cada tabla están en
[`../domain/`](../domain/) (el índice es [`caja-y-ventas.md`](../domain/caja-y-ventas.md)).

## Cambios de esquema

No hay carpeta `prisma/migrations`: los cambios se aplican con `prisma db push`
([ADR 0002](../decisions/0002-sin-migraciones-hasta-produccion.md)). Lo que falta aplicar en Supabase está en
[`../roadmap/plan-fases.md`](../roadmap/plan-fases.md#cambios-de-esquema-pendientes-en-supabase).

## Catálogo

- **`categorias`** → **`productos`** → **`presentaciones`**: un producto (ej. "Coca-Cola") puede venderse en varias
  presentaciones (ej. "lata 355ml", "six-pack"). `presentaciones.factor_conversion` (decimal, 12,3) indica cuántas
  unidades base del producto representa esa presentación (el six-pack de 6 tiene `factor_conversion = 6`).
- **`productos.por_revisar`** (boolean, default `false`): marca de las altas rápidas de la cajera; la dueña la apaga al
  revisar el producto. Esos productos caen en la categoría "Por revisar".
- **`historial_precios_presentaciones`**: una fila (precio anterior → nuevo, fecha, autor) cada vez que cambia
  `presentaciones.precio_venta`.

## Inventario por lotes (el corazón del sistema)

```
compras_inventario ──< lotes_inventario >── productos
                            │
                            │ (consumidos por ventas, FIFO)
                            ▼
                    detalle_venta_lotes >── detalle_ventas >── ventas
                                                 │
                                                 └──< pendientes_stock  (deuda de stock)
```

- Cada **compra** genera uno o más **lotes** (`lotes_inventario`), cada uno con su propio `costo_unitario_adquisicion` y
  `cantidad_disponible`. `fecha_ingreso` es NOT NULL: el FIFO ordena por ella y un NULL rompería el orden.
- Al vender, el sistema **no descuenta de un "stock total"**: recorre los lotes del producto por `fecha_ingreso, id`
  (el más viejo primero, **FIFO**) y descuenta de ahí. Esto permite calcular el costo real de cada venta
  (`detalle_venta_lotes.costo_aplicado`), incluso si el mismo producto se compró a precios distintos.
- Implementado en `VentasService.create()`
  ([`erp-tienda-backend/src/ventas/ventas.service.ts`](../../erp-tienda-backend/src/ventas/ventas.service.ts)). La lectura
  de lotes usa bloqueo pesimista (`FOR UPDATE`) para no permitir sobreventa bajo concurrencia — ver
  [`../decisions/0001-concurrencia-for-update.md`](../decisions/0001-concurrencia-for-update.md).
- **`pendientes_stock`** (deuda de stock): lo que se vendió sin stock registrado. Guarda `cantidad_base` (lo que faltó, no
  cambia), `cantidad_pendiente` (lo que aún no se cubre), `costo_unitario_estimado` (el costo congelado de esa venta),
  `resuelto_en` y `lote_resuelto_id` (último lote que cubrió algo). Una compra o un conteo sobrante la va cubriendo.
  Reglas en [`../domain/inventario.md`](../domain/inventario.md).

## Ventas y devoluciones

```
cajas_turnos ──< ventas ──< detalle_ventas ──< detalle_devoluciones >── devoluciones
```

- **`ventas`**: `total` (suma de líneas ya redondeadas), `estado` (`COMPLETADA` | `ANULADA`), `justificacion_nula`,
  `fecha_anulacion`, autores `usuario_id` y `anulada_por_id`, y `clave_idempotencia` (**única**, nullable, ≤ 64): la clave del
  header `Idempotency-Key` para que un reintento no duplique la venta.
- **`detalle_ventas`**: `cantidad` (decimal, fraccionable) y `subtotal` congelado.
- **`devoluciones`** / **`detalle_devoluciones`**: devolución de cliente ligada a la venta original, que permanece
  `COMPLETADA`. Cada detalle guarda cantidad, `destino` (`REINGRESO` | `MERMA`), `subtotal_reembolsado` y `costo_revertido`
  (para el estado de resultados). La devolución cuelga del turno **actual** (de donde sale el reembolso).

## Caja y dinero

```
cajas_turnos ──< ventas
             ──< devoluciones
             ──< movimientos_financieros ── categorias_gastos
                            └──< abonos_cuentas_por_pagar
```

- Un **turno de caja** (`cajas_turnos`) se abre con un `fondo_inicial` y acumula `efectivo_esperado` con ventas e
  ingresos y lo reduce con egresos y reembolsos. Al cerrar se compara contra `efectivo_declarado` (el conteo físico) para
  obtener la `diferencia`. Guarda quién lo abrió (`usuario_id`) y quién lo cerró (`cerrado_por_id`). `estado`: `ABIERTA`,
  `CERRADA`, `CERRADA_FORZADA`.
- **`movimientos_financieros`** es el **libro del efectivo**. Cada movimiento tiene `monto` (siempre positivo),
  `tipo_movimiento` y `cuenta_origen` → `cuenta_destino` de un catálogo cerrado (`GAVETA`, `BOVEDA`, `DUEÑOS`, `GASTO`,
  `PROVEEDOR`); `MERMA_INVENTARIO` no tiene cuentas (no es efectivo). `caja_turno_id` es nullable (movimientos de bóveda,
  mermas sin turno). Tabla completa de tipos en [`../domain/dinero-y-cuentas.md`](../domain/dinero-y-cuentas.md).
- **La bóveda no es una tabla:** su saldo se **deriva** del libro, `Σ(destino=BOVEDA) − Σ(origen=BOVEDA)`, con índices en
  `cuenta_origen` y `cuenta_destino`. Así el efectivo se conserva por construcción. El módulo `caja_general` del backend solo
  expone lecturas de ese saldo/libro, la inyección y el arqueo.

## Compras y deudas

- **`compras_inventario`**: proveedor, `monto_total` (calculado por el backend), `estado_pago` (`PAGADO` | `AL_CREDITO`),
  `origen_fondos` (`CAJA_POS` | `CAJA_GENERAL` | `CAPITAL_DUEÑOS` | `CREDITO`) y `usuario_id` (autor).
- **`cuentas_por_pagar`**: la deuda de una compra `AL_CREDITO` (`monto_deuda`, `saldo_pendiente`).
- **`abonos_cuentas_por_pagar`** (modelo Prisma `abono_deuda`): cada pago parcial o total de una deuda, con su
  `movimiento_id` (el `PAGO_PROVEEDOR` en el libro), autor y nota.

## Inventario: mermas y ajustes

`ajustes_inventario` registra mermas (quebrado, vencido, robo, conteo hacia abajo) y conteos sobrantes contra un lote
específico, con `costo_asumido` (la pérdida al costo de adquisición de ese lote) y autor. Las mermas, además, dejan un
`MERMA_INVENTARIO` en el libro para el estado de resultados.

## Usuarios y trazabilidad

- **`usuarios`**: `rol` (`ADMIN` | `CAJERO`) y **`activo`** (boolean, default `true`). Los usuarios **no se borran**:
  se desactivan, para conservar la autoría del historial. Un usuario inactivo no puede entrar y su token deja de servir.
- **Autoría:** `usuario_id` en turnos, ventas, movimientos, ajustes, devoluciones, historial de precios, compras y abonos;
  más `ventas.anulada_por_id` y `cajas_turnos.cerrado_por_id`. Todas con `onDelete: SetNull`.

## Bot de Telegram

Reglas en [`../domain/bot.md`](../domain/bot.md).

- **`bot_conversaciones`**: una fila por chat (`chat_id`, único) con el `borrador` de compra en Json, su `estado`
  (`BORRADOR` | `GUARDANDO`), `usuario_id` y `actualizado_en`.
- **`bot_alias`**: memoria de equivalencias "como lo dice la dueña" → presentación: `texto_normalizado`, `proveedor`
  (opcional), `presentacion_id`, `usos`, y, cuando lo comprado no es una presentación del catálogo (una caja, un fardo),
  `paquete` (cómo lo nombró) y `unidades_paquete` (cuántas de la presentación trae). Autor en `creado_por_id`.

## Otras tablas

- **`activos_fijos`**: activos del negocio (mobiliario, equipo) con `valor_estimado`. No hay pantalla ni endpoint para darlos
  de alta; solo los lee el patrimonio, que los suma a su valor estimado, sin depreciación.

## Índices

Las columnas FK y las combinaciones de filtro usadas realmente por el código (el motor FIFO, los reportes, "buscar el turno
abierto", el saldo de bóveda, los pendientes por producto) tienen `@@index` en `schema.prisma`. Detalle, evidencia por índice
y verificación en [`../decisions/0005-indices-bd.md`](../decisions/0005-indices-bd.md).

## Deuda técnica conocida (ver `roadmap/hardening-backlog.md`)

- Varios campos que representan estados (`ventas.estado`, `cajas_turnos.estado`, `usuarios.rol`,
  `movimientos_financieros.tipo_movimiento`, etc.) son `String` libre en el schema en vez de un enum — validados en la capa de
  aplicación (DTOs), no en la BD.
- Constraints de BD (`CHECK cantidad_disponible >= 0`, un solo turno `ABIERTA`) y `REVOKE UPDATE/DELETE` sobre tablas de libro:
  diferidos hasta adoptar migraciones.
