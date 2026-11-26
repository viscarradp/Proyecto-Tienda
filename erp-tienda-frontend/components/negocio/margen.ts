export type MarginTone = "success" | "warning" | "destructive"

/** Umbrales únicos de margen ("te quedan por cada $100"): tarjeta, tabla y leyenda. */
export const MARGEN_BUENO = 25
export const MARGEN_BAJO = 10

export const marginTone = (margenPct: number): MarginTone =>
  margenPct >= MARGEN_BUENO ? "success" : margenPct >= MARGEN_BAJO ? "warning" : "destructive"

/** Unidades con máximo 2 decimales ("0.57", no "0.572"). */
export const formatUnidades = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
