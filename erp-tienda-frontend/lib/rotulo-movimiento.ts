import { BOVEDA, GAVETA, etiquetaMovimiento } from "@/lib/glosario"

/** Lo mínimo de un movimiento para rotularlo. */
export interface MovimientoRotulable {
  tipo_movimiento: string
  cuenta_origen?: string | null
  cuenta_destino?: string | null
}

const enLaBoveda = `la ${BOVEDA.toLowerCase()}`

/**
 * Rótulo de un movimiento en lenguaje de tienda, según DÓNDE quedó (o de dónde
 * salió) el dinero. El tipo solo no alcanza: un aporte de la dueña
 * (`INGRESO_CAPITAL`) puede caer en la gaveta (apertura) o en la bóveda, y un
 * gasto o un pago a proveedor pueden salir de cualquiera de las dos.
 *
 *  INGRESO_CAPITAL   DUEÑOS → GAVETA   "Aporte de la dueña a la gaveta"
 *  INGRESO_CAPITAL   DUEÑOS → BÓVEDA   "Dinero puesto en la bóveda"
 *  EGRESO_OPERATIVO  GAVETA → GASTO    "Gasto"
 *  EGRESO_OPERATIVO  BÓVEDA → GASTO    "Gasto pagado de la bóveda"
 *  PAGO_PROVEEDOR    GAVETA → PROV.    "Pago a proveedor"
 *  PAGO_PROVEEDOR    BÓVEDA → PROV.    "Pago a proveedor (de la bóveda)"
 *  demás tipos                         el rótulo de glosario.ts
 */
export function rotuloMovimiento(mov: MovimientoRotulable): string {
  const { tipo_movimiento: tipo, cuenta_origen: origen, cuenta_destino: destino } = mov
  switch (tipo) {
    case "INGRESO_CAPITAL":
      if (destino === "GAVETA") return `Aporte de la dueña a la ${GAVETA.toLowerCase()}`
      if (destino === "BOVEDA") return `Dinero puesto en ${enLaBoveda}`
      break
    case "EGRESO_OPERATIVO":
      if (origen === "BOVEDA") return `Gasto pagado de ${enLaBoveda}`
      break
    case "PAGO_PROVEEDOR":
      if (origen === "BOVEDA") return `Pago a proveedor (de ${enLaBoveda})`
      break
  }
  return etiquetaMovimiento(tipo)
}
