# Modelo de Datos

Esquema completo en [`erp-tienda-backend/prisma/schema.prisma`](../../erp-tienda-backend/prisma/schema.prisma).
Este documento explica el *porqué* de las tablas clave, no repite el schema.

## Nota importante: sin migraciones (por ahora)

`schema.prisma` fue generado por introspección (`prisma db pull`) desde una
base de Supabase ya existente — **no hay carpeta `prisma/migrations`**. Es una
decisión deliberada mientras el proyecto está en desarrollo activo (ver
[`../decisions/0002-sin-migraciones-hasta-produccion.md`](../decisions/0002-sin-migraciones-hasta-produccion.md)).
Esto significa: los cambios de schema se hacen directamente en Supabase (o vía
`db push`) y luego se re-introspecciona; **no** hay historial versionado de
cambios de BD todavía. Antes de producción, esto debe resolverse.

## Catálogo

- **`categorias`** → **`productos`** → **`presentaciones`**: un producto
  (ej. "Coca-Cola") puede venderse en varias presentaciones (ej. "lata 355ml",
  "six-pack"). `presentaciones.factor_conversion` indica cuántas unidades base
  del producto representa esa presentación (el six-pack de 6 tiene
  `factor_conversion = 6`).

## Inventario por lotes (el corazón del sistema)

```
compras_inventario ──< lotes_inventario >── productos
                            │
                            │ (consumidos por ventas, FIFO)
                            ▼
                    detalle_venta_lotes >── detalle_ventas >── ventas
```

- Cada **compra** genera uno o más **lotes** (`lotes_inventario`), cada uno
  con su propio `costo_unitario_adquisicion` y `cantidad_disponible`.
- Al vender, el sistema **no descuenta de un "stock total"**: recorre los
  lotes del producto ordenados por `fecha_ingreso` (el más viejo primero,
  **FIFO** — First In, First Out) y descuenta de ahí. Esto es lo que permite
  calcular el costo real de cada venta (`detalle_venta_lotes.costo_aplicado`),
  incluso si el mismo producto se compró en momentos distintos a precios
  distintos.
- Implementado en `VentasService.create()`
  ([`erp-tienda-backend/src/ventas/ventas.service.ts`](../../erp-tienda-backend/src/ventas/ventas.service.ts)).
  Desde Fase 0, la lectura de lotes usa bloqueo pesimista (`FOR UPDATE`) para
  no permitir sobreventa bajo concurrencia — ver
  [`../decisions/0001-concurrencia-for-update.md`](../decisions/0001-concurrencia-for-update.md).

## Caja

```
cajas_turnos ──< ventas
             ──< movimientos_financieros ── categorias_gastos
                             │
                             └──> caja_general (cuando el movimiento es un
                                  RETIRO_BOVEDA, es decir, se traslada
                                  efectivo de la caja del POS a la "bóveda")
```

- Un **turno de caja** (`cajas_turnos`) se abre con un fondo inicial y
  acumula `efectivo_esperado` a medida que ocurren ventas e ingresos, y lo
  reduce con egresos. Al cerrar, se compara contra `efectivo_declarado`
  (el conteo físico) para obtener la `diferencia` (faltante/sobrante).
- **`caja_general`** es una bóveda separada del efectivo del día a día del
  POS — es un libro de movimientos (no una fila con un contador), el saldo se
  calcula sumando (`SUM(monto)`).
- Ver reglas completas en [`../domain/caja-y-ventas.md`](../domain/caja-y-ventas.md).

## Inventario: mermas y ajustes

`ajustes_inventario` registra pérdidas de stock (producto roto, vencido,
robado) contra un lote específico, calculando `costo_asumido` (la pérdida
económica real, al costo de adquisición de ese lote).

## Otras tablas

- **`cuentas_por_pagar`**: deudas a proveedores generadas por compras
  `AL_CREDITO`.
- **`activos_fijos`**: registro simple de activos del negocio (mobiliario,
  equipo), no tiene lógica asociada todavía.

## Deuda técnica conocida (ver `roadmap/hardening-backlog.md`)

- **Cero índices** (`@@index`) sobre columnas FK y de filtro — no es un
  problema hoy con poco volumen, pero se degradará con el histórico.
- Varios campos que representan estados (`ventas.estado`,
  `cajas_turnos.estado`, `usuarios.rol`, etc.) son `String` libre en el schema
  en vez de un enum — validados en la capa de aplicación (DTOs), no en la BD.
