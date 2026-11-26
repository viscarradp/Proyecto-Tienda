/**
 * Convierte una línea de factura ("4 six-packs por $20") a lo que guarda el
 * sistema: unidades base y costo por unidad con 4 decimales. Es el mismo
 * algoritmo que `convertirLineaCompra` de `erp-tienda-frontend/lib/unidades.ts`
 * (si cambias uno, cambia el otro).
 */

/** Redondeo half-up a `dec` decimales, sin el ruido de coma flotante. */
export function redondearA(n: number, dec: number): number {
  const m = 10 ** dec;
  return Math.round(Number((n * m).toFixed(6))) / m;
}

export interface LineaCompraConvertida {
  /** Cantidad en unidad base (cantidad × factor, hasta 3 decimales). */
  cantidadBase: number;
  /** Costo por unidad base, hasta 4 decimales (lo que admite el servidor). */
  costoUnitario: number;
  /** Lo que el servidor guardará para la línea: cantidad base × costo, a 2 decimales. */
  totalGuardado: number;
  /** totalGuardado menos lo que dice la factura (0 si el redondeo no desvía). */
  diferencia: number;
}

/**
 * Si el costo redondeado no reproduce el total al centavo, prueba los costos
 * vecinos de 4 decimales y se queda con el que más se acerca. Devuelve null si
 * la cantidad, el factor o el total no son mayores a 0.
 */
export function convertirLineaCompra(
  cantidad: number,
  factor: number,
  totalPagado: number,
): LineaCompraConvertida | null {
  if (!(cantidad > 0) || !(factor > 0) || !(totalPagado > 0)) return null;
  const cantidadBase = redondearA(cantidad * factor, 3);
  if (!(cantidadBase > 0)) return null;
  const objetivo = redondearA(totalPagado, 2);
  const centro = redondearA(totalPagado / cantidadBase, 4);
  let mejor: LineaCompraConvertida | null = null;
  for (const paso of [0, 1, -1, 2, -2, 3, -3]) {
    const costo = redondearA(centro + paso * 0.0001, 4);
    if (costo <= 0) continue;
    const guardado = redondearA(cantidadBase * costo, 2);
    const diferencia = redondearA(guardado - objetivo, 2);
    if (!mejor || Math.abs(diferencia) < Math.abs(mejor.diferencia)) {
      mejor = {
        cantidadBase,
        costoUnitario: costo,
        totalGuardado: guardado,
        diferencia,
      };
    }
    if (diferencia === 0) break;
  }
  return mejor;
}
