import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { acquireAdvisoryLock, CajaTurnoRow } from './concurrency';
import { BOVEDA_LEDGER_LOCK, saldoBovedaDerivado } from './cuentas-efectivo';
import { avisoBovedaNegativa, avisoGavetaNegativa } from './avisos-fondos';

/**
 * Anular = marcar, nunca borrar (L12 · ADR 0012). Utilidades compartidas por
 * la anulación de movimientos de dinero y la de compras (que revierte su pago).
 */

/** Movimientos de libre registro: los únicos que se anulan directamente. */
export const TIPOS_MOVIMIENTO_ANULABLES = [
  'EGRESO_OPERATIVO',
  'RETIRO_PERSONAL',
  'INGRESO_CAPITAL',
];

export interface MovimientoParaAnular {
  id: number;
  monto: Prisma.Decimal | string | number;
  cuenta_origen: string | null;
  cuenta_destino: string | null;
  caja_turno_id: number | null;
}

const toca = (m: MovimientoParaAnular, cuenta: string) =>
  m.cuenta_origen === cuenta || m.cuenta_destino === cuenta;

/**
 * Toma los locks que exige anular el movimiento, en el orden global del
 * ADR 0001 (turno → bóveda). Si toca la gaveta, su turno debe seguir ABIERTA:
 * un turno cerrado es un cuadre histórico inmutable.
 */
export async function bloquearParaAnular(
  tx: Prisma.TransactionClient,
  mov: MovimientoParaAnular,
  mensajeTurnoCerrado: string,
): Promise<void> {
  if (toca(mov, 'GAVETA')) {
    if (mov.caja_turno_id === null) {
      throw new BadRequestException(mensajeTurnoCerrado);
    }
    const [turno] = await tx.$queryRaw<CajaTurnoRow[]>`
      SELECT id, estado
      FROM cajas_turnos
      WHERE id = ${mov.caja_turno_id}
      FOR UPDATE
    `;
    if (!turno || turno.estado !== 'ABIERTA') {
      throw new BadRequestException(mensajeTurnoCerrado);
    }
  }
  if (toca(mov, 'BOVEDA')) {
    await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);
  }
}

/**
 * Marca el movimiento como anulado y revierte su efecto exacto en la gaveta
 * (los locks ya los tomó `bloquearParaAnular`). La bóveda se deriva del libro:
 * al marcarlo anulado deja de contar sola. Devuelve el aviso de saldo negativo
 * que corresponda (registrar y avisar, ADR 0011).
 */
export async function marcarMovimientoAnulado(
  tx: Prisma.TransactionClient,
  mov: MovimientoParaAnular,
  motivo: string,
  userId: number | undefined,
): Promise<{ aviso: string | null }> {
  // Se reclama bajo lock: una doble anulación (o dos concurrentes) falla aquí.
  const marcado = await tx.movimientos_financieros.updateMany({
    where: { id: mov.id, anulado: false },
    data: {
      anulado: true,
      anulado_en: new Date(),
      anulado_por_id: userId ?? null,
      motivo_anulacion: motivo,
    },
  });
  if (marcado.count === 0) {
    throw new BadRequestException('Este movimiento ya está anulado.');
  }

  const monto = new Prisma.Decimal(mov.monto);
  let aviso: string | null = null;

  if (toca(mov, 'GAVETA') && mov.caja_turno_id !== null) {
    // Origen GAVETA: el dinero había salido, vuelve. Destino GAVETA: había
    // entrado, se quita.
    const vuelve = mov.cuenta_origen === 'GAVETA';
    const turno = await tx.cajas_turnos.update({
      where: { id: mov.caja_turno_id },
      data: {
        efectivo_esperado: vuelve ? { increment: monto } : { decrement: monto },
      },
      select: { efectivo_esperado: true },
    });
    aviso = avisoGavetaNegativa(turno.efectivo_esperado ?? 0);
  } else if (toca(mov, 'BOVEDA')) {
    aviso = avisoBovedaNegativa(await saldoBovedaDerivado(tx));
  }

  return { aviso };
}
