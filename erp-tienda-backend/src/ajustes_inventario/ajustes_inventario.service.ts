import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateAjusteInventarioDto } from './dto/create-ajustes_inventario.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CajaTurnoRow, LoteInventarioRow } from '../common/concurrency';
import { TX_OPTIONS } from '../common/transaccion';
import { redondearDinero } from '../common/redondeo';
import { resolverPendientesConLote } from '../common/pendientes-stock';

@Injectable()
export class AjustesInventarioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAjusteDto: CreateAjusteInventarioDto, userId?: number) {
    const { lote_id, cantidad_ajustada, tipo_ajuste, justificacion } =
      createAjusteDto;

    // Ajuste POSITIVO (encontrar stock / conteo hacia arriba) vs merma (§6, 2.D).
    const esPositivo = tipo_ajuste === 'CONTEO_SOBRANTE';

    return await this.prisma.$transaction(async (tx) => {
      // Orden global de locks: turno → (venta) → lotes
      // (ver docs/decisions/0001-concurrencia-for-update.md). Una merma inserta
      // un movimiento que referencia al turno por FK; si se bloqueara el lote
      // primero, una venta concurrente (que bloquea turno → lotes) podría
      // deadlockear con este ajuste. Por eso, si hay turno abierto, se bloquea
      // PRIMERO y solo después el lote. Un sobrante no genera movimiento, así
      // que no necesita el turno.
      let cajaActivaId: number | null = null;
      if (!esPositivo) {
        const [cajaActiva] = await tx.$queryRaw<CajaTurnoRow[]>`
          SELECT id, estado
          FROM cajas_turnos
          WHERE estado = 'ABIERTA'
          FOR UPDATE
        `;
        cajaActivaId = cajaActiva?.id ?? null;
      }

      // 1. Buscar el lote BAJO LOCK y validarlo: una venta concurrente no puede
      //    descontarlo entre esta lectura y la escritura.
      const [lote] = await tx.$queryRaw<LoteInventarioRow[]>`
        SELECT id, producto_id, cantidad_disponible, costo_unitario_adquisicion
        FROM lotes_inventario
        WHERE id = ${lote_id}
        FOR UPDATE
      `;

      if (!lote) {
        throw new NotFoundException(`Lote con ID ${lote_id} no encontrado`);
      }

      // 2. Validar Cantidad (Decimal desde 1.B). Para un ajuste positivo no hay
      //    tope: se está AGREGANDO stock, no quitando.
      if (
        !esPositivo &&
        new Prisma.Decimal(lote.cantidad_disponible).lessThan(cantidad_ajustada)
      ) {
        throw new BadRequestException(
          'La cantidad a ajustar supera la disponibilidad del lote: ' +
            `quedan ${new Prisma.Decimal(lote.cantidad_disponible).toString()} ` +
            'en el lote. Revisa la cantidad (puede haberse vendido hace un momento).',
        );
      }

      // 3. Costo del ajuste (valorado al costo del lote), a 2 decimales
      const costo_asumido = redondearDinero(
        new Prisma.Decimal(cantidad_ajustada).mul(
          lote.costo_unitario_adquisicion,
        ),
      );

      // 4. Actualizar el Lote: incrementa (positivo) o decrementa (merma).
      await tx.lotes_inventario.update({
        where: { id: lote_id },
        data: {
          cantidad_disponible: esPositivo
            ? { increment: cantidad_ajustada }
            : { decrement: cantidad_ajustada },
        },
      });

      // 4b. Deuda de stock (D-01): un sobrante de conteo es stock nuevo; cubre
      //     los pendientes abiertos del producto con este lote (ya bloqueado).
      //     Orden de locks: lotes → pendientes.
      if (esPositivo) {
        await resolverPendientesConLote(tx, lote.producto_id, lote_id);
      }

      // 5. Registrar el Ajuste
      const ajuste = await tx.ajustes_inventario.create({
        data: {
          lote_id,
          cantidad_ajustada,
          tipo_ajuste,
          justificacion,
          costo_asumido,
          usuario_id: userId,
        },
        include: {
          lotes_inventario: {
            include: {
              productos: true,
            },
          },
        },
      });

      // 6. Solo las MERMAS (ajustes negativos) impactan el P&L. Un sobrante de
      // conteo reingresa al inventario y su costo fluye al venderse (FIFO), así
      // que no genera movimiento financiero. La merma es una pérdida patrimonial
      // (NO salida de efectivo, sin cuentas origen/destino) y se registra SIEMPRE,
      // haya o no turno abierto (caja_turno_id nullable): una merma un domingo sin
      // turno también debe llegar al P&L del período.
      if (!esPositivo) {
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: cajaActivaId,
            tipo_movimiento: 'MERMA_INVENTARIO',
            monto: costo_asumido,
            descripcion:
              `Merma: ${tipo_ajuste}` +
              (justificacion ? ` — ${justificacion}` : ' — Sin detalle') +
              ` (Lote #${lote_id})`,
            usuario_id: userId,
          },
        });
      }

      return ajuste;
    }, TX_OPTIONS);
  }

  findAll() {
    return this.prisma.ajustes_inventario.findMany({
      orderBy: { fecha: 'desc' },
      include: {
        lotes_inventario: {
          include: {
            productos: true,
          },
        },
      },
    });
  }

  async findOne(id: number) {
    const ajuste = await this.prisma.ajustes_inventario.findUnique({
      where: { id },
      include: {
        lotes_inventario: {
          include: {
            productos: true,
          },
        },
      },
    });

    if (!ajuste) {
      throw new NotFoundException(
        `Ajuste de inventario con ID ${id} no encontrado`,
      );
    }

    return ajuste;
  }
}
