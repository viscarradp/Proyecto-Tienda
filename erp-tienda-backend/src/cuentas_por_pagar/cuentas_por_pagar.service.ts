import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { acquireAdvisoryLock, CajaTurnoRow } from '../common/concurrency';
import { TX_OPTIONS } from '../common/transaccion';
import {
  BOVEDA_LEDGER_LOCK,
  saldoBovedaDerivado,
} from '../common/cuentas-efectivo';
import {
  avisoBovedaNegativa,
  avisoGavetaNegativa,
  soloAvisos,
} from '../common/avisos-fondos';
import { CreateAbonoDto } from './dto/create-abono.dto';

interface CuentaRow {
  id: number;
  acreedor: string;
  saldo_pendiente: Prisma.Decimal | string;
}

@Injectable()
export class CuentasPorPagarService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(estado?: string) {
    if (estado !== undefined && estado !== 'pendientes' && estado !== 'todas') {
      throw new BadRequestException(
        'El estado debe ser "pendientes" o "todas".',
      );
    }
    const soloPendientes = estado !== 'todas';

    const cuentas = await this.prisma.cuentas_por_pagar.findMany({
      where: soloPendientes ? { saldo_pendiente: { gt: 0 } } : undefined,
      include: {
        compras_inventario: {
          select: { id: true, fecha: true, monto_total: true },
        },
        abonos: { orderBy: { fecha: 'desc' } },
      },
      // Lo más viejo primero.
      orderBy: [{ fecha_creacion: 'asc' }, { id: 'asc' }],
    });

    const filas = cuentas.map((c) => ({
      id: c.id,
      compra_id: c.compra_id,
      acreedor: c.acreedor,
      fecha_compra: c.compras_inventario?.fecha ?? c.fecha_creacion,
      monto_compra: c.compras_inventario?.monto_total ?? c.monto_deuda,
      monto_deuda: c.monto_deuda,
      saldo_pendiente: c.saldo_pendiente,
      abonos: c.abonos.map((a) => ({
        id: a.id,
        monto: a.monto,
        fecha: a.fecha,
        usuario_id: a.usuario_id,
        movimiento_id: a.movimiento_id,
        nota: a.nota,
      })),
    }));

    if (!soloPendientes) {
      // Las pendientes antes que las saldadas (el sort es estable: dentro de
      // cada grupo queda la más vieja primero).
      filas.sort(
        (a, b) =>
          Number(a.saldo_pendiente.isZero()) -
          Number(b.saldo_pendiente.isZero()),
      );
    }
    return filas;
  }

  async abonar(cuentaId: number, dto: CreateAbonoDto, userId?: number) {
    const monto = new Prisma.Decimal(dto.monto);

    return this.prisma.$transaction(async (tx) => {
      // Orden de locks (ADR 0001): fondos (turno o bóveda) PRIMERO, luego la
      // fila de la cuenta. La política de fondos es registrar-y-avisar
      // (ADR 0011): solo se avisa, nunca se bloquea por saldo.
      let cajaTurnoId: number | null = null;
      let saldoFondos: Prisma.Decimal;

      if (dto.origen === 'GAVETA') {
        const [turno] = await tx.$queryRaw<CajaTurnoRow[]>`
          SELECT id, efectivo_esperado
          FROM cajas_turnos
          WHERE estado = 'ABIERTA'
          FOR UPDATE
        `;
        if (!turno) {
          throw new BadRequestException(
            'No hay turno abierto: abre la caja para pagar desde la gaveta, ' +
              'o elige pagar desde la bóveda.',
          );
        }
        cajaTurnoId = turno.id;
        saldoFondos = new Prisma.Decimal(turno.efectivo_esperado ?? 0);
      } else {
        await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);
        saldoFondos = await saldoBovedaDerivado(tx);
      }

      const [cuenta] = await tx.$queryRaw<CuentaRow[]>`
        SELECT id, acreedor, saldo_pendiente
        FROM cuentas_por_pagar
        WHERE id = ${cuentaId}
        FOR UPDATE
      `;
      if (!cuenta) {
        throw new NotFoundException(`Deuda con ID ${cuentaId} no encontrada`);
      }

      // Regla real (no de fondos): no se puede pagar más de lo que se debe.
      // Se revalida bajo el lock de la fila.
      const saldo = new Prisma.Decimal(cuenta.saldo_pendiente);
      if (monto.gt(saldo)) {
        throw new BadRequestException(
          saldo.isZero()
            ? 'Esta deuda ya está pagada.'
            : `El abono ($${monto.toFixed(2)}) es mayor que lo que se debe ` +
                `($${saldo.toFixed(2)}).`,
        );
      }

      const saldoDespues = saldoFondos.sub(monto);
      const aviso =
        dto.origen === 'GAVETA'
          ? avisoGavetaNegativa(saldoDespues)
          : avisoBovedaNegativa(saldoDespues);

      const movimiento = await tx.movimientos_financieros.create({
        data: {
          caja_turno_id: cajaTurnoId,
          tipo_movimiento: 'PAGO_PROVEEDOR',
          monto,
          descripcion: `Abono a deuda con ${cuenta.acreedor} (deuda ID ${cuenta.id})`,
          usuario_id: userId,
          cuenta_origen: dto.origen,
          cuenta_destino: 'PROVEEDOR',
        },
      });

      if (cajaTurnoId !== null) {
        await tx.cajas_turnos.update({
          where: { id: cajaTurnoId },
          data: { efectivo_esperado: { decrement: monto } },
        });
      }

      const cuentaActualizada = await tx.cuentas_por_pagar.update({
        where: { id: cuentaId },
        data: { saldo_pendiente: { decrement: monto } },
      });

      const abono = await tx.abono_deuda.create({
        data: {
          cuenta_id: cuentaId,
          monto,
          usuario_id: userId,
          movimiento_id: movimiento.id,
          nota: dto.nota ?? null,
        },
      });

      return {
        abono,
        cuenta: cuentaActualizada,
        saldo_pendiente: cuentaActualizada.saldo_pendiente,
        avisos: soloAvisos([aviso]),
      };
    }, TX_OPTIONS);
  }
}
