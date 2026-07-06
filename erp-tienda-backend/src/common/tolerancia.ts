/**
 * Umbral de descuadre del cierre y del arqueo de bóveda (§7, Bloque 2).
 * Debajo de este monto, el descuadre se ajusta automáticamente sin pedir nada
 * (pero SIEMPRE se registra, para detectar el patrón de faltantes chiquitos
 * diarios). Desde este monto, la justificación es obligatoria.
 * Configurable por env `TOLERANCIA_DESCUADRE` (default $1.00).
 */
export const TOLERANCIA_DESCUADRE = Number(
  process.env.TOLERANCIA_DESCUADRE ?? '1.00',
);
