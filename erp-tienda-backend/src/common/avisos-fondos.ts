import { Prisma } from '@prisma/client';

/**
 * Política "registrar y avisar" (ADR 0011): una salida de efectivo nunca se
 * rechaza porque el saldo que cree el sistema no alcance. Se registra y, si el
 * saldo resultante queda negativo, se devuelve un aviso en `avisos: string[]`
 * (el mismo estilo que `POST /ventas`).
 */

/** Aviso si la gaveta quedó en negativo según el sistema; `null` si no. */
export function avisoGavetaNegativa(
  saldoDespues: Prisma.Decimal.Value,
): string | null {
  const saldo = new Prisma.Decimal(saldoDespues);
  if (!saldo.isNegative() || saldo.isZero()) return null;
  return (
    `Según el sistema la gaveta quedó en −$${saldo.abs().toFixed(2)}. ` +
    'Puede que falte registrar una venta o el fondo. Revísalo al cerrar.'
  );
}

/** Aviso si la bóveda quedó en negativo según el sistema; `null` si no. */
export function avisoBovedaNegativa(
  saldoDespues: Prisma.Decimal.Value,
): string | null {
  const saldo = new Prisma.Decimal(saldoDespues);
  if (!saldo.isNegative() || saldo.isZero()) return null;
  return (
    `Según el sistema la bóveda quedó en −$${saldo.abs().toFixed(2)}. ` +
    'Puede que falte registrar el efectivo guardado o un aporte. ' +
    'Cuenta la bóveda y haz el arqueo para dejarla al día.'
  );
}

/** Quita los `null` de una lista de avisos opcionales. */
export function soloAvisos(avisos: (string | null)[]): string[] {
  return avisos.filter((a): a is string => a !== null);
}
