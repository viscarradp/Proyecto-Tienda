import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateMovimientosFinancieroDto } from './dto/create-movimientos_financiero.dto';
import { PrismaService } from '../prisma/prisma.service';
import { acquireAdvisoryLock, CajaTurnoRow } from '../common/concurrency';
import {
  BOVEDA_LEDGER_LOCK,
  CuentaEfectivo,
  saldoBovedaDerivado,
} from '../common/cuentas-efectivo';
import {
  avisoBovedaNegativa,
  avisoGavetaNegativa,
  soloAvisos,
} from '../common/avisos-fondos';
import { categoriaOtrosId } from '../common/categoria-otros';
import {
  bloquearParaAnular,
  marcarMovimientoAnulado,
  TIPOS_MOVIMIENTO_ANULABLES,
} from '../common/anulacion';
import { TX_OPTIONS } from '../common/transaccion';

@Injectable()
export class MovimientosFinancierosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un movimiento de efectivo. Política "registrar y avisar"
   * (ADR 0011): una salida nunca se rechaza por falta de saldo según el
   * sistema; se registra y la respuesta trae `avisos: string[]`.
   */
  async create(
    createMovimientosFinancieroDto: CreateMovimientosFinancieroDto,
    userId?: number,
  ) {
    const { tipo_movimiento, monto, descripcion } =
      createMovimientosFinancieroDto;
    let categoria_gasto_id = createMovimientosFinancieroDto.categoria_gasto_id;
    const origenFondos =
      createMovimientosFinancieroDto.origen_fondos ?? 'GAVETA';

    // La categoría es un dato de análisis, no un control (NEG-13): un egreso
    // operativo sin categoría cae en "Otros" (se crea sola si no existe).
    if (tipo_movimiento === 'EGRESO_OPERATIVO' && !categoria_gasto_id) {
      categoria_gasto_id = await categoriaOtrosId(this.prisma);
    }
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

    // ─── Egreso pagado desde la BÓVEDA (no exige turno, §5.6) ───
    const desdeBoveda =
      tipo_movimiento === 'EGRESO_OPERATIVO' && origenFondos === 'BOVEDA';

    if (desdeBoveda) {
      return await this.prisma.$transaction(async (tx) => {
        // El saldo de bóveda es un agregado: advisory lock para que dos salidas
        // concurrentes lean un saldo coherente (el lock sigue siendo necesario
        // aunque ya no se rechace por saldo).
        await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);
        const saldo = await saldoBovedaDerivado(tx);
        const movimiento = await tx.movimientos_financieros.create({
          data: {
            tipo_movimiento,
            monto,
            descripcion,
            categoria_gasto_id,
            caja_turno_id: null,
            usuario_id: userId,
            cuenta_origen: 'BOVEDA',
            cuenta_destino: 'GASTO',
          },
        });
        return {
          ...movimiento,
          avisos: soloAvisos([avisoBovedaNegativa(saldo.sub(monto))]),
        };
      });
    }

    // ─── Movimientos que tocan la GAVETA (requieren turno abierto) ───
    const cajaTurno = await this.prisma.cajas_turnos.findFirst({
      where: { estado: 'ABIERTA' },
    });
    if (!cajaTurno) {
      throw new BadRequestException(
        'No hay turno de caja abierto para registrar el movimiento',
      );
    }

    // (origen, destino) y efecto en la gaveta según el tipo (§5.1)
    let cuenta_origen: CuentaEfectivo;
    let cuenta_destino: CuentaEfectivo;
    let entraAGaveta = false; // suma a efectivo_esperado
    let saleDeGaveta = false; // resta de efectivo_esperado
    switch (tipo_movimiento) {
      case 'INGRESO_CAPITAL':
        cuenta_origen = 'DUEÑOS';
        cuenta_destino = 'GAVETA';
        entraAGaveta = true;
        break;
      case 'TRASLADO_DESDE_BOVEDA': // traer efectivo de la bóveda a la gaveta
        cuenta_origen = 'BOVEDA';
        cuenta_destino = 'GAVETA';
        entraAGaveta = true;
        break;
      case 'RETIRO_BOVEDA': // traslado gaveta → bóveda
        cuenta_origen = 'GAVETA';
        cuenta_destino = 'BOVEDA';
        saleDeGaveta = true;
        break;
      case 'EGRESO_OPERATIVO':
        cuenta_origen = 'GAVETA';
        cuenta_destino = 'GASTO';
        saleDeGaveta = true;
        break;
      case 'RETIRO_PERSONAL': // retiro del dueño: gaveta → patrimonio
        cuenta_origen = 'GAVETA';
        cuenta_destino = 'DUEÑOS';
        saleDeGaveta = true;
        break;
      default:
        throw new BadRequestException(
          `Tipo de movimiento no soportado: ${tipo_movimiento}`,
        );
    }

    return await this.prisma.$transaction(async (tx) => {
      // Bloquea la fila del turno ANTES de insertar el movimiento (que la
      // referencia por FK) y lee el esperado coherente para el aviso
      // (ver docs/decisions/0001-concurrencia-for-update.md).
      const [cajaLocked] = await tx.$queryRaw<CajaTurnoRow[]>`
        SELECT id, estado, efectivo_esperado
        FROM cajas_turnos
        WHERE id = ${cajaTurno.id}
        FOR UPDATE
      `;

      // Revalida bajo lock: el turno pudo cerrarse entre la lectura previa y
      // este punto (un cierre concurrente); no se registra en un turno cerrado.
      if (!cajaLocked || cajaLocked.estado !== 'ABIERTA') {
        throw new BadRequestException(
          'El turno de caja ya se cerró. Abre un turno nuevo para registrar el movimiento.',
        );
      }

      // Traer de la bóveda: además del turno se toma el lock de bóveda. Orden
      // fijo turno → bóveda; ningún camino toma bóveda → turno (ADR 0001).
      if (cuenta_origen === 'BOVEDA') {
        await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);
      }

      const movimiento = await tx.movimientos_financieros.create({
        data: {
          tipo_movimiento,
          monto,
          descripcion,
          categoria_gasto_id,
          caja_turno_id: cajaTurno.id,
          usuario_id: userId,
          cuenta_origen,
          cuenta_destino,
        },
      });

      const esperadoAntes = new Prisma.Decimal(
        cajaLocked.efectivo_esperado ?? 0,
      );
      let avisoGaveta: string | null = null;
      let avisoBoveda: string | null = null;

      if (entraAGaveta) {
        await tx.cajas_turnos.update({
          where: { id: cajaTurno.id },
          data: { efectivo_esperado: { increment: monto } },
        });
        if (cuenta_origen === 'BOVEDA') {
          // El movimiento ya está en el libro: el saldo es el de DESPUÉS.
          avisoBoveda = avisoBovedaNegativa(await saldoBovedaDerivado(tx));
        }
      } else if (saleDeGaveta) {
        // Registrar y avisar (ADR 0011): la salida se registra aunque el
        // esperado no alcance; la cajera pagó con el dinero que tenía en mano.
        await tx.cajas_turnos.update({
          where: { id: cajaTurno.id },
          data: { efectivo_esperado: { decrement: monto } },
        });
        avisoGaveta = avisoGavetaNegativa(esperadoAntes.sub(monto));
      }

      return {
        ...movimiento,
        avisos: soloAvisos([avisoGaveta, avisoBoveda]),
      };
    });
  }

  /**
   * Anula un movimiento de dinero de libre registro (gasto, retiro personal o
   * aporte de capital): lo marca (nunca lo borra) y revierte su efecto exacto.
   * Gaveta: solo mientras su turno siga ABIERTA. Bóveda: en cualquier momento.
   * Los movimientos que genera el sistema se corrigen anulando su origen
   * (compra, merma) o con el arqueo. ADR 0012.
   */
  async anular(id: number, motivo: string, userId?: number) {
    const mov = await this.prisma.movimientos_financieros.findUnique({
      where: { id },
    });
    if (!mov) {
      throw new NotFoundException(
        `Movimiento financiero con ID ${id} no encontrado`,
      );
    }
    if (mov.anulado) {
      throw new BadRequestException('Este movimiento ya está anulado.');
    }
    if (!TIPOS_MOVIMIENTO_ANULABLES.includes(mov.tipo_movimiento)) {
      throw new BadRequestException(
        mov.tipo_movimiento === 'PAGO_PROVEEDOR'
          ? 'Un pago a proveedor se corrige anulando la compra que lo generó.'
          : mov.tipo_movimiento === 'MERMA_INVENTARIO'
            ? 'Una merma se corrige anulando la merma en Inventario.'
            : 'Este movimiento lo genera el sistema (traslado, cierre o ajuste) y no se anula. Si algo no cuadra, se corrige con el cierre o el arqueo.',
      );
    }
    // El asiento de la diferencia de apertura no mueve el esperado: anularlo
    // descuadraría la gaveta (marca `es_apertura`, no la descripción).
    if (mov.es_apertura) {
      throw new BadRequestException(
        'Este movimiento nació al abrir el turno y no se anula. Si algo no cuadra, se corrige al cerrar el turno.',
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      await bloquearParaAnular(
        tx,
        mov,
        'Ese movimiento salió de la gaveta de un turno que ya se cerró. Un cierre no se modifica: si hubo un error, regístralo como un movimiento nuevo.',
      );
      const { aviso } = await marcarMovimientoAnulado(tx, mov, motivo, userId);
      const actualizado = await tx.movimientos_financieros.findUniqueOrThrow({
        where: { id },
        include: { anulado_por: { select: { nombre: true } } },
      });
      return { ...actualizado, avisos: soloAvisos([aviso]) };
    }, TX_OPTIONS);
  }

  findAll(tipo_movimiento?: string, limit?: number) {
    const whereClause = tipo_movimiento ? { tipo_movimiento } : {};

    return this.prisma.movimientos_financieros.findMany({
      where: whereClause,
      orderBy: { fecha: 'desc' },
      // Sin `limit` explícito: 100 (el controller valida el máximo de 500).
      take: limit ?? 100,
      include: {
        categorias_gastos: true,
        usuarios: { select: { nombre: true } },
        anulado_por: { select: { nombre: true } },
      },
    });
  }

  async findOne(id: number) {
    const movimiento = await this.prisma.movimientos_financieros.findUnique({
      where: { id },
      include: {
        categorias_gastos: true,
        usuarios: { select: { nombre: true } },
        anulado_por: { select: { nombre: true } },
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
