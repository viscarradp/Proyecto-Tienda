/**
 * Glosario de la tienda (L10, UX-23). Un solo nombre para cada cosa, para que
 * todas las pantallas hablen igual. Evita "Caja POS", "Caja registradora",
 * "Caja del día" y "Caja general": el dinero vive en dos lugares.
 */

/** El efectivo del mostrador (la caja del turno). */
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
  faltoGaveta: "Faltó en la gaveta",
  soboGaveta: "Sobró en la gaveta",
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
