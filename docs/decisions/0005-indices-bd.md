# 0005 — Índices de base de datos (Fase 1)

**Estado:** Aceptado · **Fecha:** 2026-07-03 (Fase 1 de endurecimiento)

## Contexto

La auditoría técnica (hallazgo H5) encontró que `schema.prisma` no declaraba
**ningún** `@@index`. En PostgreSQL las columnas FK **no** se indexan
automáticamente (a diferencia de MySQL/InnoDB), así que cada join y cada
`WHERE`/`ORDER BY` sobre esas columnas hacía un *sequential scan*. Con el
volumen de datos actual (desarrollo) esto es imperceptible; el riesgo es que
se vuelva lento a medida que crece el histórico de ventas — precisamente el
escenario que la regla de "escalabilidad ante todo" del proyecto busca evitar
por adelantado, no después de que ya sea un problema.

Además, la Fase 0 introdujo bloqueo pesimista (`FOR UPDATE`, ver
[`0001-concurrencia-for-update.md`](0001-concurrencia-for-update.md)) sobre
`lotes_inventario` y `cajas_turnos`. Sin índice, esas filas se localizan con
un *sequential scan* **mientras el lock está retenido** — un problema de
rendimiento se convierte también en un problema de concurrencia, porque
alarga el tiempo que una transacción bloquea a las demás.

## Decisión

Se añadieron 16 índices a `schema.prisma`, cada uno justificado por un
patrón de consulta real verificado en el código (no especulativo). Compuestos
donde la evidencia mostraba que dos columnas siempre se filtran juntas.

| Modelo | Índice | Por qué (evidencia) |
|---|---|---|
| `lotes_inventario` | `(producto_id, fecha_ingreso)` | **El más importante.** `ventas.service.ts create()` hace `WHERE producto_id = ? AND cantidad_disponible > 0 ORDER BY fecha_ingreso ASC FOR UPDATE` — el motor FIFO completo. Verificado con `EXPLAIN`: el planner usa este índice (`Bitmap Index Scan`). |
| `lotes_inventario` | `compra_id` | FK, usado en `compras.findOne()` (`include: lotes_inventario`). |
| `cajas_turnos` | `(estado, fecha_cierre)` | `findFirst({where:{estado:'ABIERTA'}})` se ejecuta en casi cada escritura (ventas, compras, movimientos, ajustes, abrir/cerrar). `abrir()` y `getUltimoCierre()` además buscan `estado:'CERRADA'` ordenado por `fecha_cierre desc` — el mismo índice compuesto sirve ambos casos. |
| `ventas` | `(estado, fecha)` | `reportes.service.ts` filtra `estado` + `fecha` juntos en las 3 consultas de reportes (estado de resultados, productos top, margen por producto). |
| `ventas` | `caja_turno_id` | FK, usado en `cajas_turnos.getResumen()` (`ventas.aggregate({where:{caja_turno_id}})`). |
| `movimientos_financieros` | `(tipo_movimiento, fecha)` | `reportes.service.ts` filtra ambos juntos (gastos operativos, mermas); `findAll(tipo_movimiento)` también los usa. |
| `movimientos_financieros` | `caja_turno_id`, `categoria_gasto_id` | FKs, usados en `cajas_turnos.getResumen()` / `findOne()` / `findAll()`. |
| `detalle_ventas` | `venta_id`, `presentacion_id` | FKs, usados en casi todos los `include` de ventas y en los joins de `reportes.service.ts`. |
| `detalle_venta_lotes` | `detalle_venta_id`, `lote_id` | FKs; el segundo se usa en `ventas.anular()` para reincrementar stock. |
| `presentaciones` | `producto_id` | FK, usado constantemente (el POS carga productos con sus presentaciones). |
| `productos` | `categoria_id` | FK. |
| `cuentas_por_pagar` | `compra_id` | FK (nullable). |
| `ajustes_inventario` | `lote_id` | FK. |

**Deliberadamente NO indexado:** `usuarios` (tabla pequeña, siempre accedida
por `@unique nombre` o `id`, ya indexados implícitamente), `activos_fijos` y
`categorias_gastos`/`categorias` más allá de sus `@unique` existentes (sin
patrones de consulta que lo justifiquen hoy). Añadir índices no usados es
puro costo de escritura sin beneficio — no es "más escalable", es
sobreingeniería.

## Cómo se aplicó (sin migraciones)

Consistente con [`0002-sin-migraciones-hasta-produccion.md`](0002-sin-migraciones-hasta-produccion.md):
los índices se aplican vía `npx prisma db push`, igual que cualquier otro
cambio de schema en este proyecto por ahora. `CREATE INDEX` es una operación
aditiva y seguro (no hay pérdida de datos ni downtime perceptible al tamaño
actual de las tablas).

## Verificación

- `npx prisma validate` y `npx prisma format`: schema válido.
- `npx prisma db push` contra un PostgreSQL 16 desechable (Docker): sincroniza sin errores.
- `pg_indexes`: los 16 índices se crearon con los nombres y columnas esperados.
- `EXPLAIN` sobre la consulta exacta del motor FIFO: el planner elige
  `Bitmap Index Scan` sobre `lotes_inventario_producto_id_fecha_ingreso_idx`
  en vez de un *sequential scan*.

## Consecuencias

- Sin downside funcional: los índices son transparentes para el código de
  aplicación (Prisma no requiere ningún cambio de consulta para usarlos).
- Costo menor de escritura (cada `INSERT`/`UPDATE` actualiza también los
  índices afectados) — aceptable dado el volumen de escrituras de una tienda
  pequeña.
- Este cambio de schema **debe aplicarse manualmente** contra la base de
  datos real (Supabase) corriendo `npx prisma db push` — este entorno de
  desarrollo no tiene esas credenciales. Ver instrucciones en
  [`../roadmap/plan-fases.md`](../roadmap/plan-fases.md).
