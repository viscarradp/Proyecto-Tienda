import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { Prisma } from '@prisma/client';
import { acquireAdvisoryLock, CajaTurnoRow } from '../common/concurrency';

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCompraDto: CreateCompraDto) {
    const { detalles_lotes, ...compraData } = createCompraDto;

    // ── BUG 2: Validar coherencia lógica AL_CREDITO vs origen_fondos ──
    // Una compra a crédito significa que todavía no se paga.
    // No puede descontar dinero real de la caja POS ni de la caja general.
    if (
      compraData.estado_pago === 'AL_CREDITO' &&
      compraData.origen_fondos !== 'CAPITAL_DUEÑOS'
    ) {
      throw new BadRequestException(
        'Una compra a crédito no puede descontar fondos de caja. ' +
          'Usa "CAPITAL_DUEÑOS" como origen o cambia el estado de pago a "PAGADO".',
      );
    }

    // ── BUG 3: Calcular monto_total desde los lotes (no confiar en el cliente) ──
    const montoCalculado = detalles_lotes.reduce(
      (sum, lote) =>
        sum + lote.cantidad_inicial * lote.costo_unitario_adquisicion,
      0,
    );

    return await this.prisma.$transaction(async (tx) => {
      // Paso 1: Crear el registro de compra usando el monto calculado
      const compra = await tx.compras_inventario.create({
        data: {
          proveedor: compraData.proveedor,
          monto_total: montoCalculado, // ← monto real, no el del cliente
          estado_pago: compraData.estado_pago,
          origen_fondos: compraData.origen_fondos,
        },
      });

      // Paso 2: Crear los lotes de inventario
      for (const lote of detalles_lotes) {
        await tx.lotes_inventario.create({
          data: {
            producto_id: lote.producto_id,
            compra_id: compra.id,
            costo_unitario_adquisicion: lote.costo_unitario_adquisicion,
            cantidad_inicial: lote.cantidad_inicial,
            cantidad_disponible: lote.cantidad_inicial, // Regla de oro
            fecha_vencimiento: lote.fecha_vencimiento
              ? new Date(lote.fecha_vencimiento)
              : null,
          },
        });
      }

      // Paso 3: Cuentas por Pagar
      // Gracias a la validación del Bug 2, si llegamos aquí con AL_CREDITO,
      // el origen_fondos es CAPITAL_DUEÑOS → no habrá doble impacto financiero.
      if (compraData.estado_pago === 'AL_CREDITO') {
        await tx.cuentas_por_pagar.create({
          data: {
            compra_id: compra.id,
            acreedor: compraData.proveedor,
            monto_deuda: montoCalculado,
            saldo_pendiente: montoCalculado,
          },
        });
      }

      // Paso 4: Impacto en Caja
      if (compraData.origen_fondos === 'CAJA_POS') {
        // Bloquea la fila del turno abierto: evita que dos compras concurrentes
        // lean el mismo efectivo_esperado y ambas pasen la validación de fondos
        // (ver docs/decisions/0001-concurrencia-for-update.md).
        const [cajaActiva] = await tx.$queryRaw<CajaTurnoRow[]>`
          SELECT id, efectivo_esperado
          FROM cajas_turnos
          WHERE estado = 'ABIERTA'
          FOR UPDATE
        `;

        if (!cajaActiva) {
          throw new BadRequestException(
            'No hay turno abierto para sacar el dinero de la caja POS',
          );
        }

        // ── BUG 9: Validar fondos suficientes antes de decrementar ──
        const efectivoDisponible = Number(cajaActiva.efectivo_esperado ?? 0);
        if (efectivoDisponible < montoCalculado) {
          throw new BadRequestException(
            `Fondos insuficientes en caja POS. ` +
              `Disponible: $${efectivoDisponible.toFixed(2)}, ` +
              `Requerido: $${montoCalculado.toFixed(2)}`,
          );
        }

        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: cajaActiva.id,
            tipo_movimiento: 'PAGO_PROVEEDOR',
            monto: montoCalculado,
            descripcion: `Pago a proveedor ${compraData.proveedor} por compra ID ${compra.id}`,
          },
        });

        // Actualizar el efectivo esperado en la caja (se resta la compra)
        await tx.cajas_turnos.update({
          where: { id: cajaActiva.id },
          data: {
            efectivo_esperado: { decrement: montoCalculado },
          },
        });
      } else if (compraData.origen_fondos === 'CAJA_GENERAL') {
        // caja_general es un libro de movimientos (no un contador de una sola
        // fila), así que el saldo se calcula con SUM(). Un advisory lock
        // serializa esta sección crítica entre transacciones concurrentes
        // (ver docs/decisions/0001-concurrencia-for-update.md).
        await acquireAdvisoryLock(tx, 'caja_general_ledger');

        // Validar fondos suficientes en caja general
        const saldoAgg = await tx.caja_general.aggregate({
          _sum: { monto: true },
        });
        const saldoDisponible = Number(saldoAgg._sum.monto ?? 0);

        if (saldoDisponible < montoCalculado) {
          throw new BadRequestException(
            `Fondos insuficientes en caja general. ` +
              `Disponible: $${saldoDisponible.toFixed(2)}, ` +
              `Requerido: $${montoCalculado.toFixed(2)}`,
          );
        }

        const montoDecimal = new Prisma.Decimal(-montoCalculado);
        await tx.caja_general.create({
          data: {
            monto: montoDecimal,
            descripcion: `Pago a proveedor ${compraData.proveedor} de compra ID ${compra.id}`,
          },
        });
      }

      return compra;
    });
  }

  async findAll() {
    return this.prisma.compras_inventario.findMany({
      include: {
        lotes_inventario: true,
      },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(id: number) {
    const compra = await this.prisma.compras_inventario.findUnique({
      where: { id },
      include: {
        lotes_inventario: true,
        cuentas_por_pagar: true,
      },
    });

    if (!compra) {
      throw new NotFoundException(`Compra con ID ${id} no encontrada`);
    }

    return compra;
  }
}
