import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCajaTurnoDto } from './dto/create-caja_turno.dto';
import { CloseCajaTurnoDto } from './dto/close-caja_turno.dto';
import { Prisma } from '@prisma/client';
import { acquireAdvisoryLock, CajaTurnoRow } from '../common/concurrency';
import {
  BOVEDA_LEDGER_LOCK,
  saldoBovedaDerivado,
} from '../common/cuentas-efectivo';
import { TOLERANCIA_DESCUADRE } from '../common/tolerancia';

@Injectable()
export class CajasTurnosService {
  constructor(private readonly prisma: PrismaService) {}

  async abrir(createCajaTurnoDto: CreateCajaTurnoDto, userId?: number) {
    const fondoInicial = createCajaTurnoDto.fondo_inicial;
    const desdeBoveda = createCajaTurnoDto.desde_boveda ?? 0;

    if (desdeBoveda > fondoInicial) {
      throw new BadRequestException(
        'El monto tomado de la bóveda no puede superar el fondo inicial.',
      );
    }

    // Advisory lock: serializa aperturas de turno concurrentes. Sin esto, dos
    // requests de apertura simultáneos podrían leer "0 turnos abiertos" ambos
    // y crear dos turnos ABIERTA (ver docs/decisions/0001-concurrencia-for-update.md).
    return await this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, 'caja_turno_abrir');

      // 1. Validar si ya existe un turno abierto (re-chequeo ya bajo el lock)
      const turnoAbierto = await tx.cajas_turnos.findFirst({
        where: { estado: 'ABIERTA' },
      });

      if (turnoAbierto) {
        throw new ConflictException(
          'Ya existe un turno de caja abierto. Ciérrelo antes de abrir uno nuevo.',
        );
      }

