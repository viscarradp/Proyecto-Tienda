import { Prisma } from '@prisma/client';

/**
 * Utilidades para bloqueo pesimista en operaciones financieras/de inventario
 * concurrentes. Ver docs/decisions/0001-concurrencia-for-update.md para el
 * criterio de cuándo usar FOR UPDATE vs. advisory lock.
 */

/** Fila de cajas_turnos leída con FOR UPDATE (columnas según la consulta). */
export interface CajaTurnoRow {
  id: number;
  estado?: string;
  efectivo_esperado?: Prisma.Decimal | string | null;
}

/** Fila de lotes_inventario leída con FOR UPDATE. */
export interface LoteInventarioRow {
  id: number;
  producto_id: number;
  // Decimal desde 1.B (cantidades fraccionadas); $queryRaw lo devuelve como
  // Prisma.Decimal o string según el driver.
  cantidad_disponible: Prisma.Decimal | string;
  costo_unitario_adquisicion: Prisma.Decimal | string;
}

/**
 * Adquiere un advisory lock transaccional (se libera solo al hacer COMMIT/ROLLBACK).
 * Úsalo para invariantes que NO corresponden a una sola fila bloqueable con
 * FOR UPDATE (ej. "solo puede existir un turno ABIERTA", saldo agregado de
 * caja_general calculado con SUM()).
 */
export async function acquireAdvisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`;
}
