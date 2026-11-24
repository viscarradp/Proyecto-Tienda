import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCajaTurnoDto } from './dto/create-caja_turno.dto';
import { CloseCajaTurnoDto } from './dto/close-caja_turno.dto';
import { QueryCajasTurnosDto } from './dto/query-cajas_turnos.dto';
import { Prisma } from '@prisma/client';
import { acquireAdvisoryLock, CajaTurnoRow } from '../common/concurrency';
import {
  BOVEDA_LEDGER_LOCK,
  saldoBovedaDerivado,
} from '../common/cuentas-efectivo';
import { TOLERANCIA_DESCUADRE } from '../common/tolerancia';
import { TX_OPTIONS } from '../common/transaccion';
import { avisoBovedaNegativa } from '../common/avisos-fondos';
import { CuentaEfectivo } from '../common/cuentas-efectivo';
import { OrigenDiferencia } from './dto/create-caja_turno.dto';

/** Asiento que explica la diferencia entre el fondo de apertura y el remanente. */
interface AsientoApertura {
  tipo_movimiento: string;
  cuenta_origen: CuentaEfectivo;
  cuenta_destino: CuentaEfectivo;
  descripcion: string;
  sinExplicar: boolean;
}

/**
 * Elige el asiento de la diferencia de apertura (D-15). : el fondo es
 * mayor que el remanente (entró efectivo a la gaveta); si no, salió efectivo.
 * Una opción que no corresponde al sentido (APORTE cuando falta, RETIRO cuando
 * sobra) o NO_SE/ausente deja la diferencia como ajuste sin explicar.
 */
function asientoDeDiferencia(
  sobra: boolean,
  origen: OrigenDiferencia | undefined,
): AsientoApertura {
  if (sobra) {
    if (origen === 'BOVEDA') {
      return {
        tipo_movimiento: 'TRASLADO_DESDE_BOVEDA',
        cuenta_origen: 'BOVEDA',
        cuenta_destino: 'GAVETA',
        descripcion: 'Fondo de apertura tomado de la bóveda',
        sinExplicar: false,
      };
    }
    if (origen === 'APORTE') {
      return {
        tipo_movimiento: 'INGRESO_CAPITAL',
        cuenta_origen: 'DUEÑOS',
        cuenta_destino: 'GAVETA',
        descripcion: 'Aporte de la dueña al abrir la caja',
        sinExplicar: false,
      };
    }
    return {
      tipo_movimiento: 'AJUSTE_SOBRANTE',
      cuenta_origen: 'GASTO',
      cuenta_destino: 'GAVETA',
      descripcion: 'Diferencia de apertura sin explicar',
      sinExplicar: true,
    };
  }
  if (origen === 'BOVEDA') {
    return {
      tipo_movimiento: 'TRASLADO_A_BOVEDA',
      cuenta_origen: 'GAVETA',
      cuenta_destino: 'BOVEDA',
      descripcion: 'Se guardó en la bóveda (diferencia de apertura)',
      sinExplicar: false,
    };
  }
  if (origen === 'RETIRO') {
    return {
      tipo_movimiento: 'RETIRO_PERSONAL',
      cuenta_origen: 'GAVETA',
      cuenta_destino: 'DUEÑOS',
      descripcion: 'Retiro de la dueña (diferencia de apertura)',
      sinExplicar: false,
    };
  }
  return {
    tipo_movimiento: 'AJUSTE_FALTANTE',
    cuenta_origen: 'GAVETA',
    cuenta_destino: 'GASTO',
    descripcion: 'Diferencia de apertura sin explicar',
    sinExplicar: true,
  };
}

