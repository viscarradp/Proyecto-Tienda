import { Prisma } from '@prisma/client';

/**
 * Única fuente de "cuánto efectivo hay en la gaveta" (ARQ-12). Antes la misma
 * lógica vivía copiada en getUltimoCierre, en la apertura de turno y en el
 * patrimonio. Con turno abierto la gaveta es su `efectivo_esperado`; sin turno,
 * lo declarado en el último cierre (CERRADA o CERRADA_FORZADA, por
 * `fecha_cierre`) menos los TRASLADO_A_BOVEDA de ESE turno.
 *
 * Acepta un cliente de transacción para poder usarse bajo lock en la apertura.
 */

/** Cliente mínimo que necesitan estas funciones (PrismaService o tx). */
export type ClienteGaveta = Pick<Prisma.TransactionClient, 'cajas_turnos'>;

export interface RemanenteCierre {
  fondo_siguiente: Prisma.Decimal;
  fecha_cierre: Date | null;
}

/**
 * Lo que quedó en la gaveta al último cierre (0 si nunca hubo un cierre),
 * ignorando si hay un turno abierto ahora.
 */
export async function remanenteDeUltimoCierre(
  client: ClienteGaveta,
): Promise<RemanenteCierre> {
  const ultimoCierre = await client.cajas_turnos.findFirst({
    // Incluye CERRADA_FORZADA: si el último turno se cerró forzado, el fondo
    // del siguiente se deriva de ESE cierre, no de uno viejo.
    where: { estado: { in: ['CERRADA', 'CERRADA_FORZADA'] } },
    orderBy: { fecha_cierre: 'desc' },
    include: {
      movimientos_financieros: {
        where: { tipo_movimiento: 'TRASLADO_A_BOVEDA' },
      },
    },
  });

  if (!ultimoCierre) {
    return { fondo_siguiente: new Prisma.Decimal(0), fecha_cierre: null };
  }

  // Lo que quedó = efectivo contado − lo trasladado a la bóveda en ese turno.
  const trasladado = ultimoCierre.movimientos_financieros.reduce(
    (acc, m) => acc.add(m.monto),
    new Prisma.Decimal(0),
  );
  const fondo_siguiente = new Prisma.Decimal(
    ultimoCierre.efectivo_declarado ?? 0,
  ).sub(trasladado);

  return { fondo_siguiente, fecha_cierre: ultimoCierre.fecha_cierre };
}

/** Efectivo en la gaveta ahora: turno abierto = esperado; si no, el remanente. */
export async function efectivoEnGaveta(
  client: ClienteGaveta,
): Promise<Prisma.Decimal> {
  const turnoAbierto = await client.cajas_turnos.findFirst({
    where: { estado: 'ABIERTA' },
  });
  if (turnoAbierto) {
    return new Prisma.Decimal(turnoAbierto.efectivo_esperado ?? 0);
  }
  return (await remanenteDeUltimoCierre(client)).fondo_siguiente;
}
