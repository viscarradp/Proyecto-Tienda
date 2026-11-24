/**
 * Utilidades de formato. El negocio opera en USD (El Salvador).
 */

/** Formatea un monto como moneda USD: 1234.5 → "$1,234.50". */
export function formatMoney(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value
  const safe = Number.isFinite(n) ? n : 0
  return safe.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * La API devuelve los Decimal de Prisma como strings ("23", "48.500").
 * Convierte de forma segura a número; si no es válido devuelve 0.
 */
export function aNumero(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const n = typeof value === "number" ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/** Formatea una cantidad/stock: sin ceros a la izquierda ni sobrantes, hasta 3 decimales. "048.500" → "48.5". */
export function formatCantidad(value: number | string | null | undefined): string {
  return aNumero(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
}

/**
 * Total de una línea en centavos enteros: precio × cantidad redondeado a 2
 * decimales (half-up), igual que el servidor.
 */
export function totalLineaCentavos(precio: number | string, cantidad: number | string): number {
  const precioCentavos = Math.round(aNumero(precio) * 100)
  // toFixed(6) elimina el ruido de coma flotante antes de redondear half-up.
  return Math.round(Number((precioCentavos * aNumero(cantidad)).toFixed(6)))
}

/** Centavos enteros → monto en dólares (para formatMoney/MoneyValue). */
export function centavosAMonto(centavos: number): number {
  return centavos / 100
}

/** Monto en dólares → centavos enteros. */
export function montoACentavos(monto: number | string): number {
  return Math.round(aNumero(monto) * 100)
}
