import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCajaGeneralDto } from './dto/create-caja_general.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CajaGeneralService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDto: CreateCajaGeneralDto) {
    if (createDto.movimiento_origen_id) {
      const existe = await this.prisma.caja_general.findUnique({
        where: { movimiento_origen_id: createDto.movimiento_origen_id },
      });
      if (existe) {
        throw new BadRequestException(
          'El movimiento de origen ya está registrado en caja general',
        );
      }
    }

    return this.prisma.caja_general.create({
      data: {
        monto: createDto.monto,
        descripcion: createDto.descripcion,
        movimiento_origen_id: createDto.movimiento_origen_id,
      },
    });
  }

  async findAll() {
    return this.prisma.caja_general.findMany({
      orderBy: { fecha: 'desc' },
      include: {
        movimientos_financieros: true,
      },
    });
  }

  async inyectarCapital(monto: number, descripcion?: string) {
    if (!monto || monto <= 0) {
      throw new BadRequestException('El monto de inyección debe ser mayor a 0');
    }

    return this.prisma.caja_general.create({
      data: {
        monto: monto,
        descripcion:
          descripcion ||
          `Inyección de capital del dueño — $${monto.toFixed(2)}`,
      },
    });
  }

  async getSaldo() {
    const result = await this.prisma.caja_general.aggregate({
      _sum: { monto: true },
      _count: { id: true },
    });

    return {
      saldo_actual: result._sum.monto ?? new Prisma.Decimal(0),
      total_depositos: result._count.id,
    };
  }
}
