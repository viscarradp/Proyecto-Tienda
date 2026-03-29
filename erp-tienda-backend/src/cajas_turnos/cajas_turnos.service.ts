import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCajaTurnoDto } from './dto/create-caja_turno.dto';
import { CloseCajaTurnoDto } from './dto/close-caja_turno.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CajasTurnosService {
  constructor(private readonly prisma: PrismaService) {}

  async abrir(createCajaTurnoDto: CreateCajaTurnoDto) {
    // 1. Validar si ya existe un turno abierto
    const turnoAbierto = await this.prisma.cajas_turnos.findFirst({
      where: { estado: 'ABIERTA' },
    });

    if (turnoAbierto) {
      throw new ConflictException(
        'Ya existe un turno de caja abierto. Ciérrelo antes de abrir uno nuevo.',
      );
    }

    // 2. Crear nuevo turno
    return this.prisma.cajas_turnos.create({
      data: {
        fondo_inicial: createCajaTurnoDto.fondo_inicial,
        estado: 'ABIERTA',
        fecha_apertura: new Date(),
        efectivo_esperado: createCajaTurnoDto.fondo_inicial, // Al abrir, lo esperado es el fondo inicial
      },
    });
  }

  async getActiva() {
    const activa = await this.prisma.cajas_turnos.findFirst({
      where: { estado: 'ABIERTA' },
    });

    if (!activa) {
      throw new NotFoundException(
        'No hay ningún turno de caja abierto actualmente.',
      );
    }

    return activa;
  }

  async cerrar(id: number, closeCajaTurnoDto: CloseCajaTurnoDto) {
    // 1. Buscar el turno y validar que exista y esté abierto
    const turno = await this.prisma.cajas_turnos.findUnique({
      where: { id },
    });

    if (!turno) {
      throw new NotFoundException(`Turno de caja con ID ${id} no encontrado.`);
    }

    if (turno.estado !== 'ABIERTA') {
      throw new ConflictException(
        'Este turno de caja ya se encuentra cerrado.',
      );
    }

    // 2. Calcular diferencia
    const efectivoDeclarado = new Prisma.Decimal(closeCajaTurnoDto.efectivo_declarado);
    const efectivoEsperado = new Prisma.Decimal(turno.efectivo_esperado ?? 0);
    const diferencia = efectivoDeclarado.sub(efectivoEsperado);

    // 3. Ejecutar actualización y movimiento financiero en transacción
    return await this.prisma.$transaction(async (tx) => {
      const cajaCerrada = await tx.cajas_turnos.update({
        where: { id },
        data: {
          estado: 'CERRADA',
          fecha_cierre: new Date(),
          efectivo_declarado: efectivoDeclarado,
          diferencia: diferencia,
          observaciones: closeCajaTurnoDto.observaciones || null,
        },
      });

      // Si hay descuadre
      const desc_abs = diferencia.abs();
      if (desc_abs.greaterThan(new Prisma.Decimal('0.001'))) {
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: id,
            tipo_movimiento: diferencia.isNegative() ? 'AJUSTE_FALTANTE' : 'AJUSTE_SOBRANTE',
            monto: desc_abs,
            descripcion: (diferencia.isNegative() ? 'Faltante de caja automático' : 'Sobrante de caja automático') + 
                         (closeCajaTurnoDto.observaciones ? ` - Obs: ${closeCajaTurnoDto.observaciones}` : ''),
          },
        });
      }

      return cajaCerrada;
    });
  }

  async findAll() {
    return this.prisma.cajas_turnos.findMany({
      orderBy: { fecha_apertura: 'desc' },
      include: {
        movimientos_financieros: true,
        _count: {
          select: { ventas: true }
        }
      }
    });
  }

  async findOne(id: number) {
    const turno = await this.prisma.cajas_turnos.findUnique({
      where: { id },
      include: {
        movimientos_financieros: true,
        _count: {
          select: { ventas: true }
        }
      }
    });

    if (!turno) {
      throw new NotFoundException(`Turno de caja con ID ${id} no encontrado.`);
    }

    return turno;
  }

  async getResumen(id: number) {
    const turno = await this.prisma.cajas_turnos.findUnique({
      where: { id },
      include: {
        movimientos_financieros: true,
      }
    });

    if (!turno) {
      throw new NotFoundException(`Turno de caja con ID ${id} no encontrado.`);
    }

    const { _sum: sumVentas, _count: countVentas } = await this.prisma.ventas.aggregate({
      where: { caja_turno_id: id },
      _sum: { total: true },
      _count: { id: true },
    });

    const total_ventas = sumVentas.total ?? new Prisma.Decimal(0);
    
    // Sum egresos
    const egresos = turno.movimientos_financieros
      .filter(m => m.tipo_movimiento === 'EGRESO_OPERATIVO')
      .reduce((acc, m) => acc.add(new Prisma.Decimal(m.monto)), new Prisma.Decimal(0));
    
    // Sum ingresos
    const ingresos = turno.movimientos_financieros
      .filter(m => m.tipo_movimiento === 'INGRESO_CAPITAL')
      .reduce((acc, m) => acc.add(new Prisma.Decimal(m.monto)), new Prisma.Decimal(0));
    
    // Sum retiros
    const retiros = turno.movimientos_financieros
      .filter(m => m.tipo_movimiento === 'RETIRO_BOVEDA')
      .reduce((acc, m) => acc.add(new Prisma.Decimal(m.monto)), new Prisma.Decimal(0));

    return {
      turno: turno,
      total_ventas,
      total_egresos: egresos,
      total_ingresos_capital: ingresos,
      total_retiros_boveda: retiros,
      count_ventas: countVentas.id,
    };
  }
}
