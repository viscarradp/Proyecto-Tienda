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
