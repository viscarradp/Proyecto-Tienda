import { aNumero, stockEnPresentacion } from "@/lib/format"

/** Lo mínimo que necesitamos de una presentación (compatible con la del store). */
export interface PresentacionUnidad {
  descripcion: string
  factor_conversion: number | string
}

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

const UNIDADES_CONOCIDAS: Record<string, string> = {
  libra: "lb", libras: "lb", lb: "lb", lbs: "lb",
  onza: "oz", onzas: "oz", oz: "oz",
  kilo: "kg", kilos: "kg", kg: "kg", kilogramo: "kg", kilogramos: "kg",
  gramo: "g", gramos: "g", g: "g", gr: "g",
  litro: "L", litros: "L", l: "L", lt: "L",
}

/**
 * Etiqueta corta de la unidad base: sale de la descripción de la presentación de factor 1
 * ("Libra" -> "lb"). Cualquier otra cosa (Unidad, Lata, Botella...) es "uds".
 */
export function unidadBase(presentaciones: PresentacionUnidad[] | null | undefined): string {
  const base = (presentaciones ?? []).find(p => aNumero(p.factor_conversion) === 1)
  if (!base) return "uds"
  return UNIDADES_CONOCIDAS[normalizar(base.descripcion)] ?? "uds"
}

/** Número a 2 decimales, sin ceros de sobra ("45.5", "4.43", "20"). */
function numero(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** Stock con su unidad: "45.5 lb", "4.43 lb", "20 uds". */
export function formatStock(
  cantidad: number | string | null | undefined,
  presentaciones: PresentacionUnidad[] | null | undefined,
): string {
  return `${numero(aNumero(cantidad))} ${unidadBase(presentaciones)}`
}

/**
 * Desglose en la presentación más grande: "44 uds = 7 six-packs + 2 sueltas".
 * null si no hay presentación de factor > 1 o no alcanza ni una completa.
 */
export function desgloseStock(
  cantidad: number | string | null | undefined,
  presentaciones: PresentacionUnidad[] | null | undefined,
): string | null {
  const stock = aNumero(cantidad)
  if (stock <= 0) return null
  const mayor = [...(presentaciones ?? [])]
    .filter(p => aNumero(p.factor_conversion) > 1)
    .sort((a, b) => aNumero(b.factor_conversion) - aNumero(a.factor_conversion))[0]
  if (!mayor) return null
  const { enteras, sueltas, haySueltas } = stockEnPresentacion(stock, mayor.factor_conversion)
  if (enteras < 1) return null
  const nombre = mayor.descripcion.trim().toLowerCase()
  const plural = enteras === 1 ? nombre : nombre.endsWith("s") ? nombre : `${nombre}s`
  const unidad = unidadBase(presentaciones)
  let texto = `${formatStock(stock, presentaciones)} = ${numero(enteras)} ${plural}`
  if (haySueltas) {
    texto += ` + ${numero(sueltas)} ${unidad === "uds" ? (sueltas === 1 ? "suelta" : "sueltas") : unidad}`
  }
  return texto
}

/** Redondeo half-up a `dec` decimales, sin el ruido de coma flotante. */
function redondearA(n: number, dec: number): number {
  const m = 10 ** dec
  return Math.round(Number((n * m).toFixed(6))) / m
}

export interface LineaCompraConvertida {
  /** Cantidad en unidad base (cantidad × factor, hasta 3 decimales). */
  cantidadBase: number
  /** Costo por unidad base, hasta 4 decimales (lo que admite el servidor). */
  costoUnitario: number
  /** Lo que el servidor guardará para la línea: cantidad base × costo, a 2 decimales. */
  totalGuardado: number
  /** totalGuardado menos lo que dice la factura (0 si el redondeo no desvía). */
  diferencia: number
}

/**
 * Convierte una línea tal como la dice la factura ("4 six-packs por $20") a lo que guarda el
 * sistema (unidades base y costo por unidad con 4 decimales). Si el costo redondeado no
 * reproduce el total al centavo, prueba los costos vecinos de 4 decimales y se queda con el
 * que más se acerca; `diferencia` queda en 0 salvo que ninguno lo logre (líneas de muchas unidades).
 * Devuelve null si la cantidad, el factor o el total no son mayores a 0.
 */
export function convertirLineaCompra(
  cantidad: number,
  factor: number,
  totalPagado: number,
): LineaCompraConvertida | null {
  if (!(cantidad > 0) || !(factor > 0) || !(totalPagado > 0)) return null
  const cantidadBase = redondearA(cantidad * factor, 3)
  if (!(cantidadBase > 0)) return null
  const objetivo = redondearA(totalPagado, 2)
  const centro = redondearA(totalPagado / cantidadBase, 4)
  let mejor: LineaCompraConvertida | null = null
  for (const paso of [0, 1, -1, 2, -2, 3, -3]) {
    const costo = redondearA(centro + paso * 0.0001, 4)
    if (costo <= 0) continue
    const guardado = redondearA(cantidadBase * costo, 2)
    const diferencia = redondearA(guardado - objetivo, 2)
    if (!mejor || Math.abs(diferencia) < Math.abs(mejor.diferencia)) {
      mejor = { cantidadBase, costoUnitario: costo, totalGuardado: guardado, diferencia }
    }
    if (diferencia === 0) break
  }
  return mejor
}
