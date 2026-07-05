import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateAjusteInventarioDto } from './dto/create-ajustes_inventario.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AjustesInventarioService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAjusteDto: CreateAjusteInventarioDto, userId?: number) {
    const { lote_id, cantidad_ajustada, tipo_ajuste, justificacion } =
      createAjusteDto;

    return await this.prisma.$transaction(async (tx) => {
      // 1. Buscar y Validar el Lote
      const lote = await tx.lotes_inventario.findUnique({
        where: { id: lote_id },
      });

      if (!lote) {
        throw new NotFoundException(`Lote con ID ${lote_id} no encontrado`);
      }

      // 2. Validar Cantidad
      if (lote.cantidad_disponible < cantidad_ajustada) {
        throw new BadRequestException(
          'La cantidad a ajustar supera la disponibilidad del lote',
        );
      }

      // 3. Calcular Costo de la Pérdida
      const costo_asumido = new Prisma.Decimal(cantidad_ajustada).mul(
        lote.costo_unitario_adquisicion,
      );

      // 4. Actualizar el Lote: Resta la cantidad_ajustada de la cantidad_disponible
      await tx.lotes_inventario.update({
        where: { id: lote_id },
        data: {
          cantidad_disponible: {
            decrement: cantidad_ajustada,
          },
        },
      });

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

      // 6. BUG 4: Registrar la pérdida financieramente en el turno activo
      // La merma es una pérdida patrimonial (activo de inventario se reduce),
      // pero NO es una salida de efectivo de la gaveta, por eso NO se toca
      // efectivo_esperado. Solo queda como registro contable del período.
      const cajaActiva = await tx.cajas_turnos.findFirst({
        where: { estado: 'ABIERTA' },
      });

      if (cajaActiva) {
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: cajaActiva.id,
            tipo_movimiento: 'MERMA_INVENTARIO',
            monto: costo_asumido,
            descripcion:
              `Merma: ${tipo_ajuste}` +
              (justificacion ? ` — ${justificacion}` : ' — Sin detalle') +
              ` (Lote #${lote_id})`,
            usuario_id: userId,
          },
        });
        // NOTA: NO se hace decrement de efectivo_esperado porque la merma
        // no es salida de gaveta; es pérdida de inventario (activo).
      }

      return ajuste;
    });
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
