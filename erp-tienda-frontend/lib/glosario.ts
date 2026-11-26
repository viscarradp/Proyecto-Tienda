/**
 * Glosario de la tienda (L10, UX-23). Un solo nombre para cada cosa, para que
 * todas las pantallas hablen igual. Evita "Caja POS", "Caja registradora",
 * "Caja del día" y "Caja general": el dinero vive en dos lugares.
 */

/**
 * DECISIÓN (VIS-38): "Caja" = el turno (abrir caja, cerrar caja, "No hay caja
 * abierta"). "Gaveta" = el efectivo del mostrador. Nunca "turno" en pantalla.
 */
export const CAJA = "Caja"

/** El efectivo del mostrador (la gaveta del turno). */
export const GAVETA = "Gaveta"
/** El dinero guardado aparte. */
export const BOVEDA = "Bóveda"

export const GAVETA_AYUDA = "el efectivo del mostrador"
export const BOVEDA_AYUDA = "el dinero que guardas aparte"

/** Etiquetas de los reportes (Estadísticas) en lenguaje de tienda. */
export const ETIQUETAS_REPORTE = {
  ganancia: "Ganancia",
  vendido: "Vendido",
  devuelto: "Devuelto a clientes",
  costoVendido: "Lo que costó lo vendido",
  gananciaAntesGastos: "Ganancia antes de gastos",
  // Es el margen BRUTO (antes de gastos): no confundir con la "Ganancia" neta.
  gananciaPor100: "Te quedan por cada $100 vendidos (antes de gastos)",
  patrimonio: "Lo que vale el negocio",
  flujo: "Entradas y salidas de dinero",
  faltoGaveta: "Faltó al contar el dinero",
  soboGaveta: "Sobró al contar el dinero",
  cobradoVentas: "Cobrado en ventas",
  merma: "Mercadería perdida (rota, vencida o que no se encontró)",
  retirosDuena: "Lo que sacaste para ti",
  retirosDuenaNota: "No es gasto del negocio: no baja la ganancia.",
} as const

/** Nombre en lenguaje de tienda de cada tipo de movimiento de dinero. */
export const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  EGRESO_OPERATIVO: "Gasto",
  TRASLADO_A_BOVEDA: `Guardado en la ${BOVEDA.toLowerCase()}`,
  RETIRO_BOVEDA: `Guardado en la ${BOVEDA.toLowerCase()}`,
  TRASLADO_DESDE_BOVEDA: `Traído de la ${BOVEDA.toLowerCase()}`,
  RETIRO_PERSONAL: "Retiro personal",
  PAGO_PROVEEDOR: "Pago a proveedor",
  AJUSTE_FALTANTE: "Faltó al cerrar",
  AJUSTE_SOBRANTE: "Sobró al cerrar",
  INGRESO_CAPITAL: `Dinero puesto en la ${BOVEDA.toLowerCase()}`,
  AJUSTE_BOVEDA_FALTANTE: `Faltó al contar la ${BOVEDA.toLowerCase()}`,
  AJUSTE_BOVEDA_SOBRANTE: `Sobró al contar la ${BOVEDA.toLowerCase()}`,
}

export function etiquetaMovimiento(tipo: string): string {
  return ETIQUETA_MOVIMIENTO[tipo] ?? tipo
}

/**
 * Términos para las pantallas (§4 de la auditoría VIS). Cada clave dice cuál
 * palabra usar y cuál reemplaza. La fase 2 las aplica pantalla por pantalla.
 */
export const TERMINOS = {
  /** En lugar de "Procesar pago". */
  cobrar: "Cobrar",
  /** Un solo nombre para el modo apagón (CAJ-24). En lugar de "Modo apagón" / "Venta durante un apagón". */
  ventaCuaderno: "Venta del cuaderno",
  /** En lugar de "Cierre declarado". */
  loQueConto: "Lo que contó",
  /** En lugar de "Descuadre" (negativo). */
  falto: "Faltó",
  /** En lugar de "Descuadre" (positivo). */
  sobro: "Sobró",
  cuadra: "Cuadra",
  /** En lugar de "Reingresar". */
  vuelveAlEstante: "Vuelve al estante",
  /** En lugar de "Merma" / "Mercadería echada a perder". */
  mercaderiaPerdida: "Mercadería perdida",
  /** En lugar de "Artículos". */
  productos: "Productos",
  /** En lugar de "Present." / "pres.". */
  presentaciones: "Presentaciones",
  /** En lugar de "lote" ("Lotes de inventario", "Agregar lote"). */
  compra: "Compra",
  tanda: "Tanda",
  /** En lugar de "Múltiplo" / "Factor de conversión". */
  unidadesQueTrae: "Unidades que trae",
  /** En lugar de "Fondo siguiente turno". */
  fondoSiguiente: "Para empezar mañana",
  /** En lugar de "Capital de la dueña" / "aporte del dueño en especie". */
  aporteDuena: "Puesto por la dueña",
  /** En lugar de "Retiro personal" / "Lo que sacaste para ti" (un solo nombre). */
  retiroDuena: "Lo que sacaste para ti",
  /** En lugar de "uds" / "op.". */
  unidades: "unidades",
  ventas: "ventas",
  /** En lugar de "Haz clic": en celular se toca. */
  toca: "toca",
} as const

/** Nombre del rol en lenguaje de tienda (VIV-17, CAJ-34). */
export function etiquetaRol(rol?: string | null): string {
  if (rol === "ADMIN") return "Dueña"
  if (rol === "CAJERO") return "Cajera"
  return "Usuario"
}

/**
 * Fórmula única de error (VIS-42): "No se pudo {acción}. {qué hacer}."
 * `accion` va en infinitivo: mensajeError("cerrar la caja", err).
 * Si el error trae un mensaje del servidor (Error.message) se agrega al final.
 */
export function mensajeError(
  accion: string,
  err?: unknown,
  queHacer = "Intenta de nuevo; si sigue, avísale a la dueña.",
): string {
  const detalle = err instanceof Error && err.message ? ` (${err.message})` : ""
  return `No se pudo ${accion}. ${queHacer}${detalle}`
}
