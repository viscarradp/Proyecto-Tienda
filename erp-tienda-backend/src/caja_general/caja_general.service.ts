import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { saldoBovedaDerivado } from '../common/cuentas-efectivo';

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
