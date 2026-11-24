import { Prisma } from '@prisma/client';

/**
 * Redondea un monto a 2 decimales, mitad hacia arriba (half-up), de forma
 * explícita (no depende del modo global de Decimal). Se aplica POR LÍNEA antes
 * de sumar, para que el total siempre sea la suma exacta de lo guardado.
 */
export function redondearDinero(valor: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(valor).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}
