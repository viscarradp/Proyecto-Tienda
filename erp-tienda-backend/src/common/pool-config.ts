import type { PoolConfig } from 'pg';

/** Máximo de conexiones por instancia si DB_POOL_MAX no está definida. */
export const DB_POOL_MAX_DEFAULT = 5;

/**
 * Opciones del pool `pg`. El tamaño máximo viene de DB_POOL_MAX (por
 * instancia: instancias x max debe caber en el límite del plan de la BD).
 */
export function opcionesPool(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const raw = env.DB_POOL_MAX?.trim();
  let max = DB_POOL_MAX_DEFAULT;
  if (raw) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(
        `DB_POOL_MAX debe ser un entero >= 1 (recibido: "${raw}").`,
      );
    }
    max = n;
  }
  return {
    connectionString: env.DATABASE_URL,
    max,
    // Cerrar conexiones ociosas antes de que el pooler las corte por su lado.
    idleTimeoutMillis: 30_000,
    // No colgar una petición indefinidamente si la BD no responde.
    connectionTimeoutMillis: 10_000,
  };
}
