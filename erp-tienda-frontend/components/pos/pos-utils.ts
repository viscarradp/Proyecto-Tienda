import { centavosAMonto, formatMoney } from "@/lib/format"
import { TERMINOS } from "@/lib/glosario"

/**
 * ¿La presentación se vende por peso o medida (libra, onza, kilo, gramo)?
 * Sin importar mayúsculas ni tildes: "Libra", "LB", "500 g", "Kilogramo".
 */
export function esPresentacionDePeso(descripcion: string | undefined | null): boolean {
  if (!descripcion) return false
  const texto = descripcion.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  return /(?:^|[^a-z])(?:libras?|lbs?|onzas?|oz|kilos?|kgs?|kilogramos?|gramos?|grs?|g)(?:[^a-z]|$)/.test(texto)
}

/**
 * Texto del aviso al cerrar caja. `diferenciaCentavos` = contado − esperado
 * (negativo: faltó; positivo: sobró). `fondoSiguiente` en dólares.
 */
export function textoResultadoCierre(diferenciaCentavos: number | null, fondoSiguiente: number): string {
  const resultado =
    diferenciaCentavos === null || diferenciaCentavos === 0
      ? "Cuadró"
      : diferenciaCentavos < 0
        ? `${TERMINOS.falto} ${formatMoney(centavosAMonto(-diferenciaCentavos))}`
        : `${TERMINOS.sobro} ${formatMoney(centavosAMonto(diferenciaCentavos))}`
  return `Caja cerrada · ${resultado} · ${TERMINOS.fondoSiguiente}: ${formatMoney(fondoSiguiente)}`
}

/** Un solo aviso corto para los productos vendidos sin stock registrado. */
export function textoAvisosSinStock(cantidad: number): string {
  return cantidad === 1
    ? "1 producto se vendió sin stock registrado"
    : `${cantidad} productos se vendieron sin stock registrado`
}