      // 2. Si parte del fondo sale de la bóveda, validar su saldo bajo lock.
      //    NOTA (fuga F3): ya NO se compara el fondo contra el último cierre para
      //    inventar un AJUSTE_FALTANTE/INGRESO_CAPITAL — el traslado de dinero
      //    fuera de la gaveta se registra explícitamente al CIERRE.
      if (desdeBoveda > 0) {
        await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);
        const saldo = await saldoBovedaDerivado(tx);
        if (saldo.lessThan(desdeBoveda)) {
          throw new BadRequestException(
            `Fondos insuficientes en bóveda. ` +
              `Disponible: $${saldo.toFixed(2)}, Requerido: $${desdeBoveda}`,
          );
        }
      }

      // 3. Crear el turno. El efectivo esperado arranca en el fondo inicial.
      const nuevoTurno = await tx.cajas_turnos.create({
        data: {
          fondo_inicial: fondoInicial,
          estado: 'ABIERTA',
          fecha_apertura: new Date(),
          efectivo_esperado: fondoInicial,
          usuario_id: userId,
        },
      });

      // 4. Registrar el traslado bóveda→gaveta si se tomó fondo de la bóveda.
      //    Solo reduce el saldo derivado de bóveda; la gaveta ya es fondoInicial.
      if (desdeBoveda > 0) {
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: nuevoTurno.id,
            tipo_movimiento: 'TRASLADO_DESDE_BOVEDA',
            monto: new Prisma.Decimal(desdeBoveda),
            descripcion: 'Fondo inicial tomado de la bóveda',
            usuario_id: userId,
            cuenta_origen: 'BOVEDA',
            cuenta_destino: 'GAVETA',
          },
        });
      }

      return nuevoTurno;
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

  async getUltimoCierre() {
    const ultimoCierre = await this.prisma.cajas_turnos.findFirst({
      // Incluye CERRADA_FORZADA (Bloque 3.C): si el último turno se cerró forzado
      // (2.B), el fondo del siguiente debe derivarse de ESE cierre, no de uno viejo.
      where: { estado: { in: ['CERRADA', 'CERRADA_FORZADA'] } },
      orderBy: { fecha_cierre: 'desc' },
      include: {
        movimientos_financieros: {
          where: { tipo_movimiento: 'TRASLADO_A_BOVEDA' },
        },
      },
    });

    if (!ultimoCierre) {
      return { fondo_siguiente: new Prisma.Decimal(0), fecha_cierre: null };
    }

    // Lo que quedó en la gaveta = efectivo contado − lo trasladado a la bóveda.
    const trasladado = ultimoCierre.movimientos_financieros.reduce(
      (acc, m) => acc.add(m.monto),
      new Prisma.Decimal(0),
    );
    const fondo_siguiente = new Prisma.Decimal(
      ultimoCierre.efectivo_declarado ?? 0,
    ).sub(trasladado);

    return { fondo_siguiente, fecha_cierre: ultimoCierre.fecha_cierre };
  }

  async cerrar(
    id: number,
    closeCajaTurnoDto: CloseCajaTurnoDto,
    userId?: number,
    forzado = false,
  ) {
    // Todo el método corre en una única transacción con la fila del turno
    // bloqueada (FOR UPDATE): dos solicitudes de cierre concurrentes sobre el
    // mismo turno no deben producir doble ajuste financiero
    // (ver docs/decisions/0001-concurrencia-for-update.md).
    return await this.prisma.$transaction(async (tx) => {
      // 1. Buscar el turno y validar que exista y esté abierto
      const [turno] = await tx.$queryRaw<CajaTurnoRow[]>`
        SELECT id, estado, efectivo_esperado
        FROM cajas_turnos
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!turno) {
        throw new NotFoundException(
          `Turno de caja con ID ${id} no encontrado.`,
        );
      }

      if (turno.estado !== 'ABIERTA') {
        throw new ConflictException(
          'Este turno de caja ya se encuentra cerrado.',
        );
      }

      // 2. Calcular diferencia (conteo físico vs esperado por el sistema)
      const efectivoDeclarado = new Prisma.Decimal(
        closeCajaTurnoDto.efectivo_declarado,
      );
      const efectivoEsperado = new Prisma.Decimal(turno.efectivo_esperado ?? 0);
      const diferencia = efectivoDeclarado.sub(efectivoEsperado);
      const desc_abs = diferencia.abs();
      const justificacion = closeCajaTurnoDto.observaciones?.trim();

      // Umbral de tolerancia (§7): un descuadre ≥ umbral (o un cierre forzado)
      // exige justificación. Debajo del umbral, ajuste automático sin fricción.
      const requiereJustificacion =
        forzado || desc_abs.greaterThanOrEqualTo(TOLERANCIA_DESCUADRE);
      if (requiereJustificacion && !justificacion) {
        throw new BadRequestException(
          forzado
            ? 'El cierre forzado requiere una justificación.'
            : `El descuadre de $${desc_abs.toFixed(2)} requiere una justificación ` +
                `(umbral $${TOLERANCIA_DESCUADRE.toFixed(2)}).`,
        );
      }

      // 3. Ejecutar el cierre
      const cajaCerrada = await tx.cajas_turnos.update({
        where: { id },
        data: {
          estado: forzado ? 'CERRADA_FORZADA' : 'CERRADA',
          fecha_cierre: new Date(),
          efectivo_declarado: efectivoDeclarado,
          diferencia: diferencia,
          observaciones: justificacion || null,
        },
      });

      // El descuadre se registra SIEMPRE (aunque esté debajo del umbral), para
      // detectar el patrón de faltantes chiquitos diarios.
      if (desc_abs.greaterThan(new Prisma.Decimal('0.001'))) {
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: id,
            tipo_movimiento: diferencia.isNegative()
              ? 'AJUSTE_FALTANTE'
              : 'AJUSTE_SOBRANTE',
            // Faltante: sale de gaveta como pérdida (GAVETA→GASTO).
            // Sobrante: entra a gaveta como recuperación (GASTO→GAVETA).
            cuenta_origen: diferencia.isNegative() ? 'GAVETA' : 'GASTO',
            cuenta_destino: diferencia.isNegative() ? 'GASTO' : 'GAVETA',
            monto: desc_abs,
            descripcion:
              (diferencia.isNegative()
                ? 'Faltante de caja automático'
                : 'Sobrante de caja automático') +
              (closeCajaTurnoDto.observaciones
                ? ` - Obs: ${closeCajaTurnoDto.observaciones}`
                : ''),
            usuario_id: userId,
          },
        });
      }

      // 4. Traslado del excedente a la bóveda (§5.5). El resto queda en la
      //    gaveta como fondo del próximo turno. Es un movimiento explícito
      //    (GAVETA→BOVEDA), no un "faltante".
      const montoABoveda = new Prisma.Decimal(
        closeCajaTurnoDto.monto_a_boveda ?? 0,
      );
      if (montoABoveda.greaterThan(0)) {
        if (montoABoveda.greaterThan(efectivoDeclarado)) {
          throw new BadRequestException(
            'El monto a trasladar a la bóveda no puede superar el efectivo contado.',
          );
        }
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: id,
            tipo_movimiento: 'TRASLADO_A_BOVEDA',
            monto: montoABoveda,
            descripcion: 'Traslado a bóveda al cierre del turno',
            usuario_id: userId,
            cuenta_origen: 'GAVETA',
            cuenta_destino: 'BOVEDA',
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
          select: { ventas: true },
        },
      },
    });
  }

  async findOne(id: number) {
    const turno = await this.prisma.cajas_turnos.findUnique({
      where: { id },
      include: {
        movimientos_financieros: true,
        _count: {
          select: { ventas: true },
        },
      },
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
      },
    });

    if (!turno) {
      throw new NotFoundException(`Turno de caja con ID ${id} no encontrado.`);
    }

    const { _sum: sumVentas, _count: countVentas } =
      await this.prisma.ventas.aggregate({
        where: { caja_turno_id: id },
        _sum: { total: true },
        _count: { id: true },
      });

    const total_ventas = sumVentas.total ?? new Prisma.Decimal(0);

    // Sum egresos operativos (gastos del negocio, excluye retiros a bóveda)
    const egresos = turno.movimientos_financieros
      .filter((m) => m.tipo_movimiento === 'EGRESO_OPERATIVO')
      .reduce(
        (acc, m) => acc.add(new Prisma.Decimal(m.monto)),
        new Prisma.Decimal(0),
      );

    // Sum ingresos de capital
    const ingresos = turno.movimientos_financieros
      .filter((m) => m.tipo_movimiento === 'INGRESO_CAPITAL')
      .reduce(
        (acc, m) => acc.add(new Prisma.Decimal(m.monto)),
        new Prisma.Decimal(0),
      );

    // Sum traslados a bóveda (RETIRO_BOVEDA manual + TRASLADO_A_BOVEDA de cierre)
    const retiros = turno.movimientos_financieros
      .filter((m) =>
        ['RETIRO_BOVEDA', 'TRASLADO_A_BOVEDA'].includes(m.tipo_movimiento),
      )
      .reduce(
        (acc, m) => acc.add(new Prisma.Decimal(m.monto)),
        new Prisma.Decimal(0),
      );

    // BUG 8: Sum pagos a proveedores (egreso real de caja por compras)
    const pagos_proveedores = turno.movimientos_financieros
      .filter((m) => m.tipo_movimiento === 'PAGO_PROVEEDOR')
      .reduce(
        (acc, m) => acc.add(new Prisma.Decimal(m.monto)),
        new Prisma.Decimal(0),
      );

    // BUG 4 + BUG 8: Sum mermas de inventario (pérdida patrimonial, no salida de efectivo)
    const mermas_inventario = turno.movimientos_financieros
      .filter((m) => m.tipo_movimiento === 'MERMA_INVENTARIO')
      .reduce(
        (acc, m) => acc.add(new Prisma.Decimal(m.monto)),
        new Prisma.Decimal(0),
      );

    return {
      turno: turno,
      total_ventas,
      total_egresos_operativos: egresos,
      total_pagos_proveedores: pagos_proveedores,
      total_mermas_inventario: mermas_inventario,
      total_ingresos_capital: ingresos,
      total_retiros_boveda: retiros,
      count_ventas: countVentas.id,
    };
  }
}
