# Ventas y devoluciones

> Reglas vigentes (ciclo 2026-11). Verificadas contra `ventas.service.ts` y `common/pendientes-stock.ts`.
> Solo **efectivo**, a propósito: no existe método de pago (tarjeta, transferencia) ni fiado a clientes — decisión de
> producto (Fase 3), no una limitación temporal. Toda venta suma su total completo a `efectivo_esperado`.

## Crear una venta (`POST /ventas`)

- Exige un turno `ABIERTA`; el turno se bloquea (`FOR UPDATE`) **antes** de insertar y se revalida bajo lock
  ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
- **El total lo calcula siempre el backend** desde presentaciones y cantidades; nunca se confía en un total del cliente.
- Cada línea lleva **exactamente uno** de `cantidad` o `monto` (400 si vienen los dos o ninguno).
- La venta guarda quién la hizo (`usuario_id`).

### Por cantidad y por monto (D-03: se vende por peso o suelto)

- `cantidad`: decimal, hasta 3 decimales, máx. 99 999. Media libra de queso = `0.5`.
- `monto` (0.01 a 999 999.99, 2 decimales): "dame $1 de queso". El backend calcula
  `cantidad = monto ÷ precio_venta`, redondeada mitad hacia arriba a 3 decimales, y el **subtotal es exactamente el
  monto pedido**. Un producto con precio $0 no se vende por monto (400); un monto tan chico que da cantidad 0, o tan
  grande que excede el máximo, también da 400.

### Redondeo por línea

Cada línea vale `cantidad × precio_venta` redondeado a **2 decimales, mitad hacia arriba, antes de sumar**.
`ventas.total` y el aumento de `efectivo_esperado` son la suma de esas líneas ya redondeadas (el total siempre es la
suma exacta de lo guardado). En compras se aplica el mismo criterio por lote.

### Idempotencia

`POST /ventas` acepta el header opcional `Idempotency-Key` (8 a 64 caracteres, p. ej. un UUID; si el largo es otro,
400). Con la misma clave, un reintento (típico tras un corte de red) **devuelve la venta ya creada** sin tocar stock
ni efectivo, incluso si su turno ya se cerró. Está respaldado por la columna única `ventas.clave_idempotencia`; la
verificación real contra carreras ocurre dentro de la transacción, bajo el lock del turno. Sin el header todo
funciona igual que antes. El POS genera una clave por ticket y la guarda en `sessionStorage` junto con la "firma" del
ticket (productos y cantidades): si la respuesta del cobro se pierde y la cajera **recarga la página**, el ticket guardado
se cobra con la **misma** clave y el servidor devuelve la venta ya creada en vez de registrar otra. La clave se descarta
al cobrar con éxito o cuando cambia el ticket. Si el cobro falla por red o por el servidor, el mensaje pide revisar en
Movimientos antes de cobrar otra vez.

### Venta sin stock registrado ("deuda de stock", D-01)

Si el sistema cree que no hay stock, **se vende igual y se avisa** (apoyar, no imponer). El FIFO consume los lotes
disponibles; lo que falta queda en `pendientes_stock` y la respuesta trae `avisos` (un texto por línea afectada,
en la unidad de la presentación). Detalle del ciclo de vida de la deuda en [`inventario.md`](inventario.md).

### Motor FIFO

Descarga de los lotes del producto por `fecha_ingreso ASC, id ASC` bajo `FOR UPDATE`; cada descarga queda en
`detalle_venta_lotes` con el costo congelado del lote (`costo_aplicado`). Unidades base requeridas =
`cantidad × factor_conversion` de la presentación.

## Anular (`PATCH /ventas/:id/anular`)

- Exige `justificacion_nula` (motivo escrito, máx. 500). Guarda `anulada_por_id` y `fecha_anulacion`: la cajera
  anula, con su nombre ([`roles-y-permisos.md`](roles-y-permisos.md)).
- **Solo si el turno de la venta sigue `ABIERTA`**; anular en un turno cerrado corrompería su cuadre histórico
  (400). La UI solo ofrece "Anular" en ventas del turno abierto.
- **Una venta con alguna devolución no se puede anular** (409): revertirla completa duplicaría el stock y el
  efectivo ya devueltos. Para el resto de los productos se usa "Devolver el resto".
- Devuelve el stock exactamente a los lotes de donde salió y baja `efectivo_esperado` por el total. La deuda de stock
  de la venta se cancela (lo no cubierto) o vuelve al lote que la cubrió.
- Orden de locks turno → venta → lotes → pendientes: un doble clic no revierte dos veces.

## Devolver (`POST /ventas/:id/devolucion`)

Devolución de cliente, posterior al turno o dentro de él. Ligada a la venta original, que **permanece
`COMPLETADA`** (fue una venta real); la devolución vive en `devoluciones` / `detalle_devoluciones`.

- Solo ventas `COMPLETADA`. Cada línea indica `detalle_venta_id`, `cantidad` (en unidades de la presentación,
  fraccionable) y `destino`: **`REINGRESO`** (vuelve al lote, revendible) o **`MERMA`** (se descarta).
- Una misma línea repetida en la petición da 400; no se puede devolver más de lo vendido menos lo ya devuelto.
- **Reembolso proporcional con redondeo por línea:** `subtotal × cantidad_devuelta / cantidad_vendida` a 2 decimales;
  cuando la línea queda devuelta por completo se reembolsa **exactamente el saldo** (subtotal − ya reembolsado), sin
  centavos sueltos. Igual para `costo_revertido` (costo FIFO de la línea, incluido el estimado de su deuda de stock).
- El reembolso **sale del turno actual** (baja `efectivo_esperado`), no del turno de la venta; exige un turno abierto.
  Si el saldo del sistema no alcanza no se bloquea (política de fondos; el reembolso ya es dinero que salió).
- Con `REINGRESO`, cada lote de la línea recupera lo proporcional y baja la deuda de stock proporcional (con
  redondeo acumulado: la suma de devoluciones parciales da exactamente lo que se vendió sin stock). Con `MERMA`
  el stock no vuelve y la deuda de stock **no** cambia (la compra igual debe cubrirla).
- Efecto en reportes: baja el ingreso; con `REINGRESO` también baja el costo de ventas, con `MERMA` el costo queda
  como pérdida ([`reportes.md`](reportes.md)).

## Contingencia (se cae el internet)

La venta se anota en papel durante el apagón y se captura después activando "Venta durante un apagón" con su fecha
y hora real; entra al **turno abierto actual** pero con `fecha` real, así el estado de resultados la ubica en el
día correcto. El backend rechaza fechas **futuras** y de **más de 30 días** atrás (400). Proceso completo y por qué
no hay offline-first: [`modo-contingencia.md`](modo-contingencia.md).

## Avisos, no bloqueos

Las respuestas de `POST /ventas` incluyen `avisos: string[]` (hoy: líneas vendidas sin stock registrado, con un
texto extra si el producto nunca tuvo costo y la ganancia saldrá alta). Una respuesta idempotente repetida
recalcula los mismos avisos.

## Lectura

- `GET /ventas`: más recientes primero, cursor `antes_de=<id>`, `limit` (por defecto 50, máx. 200); con
  `caja_turno_id=3,4,5` (hasta 50 turnos) no hay límite por defecto. Trae nombre del cajero y de quien anuló,
  cantidad de devoluciones y líneas con nombre de producto.
- `GET /ventas/:id`: además lotes descargados y pendientes de stock (Movimientos busca una venta por su número).
