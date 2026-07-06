import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateMovimientosFinancieroDto } from './dto/create-movimientos_financiero.dto';
import { PrismaService } from '../prisma/prisma.service';
import { acquireAdvisoryLock, CajaTurnoRow } from '../common/concurrency';
import {
  BOVEDA_LEDGER_LOCK,
  CuentaEfectivo,
  saldoBovedaDerivado,
} from '../common/cuentas-efectivo';

@Injectable()
export class MovimientosFinancierosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createMovimientosFinancieroDto: CreateMovimientosFinancieroDto,
    userId?: number,
  ) {
    const { tipo_movimiento, categoria_gasto_id, monto, descripcion } =
      createMovimientosFinancieroDto;
    const origenFondos =
      createMovimientosFinancieroDto.origen_fondos ?? 'GAVETA';

    // Los egresos operativos son gastos del P&L → exigen categoría.
    if (tipo_movimiento === 'EGRESO_OPERATIVO' && !categoria_gasto_id) {
      throw new BadRequestException(
        'Los egresos operativos requieren una categoría de gasto',
      );
    }
    if (categoria_gasto_id) {
      const categoria = await this.prisma.categorias_gastos.findUnique({
        where: { id: categoria_gasto_id },
      });
      if (!categoria) {
        throw new NotFoundException(
          `Categoría de gasto con ID ${categoria_gasto_id} no encontrada`,
        );
      }
    }

    // ─── Egreso pagado desde la BÓVEDA (no exige turno, §5.6) ───
    const desdeBoveda =
      tipo_movimiento === 'EGRESO_OPERATIVO' && origenFondos === 'BOVEDA';

    if (desdeBoveda) {
      return await this.prisma.$transaction(async (tx) => {
        // El saldo de bóveda es un agregado: advisory lock antes de validarlo.
        await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);
        const saldo = await saldoBovedaDerivado(tx);
        if (saldo.lessThan(monto)) {
          throw new BadRequestException(
            `Fondos insuficientes en bóveda. ` +
              `Disponible: $${saldo.toFixed(2)}, Requerido: $${monto}`,
          );
        }
        return tx.movimientos_financieros.create({
          data: {
            tipo_movimiento,
            monto,
            descripcion,
            categoria_gasto_id,
            caja_turno_id: null,
            usuario_id: userId,
            cuenta_origen: 'BOVEDA',
            cuenta_destino: 'GASTO',
          },
        });
      });
    }

    // ─── Movimientos que tocan la GAVETA (requieren turno abierto) ───
    const cajaTurno = await this.prisma.cajas_turnos.findFirst({
      where: { estado: 'ABIERTA' },
    });
    if (!cajaTurno) {
      throw new BadRequestException(
        'No hay turno de caja abierto para registrar el movimiento',
      );
    }

    // (origen, destino) y efecto en la gaveta según el tipo (§5.1)
    let cuenta_origen: CuentaEfectivo;
    let cuenta_destino: CuentaEfectivo;
    let entraAGaveta = false; // suma a efectivo_esperado
    let saleDeGaveta = false; // resta de efectivo_esperado
    switch (tipo_movimiento) {
      case 'INGRESO_CAPITAL':
        cuenta_origen = 'DUEÑOS';
        cuenta_destino = 'GAVETA';
        entraAGaveta = true;
        break;
      case 'RETIRO_BOVEDA': // traslado gaveta → bóveda
        cuenta_origen = 'GAVETA';
        cuenta_destino = 'BOVEDA';
        saleDeGaveta = true;
        break;
      case 'EGRESO_OPERATIVO':
        cuenta_origen = 'GAVETA';
        cuenta_destino = 'GASTO';
        saleDeGaveta = true;
        break;
      case 'RETIRO_PERSONAL': // retiro del dueño: gaveta → patrimonio
        cuenta_origen = 'GAVETA';
        cuenta_destino = 'DUEÑOS';
        saleDeGaveta = true;
        break;
      default:
        throw new BadRequestException(
          `Tipo de movimiento no soportado: ${tipo_movimiento}`,
        );
    }

    return await this.prisma.$transaction(async (tx) => {
      // Bloquea la fila del turno ANTES de insertar el movimiento (que la
      // referencia por FK) y aprovecha la lectura para validar fondos en egresos
      // (ver docs/decisions/0001-concurrencia-for-update.md).
      const [cajaLocked] = await tx.$queryRaw<CajaTurnoRow[]>`
        SELECT id, efectivo_esperado
        FROM cajas_turnos
        WHERE id = ${cajaTurno.id}
        FOR UPDATE
      `;

      const movimiento = await tx.movimientos_financieros.create({
        data: {
          tipo_movimiento,
          monto,
          descripcion,
          categoria_gasto_id,
          caja_turno_id: cajaTurno.id,
          usuario_id: userId,
          cuenta_origen,
          cuenta_destino,
        },
      });

      if (entraAGaveta) {
        await tx.cajas_turnos.update({
          where: { id: cajaTurno.id },
          data: { efectivo_esperado: { increment: monto } },
        });
      } else if (saleDeGaveta) {
        const esperado = new Prisma.Decimal(cajaLocked?.efectivo_esperado ?? 0);
        if (esperado.lessThan(monto)) {
          throw new BadRequestException(
            `Fondos insuficientes en caja. ` +
              `Disponible: $${esperado.toFixed(2)}, Requerido: $${monto}`,
          );
        }
        await tx.cajas_turnos.update({
          where: { id: cajaTurno.id },
          data: { efectivo_esperado: { decrement: monto } },
        });
      }

      return movimiento;
    });
  }

  findAll(tipo_movimiento?: string, limit?: number) {
    const whereClause = tipo_movimiento ? { tipo_movimiento } : {};

    return this.prisma.movimientos_financieros.findMany({
      where: whereClause,
      orderBy: { fecha: 'desc' },
      take: limit ? limit : undefined,
      include: {
        categorias_gastos: true,
      },
    });
  }

  async findOne(id: number) {
    const movimiento = await this.prisma.movimientos_financieros.findUnique({
      where: { id },
      include: {
        categorias_gastos: true,
      },
    });
    if (!movimiento) {
      throw new NotFoundException(
        `Movimiento financiero con ID ${id} no encontrado`,
      );
    }
    return movimiento;
  }
}
