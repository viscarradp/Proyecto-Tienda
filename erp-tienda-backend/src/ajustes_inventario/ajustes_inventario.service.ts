import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MENSAJE_SOLO_DUENA } from '../common/permisos';
import { CreateAjusteInventarioDto } from './dto/create-ajustes_inventario.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CajaTurnoRow, LoteInventarioRow } from '../common/concurrency';
import { TX_OPTIONS } from '../common/transaccion';
import { redondearDinero } from '../common/redondeo';
import { resolverPendientesConLote } from '../common/pendientes-stock';

/** Tipos de ajuste negativo (mermas): la cajera puede registrarlos. */
const MERMAS = ['QUEBRADO', 'VENCIDO', 'ROBO'];

@Injectable()
export class AjustesInventarioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createAjusteDto: CreateAjusteInventarioDto,
    userId?: number,
    rol: string = 'ADMIN',
  ) {
    const { cantidad_ajustada, tipo_ajuste, producto_id } = createAjusteDto;
    const justificacion = createAjusteDto.justificacion?.trim() || undefined;

    // Ajuste POSITIVO (encontrar stock / conteo hacia arriba) vs merma (§6, 2.D).
    const esPositivo = tipo_ajuste === 'CONTEO_SOBRANTE';

    // D-06: la cajera registra mermas (con autor y motivo); los conteos son
    // de la dueña.
    if (rol !== 'ADMIN') {
      if (!MERMAS.includes(tipo_ajuste)) {
        throw new ForbiddenException(MENSAJE_SOLO_DUENA);
      }
      if (!justificacion) {
        throw new BadRequestException(
          'Escribe el motivo de la merma (qué pasó con el producto).',
        );
      }
    }

    if (createAjusteDto.lote_id !== undefined && producto_id !== undefined) {
      throw new BadRequestException(
        'Indica el lote o el producto, no los dos a la vez.',
      );
    }
    if (createAjusteDto.lote_id === undefined) {
      if (producto_id === undefined) {
        throw new BadRequestException('Indica el lote o el producto.');
      }
      if (!esPositivo) {
        throw new BadRequestException(
          'Las mermas se registran sobre un lote. Elige el lote.',
        );
      }
    }

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
      //    Con `producto_id` (solo sobrante) el lote es el más reciente del
      //    producto aunque esté en 0 (NEG-16).
      let lote: LoteInventarioRow | undefined;
      if (createAjusteDto.lote_id !== undefined) {
        [lote] = await tx.$queryRaw<LoteInventarioRow[]>`
          SELECT id, producto_id, cantidad_disponible, costo_unitario_adquisicion
          FROM lotes_inventario
          WHERE id = ${createAjusteDto.lote_id}
          FOR UPDATE
        `;
        if (!lote) {
          throw new NotFoundException(
            `Lote con ID ${createAjusteDto.lote_id} no encontrado`,
          );
        }
      } else {
        [lote] = await tx.$queryRaw<LoteInventarioRow[]>`
          SELECT id, producto_id, cantidad_disponible, costo_unitario_adquisicion
          FROM lotes_inventario
          WHERE producto_id = ${producto_id}
          ORDER BY fecha_ingreso DESC, id DESC
          LIMIT 1
          FOR UPDATE
        `;
        if (!lote) {
          const producto = await tx.productos.findUnique({
            where: { id: producto_id },
            select: { id: true },
          });
          if (!producto) {
            throw new NotFoundException(
              `Producto con ID ${producto_id} no encontrado`,
            );
          }
          throw new BadRequestException(
            'Registra una compra o el inventario inicial de este producto',
          );
        }
      }
      const lote_id = lote.id;

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
            ajuste_id: ajuste.id,
          },
        });
      }

      return ajuste;
    }, TX_OPTIONS);
  }

  /**
   * Anula una merma (ajuste negativo): devuelve la cantidad a su lote y marca
   * (nunca borra) el ajuste y su `MERMA_INVENTARIO`, que deja de contar como
   * pérdida. Los conteos sobrantes no se anulan: se corrigen con otra merma o
   * conteo. Cualquier momento (una merma no mueve efectivo). ADR 0012.
   */
  async anular(id: number, motivo: string, userId?: number) {
    const ajuste = await this.prisma.ajustes_inventario.findUnique({
      where: { id },
    });
    if (!ajuste) {
      throw new NotFoundException(
        `Ajuste de inventario con ID ${id} no encontrado`,
      );
    }
    if (ajuste.anulado) {
      throw new BadRequestException('Esta merma ya está anulada.');
    }
    if (ajuste.tipo_ajuste === 'CONTEO_SOBRANTE') {
      throw new BadRequestException(
        'Un conteo sobrante no se anula. Si te equivocaste, registra una merma o un conteo para corregirlo.',
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      // Lote bajo lock (orden global: turno → venta → lotes): una venta
      // concurrente no puede leer su cantidad a medias. Anular no inserta
      // filas que referencien al turno, así que no necesita bloquearlo.
      await tx.$queryRaw`
        SELECT id FROM lotes_inventario WHERE id = ${ajuste.lote_id} FOR UPDATE
      `;

      // Se reclama bajo lock: dos anulaciones concurrentes no devuelven dos veces.
      const marcado = await tx.ajustes_inventario.updateMany({
        where: { id, anulado: false },
        data: {
          anulado: true,
          anulado_en: new Date(),
          anulado_por_id: userId ?? null,
          motivo_anulacion: motivo,
        },
      });
      if (marcado.count === 0) {
        throw new BadRequestException('Esta merma ya está anulada.');
      }

      await tx.lotes_inventario.update({
        where: { id: ajuste.lote_id },
        data: { cantidad_disponible: { increment: ajuste.cantidad_ajustada } },
      });

      await tx.movimientos_financieros.updateMany({
        where: {
          ajuste_id: id,
          tipo_movimiento: 'MERMA_INVENTARIO',
          anulado: false,
        },
        data: {
          anulado: true,
          anulado_en: new Date(),
          anulado_por_id: userId ?? null,
          motivo_anulacion: motivo,
        },
      });

      return await tx.ajustes_inventario.findUniqueOrThrow({
        where: { id },
        include: {
          lotes_inventario: { include: { productos: true } },
          anulado_por: { select: { nombre: true } },
        },
      });
    }, TX_OPTIONS);
  }

  findAll() {
    return this.prisma.ajustes_inventario.findMany({
      orderBy: { fecha: 'desc' },
      include: {
        anulado_por: { select: { nombre: true } },
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
        anulado_por: { select: { nombre: true } },
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
