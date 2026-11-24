/**
 * Validación de los campos de una presentación (factor y precio). Mismos
 * límites que el backend, para avisar en el campo y no corregir nada en
 * silencio.
 */

const FACTOR_MIN = 0.001
const FACTOR_MAX = 99999
const PRECIO_MAX = 999999.99

/** Número escrito por la usuaria; null si está vacío o no es un número. */
function leer(texto: string): number | null {
  const t = texto.trim()
  if (t === "") return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function decimales(texto: string): number {
  const t = texto.trim().toLowerCase()
  if (t.includes("e")) return 99
  const i = t.indexOf(".")
  return i === -1 ? 0 : t.length - i - 1
}

/** Mensaje de error del factor ("Múltiplo"), o null si es válido. */
export function errorFactor(texto: string): string | null {
  const n = leer(texto)
  if (n === null) return "Escribe cuántas unidades trae (por ejemplo 1 o 12)"
  if (n < FACTOR_MIN) return "Debe ser 0.001 o más"
  if (n > FACTOR_MAX) return `No puede superar ${FACTOR_MAX}`
  if (decimales(texto) > 3) return "Máximo 3 decimales"
  return null
}

/** Mensaje de error del precio, o null si es válido. Vacío NO es válido. */
export function errorPrecio(texto: string): string | null {
  const n = leer(texto)
  if (n === null) return "Ponle precio a esta presentación"
  if (n < 0) return "El precio no puede ser negativo"
  if (n > PRECIO_MAX) return "El precio es demasiado alto"
  if (decimales(texto) > 2) return "Máximo 2 decimales (centavos)"
  return null
}

/** Aviso (no bloquea) cuando el precio es exactamente $0.00. */
export function avisoPrecio(texto: string): string | null {
  const n = leer(texto)
  return n === 0 ? "Se venderá gratis" : null
}

/** Mensaje bajo un campo: error en rojo o aviso en ámbar. */
export function MensajeCampo({ error, aviso }: { error?: string | null; aviso?: string | null }) {
  if (error) return <p className="text-[11px] font-medium text-destructive">{error}</p>
  if (aviso) return <p className="text-[11px] font-medium text-warning">{aviso}</p>
  return null
}
