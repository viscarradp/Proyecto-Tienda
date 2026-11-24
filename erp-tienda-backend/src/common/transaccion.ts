/**
 * Opciones de las transacciones interactivas de Prisma.
 *
 * El default de Prisma es `timeout: 5000`; una venta de varias líneas (varios
 * round-trips por línea) contra una base remota como Supabase puede pasarse y
 * el usuario vería un error. `maxWait` es cuánto espera una transacción para
 * obtener una conexión del pool antes de abortar.
 * Ver docs/decisions/0006-filtro-excepciones-prisma.md.
 */
export const TX_TIMEOUT_MS = 15000;
export const TX_MAX_WAIT_MS = 5000;

export const TX_OPTIONS = {
  timeout: TX_TIMEOUT_MS,
  maxWait: TX_MAX_WAIT_MS,
};
