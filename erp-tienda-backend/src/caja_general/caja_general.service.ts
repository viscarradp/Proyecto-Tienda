import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { acquireAdvisoryLock } from '../common/concurrency';
import {
  BOVEDA_LEDGER_LOCK,
  saldoBovedaDerivado,
} from '../common/cuentas-efectivo';
import { TOLERANCIA_DESCUADRE } from '../common/tolerancia';

/**
 * "Caja general" = bóveda. Desde el Bloque 1.C ya NO es una tabla propia: su
 * saldo se DERIVA del libro de movimientos_financieros vía (origen, destino).
 * Este service expone lecturas del saldo/libro de bóveda y la inyección de
 * capital (ahora un movimiento con asiento, no una fila suelta).
 */
@Injectable()
export class CajaGeneralService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aporte del dueño a la bóveda. Antes creaba una fila en caja_general sin
   * movimiento de origen (fuga C); ahora es un INGRESO_CAPITAL (DUEÑOS→BOVEDA)
   * con su asiento en el libro.
   */
  async inyectarCapital(monto: number, descripcion?: string, userId?: number) {
    if (!monto || monto <= 0) {
      throw new BadRequestException('El monto de inyección debe ser mayor a 0');
    }

    return this.prisma.movimientos_financieros.create({
      data: {
        tipo_movimiento: 'INGRESO_CAPITAL',
        monto,
        descripcion:
          descripcion ||
          `Inyección de capital del dueño — $${monto.toFixed(2)}`,
        caja_turno_id: null,
        usuario_id: userId,
        cuenta_origen: 'DUEÑOS',
        cuenta_destino: 'BOVEDA',
      },
    });
  }

  /**
   * Arqueo de bóveda (§9, Bloque 2): el ADMIN declara el efectivo físico contado
   * en la bóveda; se compara contra el saldo derivado y, si difieren, se registra
   * un ajuste (`AJUSTE_BOVEDA_FALTANTE` BOVEDA→GASTO o `AJUSTE_BOVEDA_SOBRANTE`
   * GASTO→BOVEDA) que deja el derivado igual al físico. Le da a "¿dónde está el
   * dinero?" una respuesta verificable, no solo calculada.
   */
  async arqueo(
    saldoDeclarado: number,
    justificacion: string | undefined,
    userId?: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // El saldo es un agregado: lock antes de leer+escribir.
      await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);

      const esperado = await saldoBovedaDerivado(tx);
      const declarado = new Prisma.Decimal(saldoDeclarado);
      const diferencia = declarado.sub(esperado);
      const desc_abs = diferencia.abs();
      const justif = justificacion?.trim();

      if (desc_abs.greaterThanOrEqualTo(TOLERANCIA_DESCUADRE) && !justif) {
        throw new BadRequestException(
          `El descuadre de bóveda de $${desc_abs.toFixed(2)} requiere una ` +
            `justificación (umbral $${TOLERANCIA_DESCUADRE.toFixed(2)}).`,
        );
      }

      if (desc_abs.greaterThan(new Prisma.Decimal('0.001'))) {
        const faltante = diferencia.isNegative(); // declarado < esperado → falta
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: null,
            tipo_movimiento: faltante
              ? 'AJUSTE_BOVEDA_FALTANTE'
              : 'AJUSTE_BOVEDA_SOBRANTE',
            monto: desc_abs,
            descripcion: `Arqueo de bóveda${justif ? ` — ${justif}` : ''}`,
            usuario_id: userId,
            cuenta_origen: faltante ? 'BOVEDA' : 'GASTO',
            cuenta_destino: faltante ? 'GASTO' : 'BOVEDA',
          },
        });
      }

      const saldo_actual = await saldoBovedaDerivado(tx);
      return {
        saldo_esperado: esperado,
        saldo_declarado: declarado,
        diferencia,
        saldo_actual,
      };
    });
  }

  /** Saldo de bóveda derivado del libro (reemplaza el SUM sobre caja_general). */
  async getSaldo() {
    const saldo_actual = await saldoBovedaDerivado(this.prisma);
    const total_depositos = await this.prisma.movimientos_financieros.count({
      where: { cuenta_destino: 'BOVEDA' },
    });
    return { saldo_actual, total_depositos };
  }

  /** Libro de bóveda: movimientos que entran o salen de BOVEDA. */
  findAll() {
    return this.prisma.movimientos_financieros.findMany({
      where: {
        OR: [{ cuenta_origen: 'BOVEDA' }, { cuenta_destino: 'BOVEDA' }],
      },
      orderBy: { fecha: 'desc' },
      include: { categorias_gastos: true },
    });
  }
}
