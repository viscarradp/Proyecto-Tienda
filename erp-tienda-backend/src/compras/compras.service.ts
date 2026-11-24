import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { Prisma } from '@prisma/client';
import { acquireAdvisoryLock, CajaTurnoRow } from '../common/concurrency';
import { TX_OPTIONS } from '../common/transaccion';
import { resolverPendientesConLote } from '../common/pendientes-stock';
import { redondearDinero } from '../common/redondeo';
import {
  BOVEDA_LEDGER_LOCK,
  saldoBovedaDerivado,
} from '../common/cuentas-efectivo';
import {
  avisoBovedaNegativa,
  avisoGavetaNegativa,
  soloAvisos,
} from '../common/avisos-fondos';

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCompraDto: CreateCompraDto, userId?: number) {
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
    // En Decimal (cantidad fraccionable × costo) para no mezclar floats con dinero.
    // Cada lote se redondea a 2 decimales (half-up) ANTES de sumar.
    const montoCalculado = detalles_lotes.reduce(
      (sum, lote) =>
        sum.add(
          redondearDinero(
            new Prisma.Decimal(lote.cantidad_inicial).mul(
              lote.costo_unitario_adquisicion,
            ),
          ),
        ),
      new Prisma.Decimal(0),
    );

    return await this.prisma.$transaction(async (tx) => {
      // Orden global de locks: turno → venta → lotes → pendientes (ver
      // docs/decisions/0001-concurrencia-for-update.md). Esta compra resuelve
      // pendientes de stock AL FINAL, así que los locks de fondos (turno o
      // bóveda) y su validación van PRIMERO: si se tomaran después de crear
      // lotes y pendientes, una anulación (turno → … → pendientes) podría
      // deadlockear con esta compra.

      // Paso 1: Fondos. Se bloquea el origen del dinero ANTES de crear nada.
      // Política registrar-y-avisar (ADR 0011): si el saldo del sistema no
      // alcanza, la compra se registra igual y se devuelve un aviso.
      let cajaActivaId: number | null = null;
      let avisoFondos: string | null = null;
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

        const efectivoDisponible = new Prisma.Decimal(
          cajaActiva.efectivo_esperado ?? 0,
        );
        avisoFondos = avisoGavetaNegativa(
          efectivoDisponible.sub(montoCalculado),
        );
        cajaActivaId = cajaActiva.id;
      } else if (compraData.origen_fondos === 'CAJA_GENERAL') {
        // El saldo de bóveda es un agregado derivado del libro (no una fila
        // bloqueable con FOR UPDATE). Un advisory lock serializa esta sección
        // crítica (ver docs/decisions/0001-concurrencia-for-update.md).
        await acquireAdvisoryLock(tx, BOVEDA_LEDGER_LOCK);

        const saldoDisponible = await saldoBovedaDerivado(tx);
        avisoFondos = avisoBovedaNegativa(saldoDisponible.sub(montoCalculado));
      }

      // Paso 2: Crear el registro de compra usando el monto calculado
      const compra = await tx.compras_inventario.create({
        data: {
          proveedor: compraData.proveedor,
          monto_total: montoCalculado, // ← monto real, no el del cliente
          estado_pago: compraData.estado_pago,
          origen_fondos: compraData.origen_fondos,
        },
      });

      // Paso 3: Crear los lotes de inventario
      const lotesCreados: { id: number; producto_id: number }[] = [];
      for (const lote of detalles_lotes) {
        const creado = await tx.lotes_inventario.create({
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
        lotesCreados.push({ id: creado.id, producto_id: creado.producto_id });
      }

      // Paso 4: Cuentas por Pagar
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

      // Paso 5: Impacto en Caja (los locks ya se tomaron en el paso 1)
      if (cajaActivaId !== null) {
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: cajaActivaId,
            tipo_movimiento: 'PAGO_PROVEEDOR',
            monto: montoCalculado,
            descripcion: `Pago a proveedor ${compraData.proveedor} por compra ID ${compra.id}`,
            usuario_id: userId,
            cuenta_origen: 'GAVETA',
            cuenta_destino: 'PROVEEDOR',
          },
        });

        // Actualizar el efectivo esperado en la caja (se resta la compra)
        await tx.cajas_turnos.update({
          where: { id: cajaActivaId },
          data: {
            efectivo_esperado: { decrement: montoCalculado },
          },
        });
      } else if (compraData.origen_fondos === 'CAJA_GENERAL') {
        // Pago desde bóveda: BOVEDA→PROVEEDOR (no requiere turno abierto).
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: null,
            tipo_movimiento: 'PAGO_PROVEEDOR',
            monto: montoCalculado,
            descripcion: `Pago a proveedor ${compraData.proveedor} de compra ID ${compra.id}`,
            usuario_id: userId,
            cuenta_origen: 'BOVEDA',
            cuenta_destino: 'PROVEEDOR',
          },
        });
      }

      // Paso 6: Deuda de stock (D-01). Entró stock nuevo: se cubren los
      // pendientes abiertos de cada producto, del más viejo al más nuevo, con
      // cada lote recién creado (que es privado de esta transacción).
      for (const lote of lotesCreados) {
        await resolverPendientesConLote(tx, lote.producto_id, lote.id);
      }

      return { ...compra, avisos: soloAvisos([avisoFondos]) };
    }, TX_OPTIONS);
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
