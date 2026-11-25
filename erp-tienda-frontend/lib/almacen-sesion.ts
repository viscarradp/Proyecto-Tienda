import { generarId } from "@/lib/id"

/**
 * Acceso seguro a sessionStorage: puede no existir o lanzar (modo privado, datos
 * bloqueados, render en el servidor). Si falla, simplemente no persiste.
 */
export function leerSesion<T>(clave: string): T | null {
  try {
    const crudo = sessionStorage.getItem(clave)
    return crudo === null ? null : (JSON.parse(crudo) as T)
  } catch {
    return null
  }
}

export function guardarSesion(clave: string, valor: unknown): void {
  try {
    sessionStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* sin persistencia */
  }
}

export function borrarSesion(clave: string): void {
  try {
    sessionStorage.removeItem(clave)
  } catch {
    /* sin persistencia */
  }
}

// ─── Clave de idempotencia del cobro (CAJ-20) ───

const CLAVE_IDEM = "tienda-cobro-idem"

interface IdemGuardada {
  key: string
  firma: string
}

// Respaldo en memoria por si sessionStorage no está disponible.
let idemMemoria: IdemGuardada | null = null

/**
 * Clave de idempotencia para el cobro del ticket con esta firma. Si ya había una
 * para la misma firma (incluso de antes de recargar la página) la reutiliza, para
 * que el servidor devuelva la misma venta en vez de registrar otra. Si el ticket
 * cambió (firma distinta), genera una nueva.
 */
export function claveIdempotencia(firma: string, generar: () => string = generarId): string {
  const guardada = leerSesion<IdemGuardada>(CLAVE_IDEM) ?? idemMemoria
  if (guardada && guardada.firma === firma && typeof guardada.key === "string") {
    idemMemoria = guardada
    return guardada.key
  }
  const nueva: IdemGuardada = { key: generar(), firma }
  idemMemoria = nueva
  guardarSesion(CLAVE_IDEM, nueva)
  return nueva.key
}

/** Descarta la clave (cobro exitoso). */
export function olvidarClaveIdempotencia(): void {
  idemMemoria = null
  borrarSesion(CLAVE_IDEM)
}
