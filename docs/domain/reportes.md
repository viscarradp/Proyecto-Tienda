# Reportes

> Reglas vigentes (ciclo 2026-11). Verificadas contra `reportes.service.ts` y `common/zona-horaria.ts`.
> Todos los endpoints de `/reportes/*` son **solo de la dueña**. Pantalla: Estadísticas.

## Zona horaria del negocio

Los instantes se guardan en UTC, pero los reportes agrupan por **día según el reloj de la tienda**
(`ZONA_HORARIA_NEGOCIO`, default `America/El_Salvador` = UTC−6, sin horario de verano; nombre IANA; si es inválida el
servidor no arranca). Sin esto, una venta de las 19:30 locales (01:30Z del día siguiente) caería en el día equivocado.

- `desde` y `hasta` son fechas calendario `YYYY-MM-DD`; el período va de las 00:00:00.000 locales de `desde` a las
  23:59:59.999 locales de `hasta`. Una fecha inexistente (p. ej. 2026-02-30) o `desde > hasta` da 400.
- Sin parámetros: del **1ro del mes** actual a **hoy**, ambos en la zona del negocio.
- Las devoluciones se ubican por la fecha de la **devolución**, no por la de la venta original.

## Estado de resultados (`GET /reportes/estado-resultados?desde&hasta`)

```
ingreso_neto   = Σ ventas COMPLETADA (total) − Σ devoluciones (total_reembolsado)
costo_ventas   = Σ(cantidad_descargada × costo_aplicado)          ← costo FIFO de lotes
               + Σ(cantidad_base × costo_unitario_estimado)       ← ventas sin stock (deuda de stock)
               − Σ costo_revertido de devoluciones con destino REINGRESO
utilidad_bruta = ingreso_neto − costo_ventas
utilidad_neta  = utilidad_bruta
               − gastos_operativos        (EGRESO_OPERATIVO, de gaveta o bóveda)
               − mermas_inventario        (MERMA_INVENTARIO)
               − faltantes                (AJUSTE_FALTANTE + AJUSTE_BOVEDA_FALTANTE)
               + sobrantes                (AJUSTE_SOBRANTE + AJUSTE_BOVEDA_SOBRANTE)
```

Detalles que importan al interpretarlo:

- Solo cuentan ventas `COMPLETADA` (una anulada no existe para el reporte; se informa su conteo
  `total_ventas_anuladas`). Una venta con devolución sigue `COMPLETADA`: la devolución la netea.
- Una devolución `REINGRESO` baja el costo de ventas (el producto volvió al estante); una `MERMA` deja el costo como
  pérdida real.
- El costo de lo vendido sin stock queda congelado al estimado aunque el pendiente se cubra después (ver
  [`inventario.md`](inventario.md)); un estimado de $0 se corrige al costo real cuando una compra lo cubre.
- Faltantes y sobrantes **sí** afectan la utilidad (señal de robo hormiga). Incluyen las diferencias de apertura sin
  explicar y los ajustes del arqueo de bóveda.
- **No restan de la utilidad:** `RETIRO_PERSONAL` (es una distribución de patrimonio; se informa aparte como
  `retiros_duenos`), `PAGO_PROVEEDOR` y abonos de deuda (el costo ya entró por el FIFO), los traslados entre gaveta y
  bóveda y los aportes de capital.
- **`ventas_sin_costo`** `{ monto_vendido, lineas, productos[], producto_ids[] }` (DUE-27): lo vendido en el período cuyo
  costo sigue en $0 (deuda de stock con `costo_unitario_estimado = 0`, es decir, producto sin compras que aún no se
  cubrió). Solo ventas `COMPLETADA`; el monto prorratea el subtotal de la línea y descuenta lo devuelto. Cuando una compra
  lo cubre, el estimado pasa al costo real y vuelve a 0. Estadísticas avisa en ámbar ("la ganancia puede estar de más") y
  marca esos productos con "sin costo". Registra y avisa; no bloquea.
- Nombres en pantalla: la fila bruta se llama "Cobrado en ventas", "Vendido" es solo el neto; `faltantes` se muestra como
  "Faltó al contar el dinero" (gaveta y bóveda) y las mermas como "Mercadería perdida (rota, vencida o que no se encontró)".
  Los umbrales de margen son únicos en la pantalla: `MARGEN_BUENO = 25` y `MARGEN_BAJO = 10`.
- Otros campos: `margen_bruto_porcentaje = utilidad_bruta / ingreso_neto × 100` (0 si no hay ingreso) y
  `ticket_promedio = ingreso bruto ÷ ventas completadas`.

## Patrimonio (`GET /reportes/patrimonio`)

Foto de balance **al instante** (no recibe período):

```
patrimonio_neto = inventario + efectivo(gaveta + bóveda) + activos_fijos − deudas
```

- `inventario`: `Σ cantidad_disponible × costo_unitario_adquisicion` de todos los lotes (costo FIFO congelado).
- `efectivo.gaveta`: `efectivo_esperado` del turno abierto o, si no hay turno, el remanente del último cierre
  (`efectivo_declarado − TRASLADO_A_BOVEDA`, incluido el cierre forzado). `efectivo.boveda`: saldo derivado del libro.
- `activos_fijos`: suma de `valor_estimado`, **sin depreciación** (decisión consciente a esta escala).
- `deudas`: suma de `saldo_pendiente` de cuentas por pagar.

## Flujo de efectivo (`GET /reportes/flujo-efectivo?desde&hasta`)

Entradas y salidas por cuenta de efectivo real en el período, derivadas del modelo origen→destino
([`dinero-y-cuentas.md`](dinero-y-cuentas.md)):

- Cada cuenta: `entradas = Σ(monto con destino = cuenta)`, `salidas = Σ(monto con origen = cuenta)`, `neto`.
- **Gaveta:** además las **ventas `COMPLETADA`** suman como entrada y las **devoluciones** como salida (no viven en el
  libro; mueven `efectivo_esperado` directo). Se informan también `ventas_efectivo` y `devoluciones_efectivo`.
- **Bóveda:** solo movimientos del libro.
- Las mermas no aparecen (no son efectivo).

## Productos top y margen

- `GET /reportes/productos-top?desde&hasta&limit` (default 10): por producto, `unidades_vendidas` (unidades base),
  `ingreso`, `costo_fifo`, `margen` y `margen_porcentaje`; ordenado por unidades vendidas.
- `GET /reportes/margen-por-producto?desde&hasta`: la misma data sin límite, ordenada por margen porcentual **ascendente**
  (los peores márgenes primero).
- Ambos son **netos de devoluciones del período**: restan unidades e ingreso y, solo si el destino es `REINGRESO`, el
  costo revertido. El costo incluye el estimado de lo vendido sin stock.

## Fuera de reportes

La paginación de Movimientos (turnos y ventas por cursor) y los listados de deudas no son reportes: ver
[`caja-y-turnos.md`](caja-y-turnos.md) y [`ventas-y-devoluciones.md`](ventas-y-devoluciones.md). Aún no construido: resumen
diario (D-07) y lenguaje "este mes ganaste $X" (L10), ver [backlog](../roadmap/backlog-ciclo-2026-11.md).
