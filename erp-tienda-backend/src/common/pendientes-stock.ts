import { Prisma } from '@prisma/client';

/**
 * "Deuda de stock" (L5a · D-01): lo que se vendió sin que el sistema tuviera
 * stock registrado. Estas funciones concentran la lógica que comparten
 * compras, ajustes de conteo, anulaciones y devoluciones.
 *
 * Orden global de locks (ver docs/decisions/0001-concurrencia-for-update.md):
 *   turno → venta → lotes → pendientes.
 * Quien llame a estas funciones debe haber bloqueado ANTES el turno, la venta y
 * los lotes que correspondan; aquí solo se bloquean los pendientes.
 *
 * Aproximación aceptada: cubrir un pendiente con un lote NO crea filas en
 * `detalle_venta_lotes` ni cambia el costo ya congelado de la venta (el
 * estimado). La diferencia entre el costo estimado y el costo real del lote se
 * absorbe en el inventario.
 */

const DECIMALES_CANTIDAD = 3;

/** Fila de pendientes_stock leída con FOR UPDATE. */
export interface PendienteRow {
  id: number;
  detalle_venta_id: number;
  producto_id: number;
  cantidad_base: Prisma.Decimal | string;
  cantidad_pendiente: Prisma.Decimal | string;
  lote_resuelto_id: number | null;
}

/** Redondeo de cantidades a 3 decimales, mitad hacia arriba. */
export function redondearCantidad(valor: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(valor).toDecimalPlaces(
    DECIMALES_CANTIDAD,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

/**
 * Bloquea (FOR UPDATE, por id ascendente) las filas de lotes indicadas.
 * Úsalo antes de bloquear pendientes si vas a tocar lotes que ya conoces.
 */
export async function bloquearLotes(
  tx: Prisma.TransactionClient,
  ids: number[],
): Promise<void> {
  const unicos = [...new Set(ids)].sort((a, b) => a - b);
  if (unicos.length === 0) return;
  await tx.$queryRaw`
    SELECT id
    FROM lotes_inventario
    WHERE id IN (${Prisma.join(unicos)})
    ORDER BY id
    FOR UPDATE
  `;
}

/** Bloquea y lee (estado fresco) los pendientes de las líneas indicadas. */
export async function bloquearPendientesDeDetalles(
  tx: Prisma.TransactionClient,
  detalleIds: number[],
): Promise<PendienteRow[]> {
  if (detalleIds.length === 0) return [];
  return tx.$queryRaw<PendienteRow[]>`
    SELECT id, detalle_venta_id, producto_id, cantidad_base,
           cantidad_pendiente, lote_resuelto_id
    FROM pendientes_stock
    WHERE detalle_venta_id IN (${Prisma.join(detalleIds)})
    ORDER BY id
    FOR UPDATE
  `;
}

/**
 * Cubre los pendientes ABIERTOS de un producto con el stock de UN lote, del
 * más viejo al más nuevo, hasta donde alcance. Descuenta del lote lo cubierto,
 * baja `cantidad_pendiente` y, si llega a 0, marca `resuelto_en`. Siempre deja
 * en `lote_resuelto_id` el último lote que cubrió algo, para poder devolver
 * esas unidades si la venta se anula.
 *
 * Precondición: el llamador ya tiene el lote bloqueado (o es una fila nueva de
 * su propia transacción). Devuelve la cantidad cubierta.
 */
export async function resolverPendientesConLote(
  tx: Prisma.TransactionClient,
  productoId: number,
  loteId: number,
): Promise<Prisma.Decimal> {
  const [lote] = await tx.$queryRaw<
    { cantidad_disponible: Prisma.Decimal | string }[]
  >`
    SELECT cantidad_disponible
    FROM lotes_inventario
    WHERE id = ${loteId}
  `;
  let restante = new Prisma.Decimal(lote?.cantidad_disponible ?? 0);
  if (restante.lte(0)) return new Prisma.Decimal(0);

  const abiertos = await tx.$queryRaw<
    { id: number; cantidad_pendiente: Prisma.Decimal | string }[]
  >`
    SELECT id, cantidad_pendiente
    FROM pendientes_stock
    WHERE producto_id = ${productoId}
      AND resuelto_en IS NULL
      AND cantidad_pendiente > 0
    ORDER BY fecha ASC, id ASC
    FOR UPDATE
  `;

  let cubiertoTotal = new Prisma.Decimal(0);
  for (const p of abiertos) {
    if (restante.lte(0)) break;
    const pendiente = new Prisma.Decimal(p.cantidad_pendiente);
    const cubierto = Prisma.Decimal.min(pendiente, restante);
    const queda = pendiente.sub(cubierto);
    await tx.pendientes_stock.update({
      where: { id: p.id },
      data: {
        cantidad_pendiente: queda,
        lote_resuelto_id: loteId,
        resuelto_en: queda.lte(0) ? new Date() : null,
      },
    });
    restante = restante.sub(cubierto);
    cubiertoTotal = cubiertoTotal.add(cubierto);
  }

  if (cubiertoTotal.gt(0)) {
    await tx.lotes_inventario.update({
      where: { id: loteId },
      data: { cantidad_disponible: { decrement: cubiertoTotal } },
    });
  }
  return cubiertoTotal;
}

/**
 * Anulación de una venta: la parte aún no cubierta se cancela y la parte ya
 * cubierta vuelve al lote que la cubrió. `filas` debe venir de
 * `bloquearPendientesDeDetalles` (estado fresco y bloqueado).
 */
export async function revertirPendientesPorAnulacion(
  tx: Prisma.TransactionClient,
  filas: PendienteRow[],
): Promise<void> {
  for (const p of filas) {
    const cubierto = new Prisma.Decimal(p.cantidad_base).sub(
      p.cantidad_pendiente,
    );
    if (cubierto.gt(0) && p.lote_resuelto_id !== null) {
      await tx.lotes_inventario.update({
        where: { id: p.lote_resuelto_id },
        data: { cantidad_disponible: { increment: cubierto } },
      });
    }
    await tx.pendientes_stock.update({
      where: { id: p.id },
      data: { cantidad_pendiente: 0, resuelto_en: new Date() },
    });
  }
}

/**
 * Devolución con destino REINGRESO de `cantidadBase` unidades base de un
 * pendiente: primero baja lo que sigue abierto (la unidad volvió al estante,
 * la compra ya no tiene que cubrirla) y el resto vuelve al lote que lo cubrió.
 * `fila` debe estar bloqueada y fresca.
 */
export async function reingresarPendiente(
  tx: Prisma.TransactionClient,
  fila: PendienteRow,
  cantidadBase: Prisma.Decimal,
): Promise<void> {
  if (cantidadBase.lte(0)) return;
  const pendiente = new Prisma.Decimal(fila.cantidad_pendiente);
  const deAbierto = Prisma.Decimal.min(cantidadBase, pendiente);
  const deLote = cantidadBase.sub(deAbierto);

  if (deAbierto.gt(0)) {
    const queda = pendiente.sub(deAbierto);
    await tx.pendientes_stock.update({
      where: { id: fila.id },
      data: {
        cantidad_pendiente: queda,
        resuelto_en: queda.lte(0) ? new Date() : null,
      },
    });
  }
  if (deLote.gt(0) && fila.lote_resuelto_id !== null) {
    await tx.lotes_inventario.update({
      where: { id: fila.lote_resuelto_id },
      data: { cantidad_disponible: { increment: deLote } },
    });
  }
}