@Injectable()
export class CajasTurnosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Abre un turno. Si el fondo difiere de lo que quedó en la gaveta al último
   * cierre (el remanente), la diferencia se registra SIEMPRE con su asiento
   * (D-15, ADR 0011) según `origen_diferencia`; nunca se bloquea la apertura.
   *
   * Modelo: el turno nuevo arranca con `efectivo_esperado = fondo_inicial`
   * (ya incluye la diferencia), así que el asiento de la diferencia NO vuelve a
   * tocar `efectivo_esperado`: solo explica el salto remanente → fondo. Con
   * eso la gaveta (turno abierto = esperado) y la bóveda (libro) cuadran y el
   * patrimonio solo cambia por lo que de verdad entró o salió del negocio.
   */
  async abrir(createCajaTurnoDto: CreateCajaTurnoDto, userId?: number) {
    const fondoInicial = new Prisma.Decimal(createCajaTurnoDto.fondo_inicial);
    const origen = createCajaTurnoDto.origen_diferencia;
    const nota = createCajaTurnoDto.nota?.trim();

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

      // 2. Remanente: lo que quedó en la gaveta al último cierre, leído ya bajo
      //    el lock (no hay turno abierto, así que nadie lo cambia mientras tanto).
      //    El primer turno de la historia no tiene cierre previo: remanente 0.
      const remanente = await this.remanenteDeUltimoCierre(tx);
      const diferencia = fondoInicial.sub(remanente);
      const hayDiferencia = !diferencia.isZero();
      const avisos: string[] = [];

      // Si el fondo no explica de dónde vino, o la opción no corresponde al
      // sentido de la diferencia (p. ej. APORTE cuando falta), se registra igual
      // como ajuste sin explicar: nunca se bloquea la apertura.
      const sobra = diferencia.greaterThan(0);
      let asiento: AsientoApertura | null = null;
      if (hayDiferencia) {
        asiento = asientoDeDiferencia(sobra, origen);
        if (asiento.sinExplicar) {
          avisos.push(
            `El fondo ($${fondoInicial.toFixed(2)}) no coincide con lo que quedó ` +
              `en la gaveta al último cierre ($${remanente.toFixed(2)}). ` +
              `La diferencia de $${diferencia.abs().toFixed(2)} quedó registrada ` +
              'sin explicar.',
          );
        }
        // Si sale de la bóveda, se serializa con el resto de escritores de bóveda.
        if (asiento.cuenta_origen === 'BOVEDA') {
          await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);
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

      // 4. Asiento de la diferencia (siempre que exista). No toca
      //    efectivo_esperado: el turno ya arrancó en el fondo.
      if (asiento) {
        await tx.movimientos_financieros.create({
          data: {
            // El traslado gaveta→bóveda de la apertura NO se ata al turno nuevo:
            // getUltimoCierre y el patrimonio restan del remanente los
            // TRASLADO_A_BOVEDA del turno cerrado; ligarlo a este turno lo
            // restaría de nuevo cuando este turno se cierre.
            caja_turno_id:
              asiento.tipo_movimiento === 'TRASLADO_A_BOVEDA'
                ? null
                : nuevoTurno.id,
            tipo_movimiento: asiento.tipo_movimiento,
            monto: diferencia.abs(),
            descripcion: nota
              ? `${asiento.descripcion} — ${nota}`
              : asiento.descripcion,
            usuario_id: userId,
            cuenta_origen: asiento.cuenta_origen,
            cuenta_destino: asiento.cuenta_destino,
          },
        });

        if (asiento.cuenta_origen === 'BOVEDA') {
          const aviso = avisoBovedaNegativa(await saldoBovedaDerivado(tx));
          if (aviso) avisos.push(aviso);
        }
      }

      return { ...nuevoTurno, avisos };
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
    return this.leerUltimoCierre(this.prisma);
  }

  /** Lo que quedó en la gaveta al último cierre (0 si nunca hubo un cierre). */
  private async remanenteDeUltimoCierre(
    client: Prisma.TransactionClient,
  ): Promise<Prisma.Decimal> {
    return (await this.leerUltimoCierre(client)).fondo_siguiente;
  }

  private async leerUltimoCierre(client: Prisma.TransactionClient) {
    const ultimoCierre = await client.cajas_turnos.findFirst({
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
          cerrado_por_id: userId,
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
    }, TX_OPTIONS);
  }

  /**
   * Historial paginado por cursor, más recientes primero. Devuelve
   * `{ items, hay_mas }`; para la página siguiente se pasa
   * `antes_de = items[items.length - 1].id`. Límite por defecto 7 (máx. 50).
   */
  async findAll(query: QueryCajasTurnosDto = {}) {
    const limit = query.limit ?? 7;
    // Se pide uno de más solo para saber si queda otra página.
    const filas = await this.prisma.cajas_turnos.findMany({
      where: query.antes_de ? { id: { lt: query.antes_de } } : undefined,
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: {
        // Quién hizo cada movimiento (solo el nombre) y la categoría del gasto,
        // para que Movimientos muestre a dónde se fue el dinero del turno.
        movimientos_financieros: {
          orderBy: { fecha: 'asc' },
          include: {
            usuarios: { select: { nombre: true } },
            categorias_gastos: { select: { nombre: true } },
          },
        },
        // Quién abrió y quién cerró: solo el nombre (trazabilidad D-06).
        usuarios: { select: { nombre: true } },
        cerrado_por: { select: { nombre: true } },
        _count: {
          select: { ventas: true },
        },
      },
    });
    return { items: filas.slice(0, limit), hay_mas: filas.length > limit };
  }

  async findOne(id: number) {
    const turno = await this.prisma.cajas_turnos.findUnique({
      where: { id },
      include: {
        movimientos_financieros: true,
        // Quién abrió y quién cerró: solo el nombre (trazabilidad D-06).
        usuarios: { select: { nombre: true } },
        cerrado_por: { select: { nombre: true } },
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
