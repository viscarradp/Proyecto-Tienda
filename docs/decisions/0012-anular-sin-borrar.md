# 0012 — Anular sin borrar

**Estado:** Aceptado · **Fecha:** 2026-11 (ciclo 2026-11, lote L12) · **Hallazgo:** ARQ-08

## Contexto

Un gasto, una compra o una merma mal registrados (monto equivocado, doble registro) no tenían salida: la única era
inventar movimientos compensatorios, que ensuciaban el estado de resultados, el flujo y el saldo de la bóveda. Las ventas
ya tenían "Anular" y "Devolver".

## Decisión

1. **Anular = marcar, nunca borrar** (el libro es append-only): `anulado`, `anulado_en`, `anulado_por_id`,
   `motivo_anulacion` en `movimientos_financieros`, `compras_inventario` y `ajustes_inventario`. Lo anulado no cuenta en
   ningún reporte ni saldo (estado de resultados, flujo, bóveda); los listados lo muestran tachado.
2. **Alcance:** gastos, retiros personales y aportes de capital (libre registro); compras sin usar; mermas. Los
   movimientos que genera el sistema se corrigen anulando su origen o con el cierre/arqueo.
3. **Reglas reales, no de saldo:** un movimiento de gaveta solo se anula con su turno `ABIERTA` (un turno cerrado es un
   cuadre histórico inmutable); de bóveda, siempre. Una compra no se anula si algo de ella se vendió, se ajustó o cubrió
   deuda de stock, ni si tiene abonos.
4. **Solo ADMIN, motivo obligatorio.** Transacciones con el orden de locks del ADR 0001 (turno/bóveda → lotes → cuenta
   por pagar); la anulación se "reclama" con `UPDATE ... WHERE anulado = false` bajo lock, así la doble anulación da 400.
5. Para encontrar el pago de una compra y la pérdida de una merma, `movimientos_financieros` guarda `compra_id` y
   `ajuste_id` (nullable, FK `SET NULL`).

## Consecuencias

- Cambio de schema (sin migraciones hasta producción, ADR 0002): columnas de anulación, `compra_id`, `ajuste_id` y
  relaciones nombradas con `usuarios`.
- Los movimientos anteriores a este cambio no tienen `compra_id`/`ajuste_id`: no se pueden revertir sus efectos.
- El asiento de la diferencia de apertura de turno no se anula: lo marca `movimientos_financieros.es_apertura`
  (la apertura lo pone en `true`), no su descripción.
