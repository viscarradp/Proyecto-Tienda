import { Prisma } from '@prisma/client';

/**
 * Modelo origen→destino del efectivo (Bloque 1 §5.1). Catálogo cerrado de cuentas:
 * todo movimiento de efectivo mueve `monto` (positivo) de `cuenta_origen` a
 * `cuenta_destino`. GAVETA y BOVEDA son efectivo real; DUEÑOS/GASTO/PROVEEDOR son
 * contrapartes externas. La conservación queda garantizada por construcción.
 */
export const CUENTAS_EFECTIVO = [
  'GAVETA',
  'BOVEDA',
  'DUEÑOS',
  'GASTO',
  'PROVEEDOR',
] as const;

export type CuentaEfectivo = (typeof CUENTAS_EFECTIVO)[number];

/**
 * Clave del advisory lock que serializa lecturas+escrituras del saldo de bóveda.
 * El saldo es un agregado (SUM), no una fila bloqueable con FOR UPDATE, así que
 * todo escritor de bóveda debe tomar este mismo lock antes de validar fondos
 * (ver docs/decisions/0001-concurrencia-for-update.md).
 */
export const BOVEDA_LEDGER_LOCK = 'boveda_ledger';

/**
 * Saldo actual de la bóveda, DERIVADO del libro de movimientos:
 *   Σ(monto donde destino=BOVEDA) − Σ(monto donde origen=BOVEDA).
 * Reemplaza a la antigua tabla `caja_general` (eliminada en 1.C).
 * Los movimientos anulados (L12, ADR 0012) no cuentan.
 */
export async function saldoBovedaDerivado(
  client: Prisma.TransactionClient,
): Promise<Prisma.Decimal> {
  const rows = await client.$queryRaw<
    { saldo: Prisma.Decimal | string | null }[]
  >`
    SELECT COALESCE(SUM(monto) FILTER (WHERE cuenta_destino = 'BOVEDA'), 0)
         - COALESCE(SUM(monto) FILTER (WHERE cuenta_origen = 'BOVEDA'), 0) AS saldo
    FROM movimientos_financieros
    WHERE anulado = false
  `;
  return new Prisma.Decimal(rows[0]?.saldo ?? 0);
}
