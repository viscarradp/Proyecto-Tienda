import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMovimientosFinancieroDto } from './dto/create-movimientos_financiero.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CajaTurnoRow } from '../common/concurrency';

@Injectable()
export class MovimientosFinancierosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createMovimientosFinancieroDto: CreateMovimientosFinancieroDto) {
    const { tipo_movimiento, categoria_gasto_id } =
      createMovimientosFinancieroDto;

    // El caja_turno_id NO debe venir del cliente.
    // El backend debe buscar automáticamente el turno con estado: 'ABIERTA'.
    const cajaTurno = await this.prisma.cajas_turnos.findFirst({
      where: { estado: 'ABIERTA' },
    });

    if (!cajaTurno) {
      throw new BadRequestException(
        'No hay turno de caja abierto para registrar el movimiento',
      );
    }

    // Si el movimiento es de tipo 'EGRESO_OPERATIVO', es OBLIGATORIO que venga el categoria_gasto_id.
    if (tipo_movimiento === 'EGRESO_OPERATIVO' && !categoria_gasto_id) {
      throw new BadRequestException(
        'Los egresos operativos requieren una categoría de gasto',
      );
    }

    // Valida que el categoria_gasto_id exista en la base de datos
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

    // Guarda el movimiento vinculado a la caja activa en una transacción
    // y actualiza el efectivo esperado de la caja.
    return await this.prisma.$transaction(async (tx) => {
      // Bloquea la fila del turno ANTES de insertar el movimiento (que la
      // referencia por FK). Si se bloqueara después de insertar, dos requests
      // concurrentes podrían deadlockearse: ambas retienen el lock compartido
      // implícito que Postgres toma en el INSERT por la FK (FOR KEY SHARE) y
      // luego ambas intentan escalarlo a exclusivo al mismo tiempo (error
      // 40P01). Aprovechamos esta misma lectura bloqueada para validar fondos
      // en egresos (ver docs/decisions/0001-concurrencia-for-update.md).
      const [cajaLocked] = await tx.$queryRaw<CajaTurnoRow[]>`
        SELECT id, efectivo_esperado
        FROM cajas_turnos
        WHERE id = ${cajaTurno.id}
        FOR UPDATE
      `;

      const movimiento = await tx.movimientos_financieros.create({
        data: {
          ...createMovimientosFinancieroDto,
          caja_turno_id: cajaTurno.id,
        },
      });

      const esIngreso = ['INGRESO_CAPITAL'].includes(tipo_movimiento);
      const esEgreso = ['EGRESO_OPERATIVO', 'RETIRO_BOVEDA'].includes(tipo_movimiento);

      if (esIngreso) {
        await tx.cajas_turnos.update({
          where: { id: cajaTurno.id },
          data: { efectivo_esperado: { increment: createMovimientosFinancieroDto.monto } },
        });
      } else if (esEgreso) {
        // ── BUG 9: Validar fondos suficientes antes de decrementar ──
        const esperado = Number(cajaLocked?.efectivo_esperado ?? 0);
        if (esperado < createMovimientosFinancieroDto.monto) {
          throw new BadRequestException(
            `Fondos insuficientes en caja. ` +
              `Disponible: $${esperado.toFixed(2)}, ` +
              `Requerido: $${createMovimientosFinancieroDto.monto}`,
          );
        }

        await tx.cajas_turnos.update({
          where: { id: cajaTurno.id },
          data: { efectivo_esperado: { decrement: createMovimientosFinancieroDto.monto } },
        });
      }

      if (tipo_movimiento === 'RETIRO_BOVEDA') {
        await tx.caja_general.create({
          data: {
            monto: createMovimientosFinancieroDto.monto,
            descripcion: 'Depósito automático - ' + createMovimientosFinancieroDto.descripcion,
            movimiento_origen_id: movimiento.id
          }
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
