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

/** Redondea a 3 decimales (half-up), como el servidor para las cantidades. */
export function redondear3(value: number): number {
  return Math.round(Number((value * 1000).toFixed(6))) / 1000
}

/** Lo que escribe la cajera ("1,5", ".5") → número, o null si no es un número válido. */
export function parseDecimal(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".")
  if (limpio === "" || !/^\d*\.?\d*$/.test(limpio) || limpio === ".") return null
  const n = parseFloat(limpio)
  return Number.isFinite(n) ? n : null
}

/** Cantidad estimada de una venta por monto: monto ÷ precio, 3 decimales. 0 si el precio es 0. */
export function cantidadDesdeMonto(monto: number, precio: number | string): number {
  const p = aNumero(precio)
  if (p <= 0) return 0
  return redondear3(monto / p)
}

/**
 * Stock (en unidades base) expresado en la unidad de una presentación.
 * Factor 1 → el número tal cual. Factor > 1 → paquetes enteros y unidades
 * sueltas que sobran (44 latas en six-packs de 6 → 7 paquetes + 2 sueltas).
 */
export function stockEnPresentacion(
  stockBase: number | string,
  factor: number | string,
): { enteras: number; sueltas: number; haySueltas: boolean } {
  const stock = redondear3(aNumero(stockBase))
  const f = aNumero(factor)
  if (f <= 1) return { enteras: stock, sueltas: 0, haySueltas: false }
  const enteras = Math.max(0, Math.floor(stock / f + 1e-9))
  const sueltas = redondear3(Math.max(0, stock - enteras * f))
  return { enteras, sueltas, haySueltas: sueltas > 0 }
}
