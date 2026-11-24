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
  bloquearParaAnular,
  marcarMovimientoAnulado,
} from '../common/anulacion';
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

    // Una compra al crédito no mueve dinero: no tiene origen de fondos (se
    // ignora lo que llegue y se guarda como CREDITO). Una compra pagada sí
    // necesita saber de dónde salió el dinero.
    const alCredito = compraData.estado_pago === 'AL_CREDITO';
    if (!alCredito && !compraData.origen_fondos) {
      throw new BadRequestException(
        'Indica de dónde salió el dinero: caja del día, bóveda o capital de la dueña.',
      );
    }
    const origenFondos = alCredito ? 'CREDITO' : compraData.origen_fondos!;

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
      if (origenFondos === 'CAJA_POS') {
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
      } else if (origenFondos === 'CAJA_GENERAL') {
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
          origen_fondos: origenFondos,
          usuario_id: userId ?? null,
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
      // Una compra al crédito no mueve efectivo (origen CREDITO): la deuda se
      // paga después con abonos (módulo cuentas_por_pagar).
      if (alCredito) {
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
            compra_id: compra.id,
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
      } else if (origenFondos === 'CAJA_GENERAL') {
        // Pago desde bóveda: BOVEDA→PROVEEDOR (no requiere turno abierto).
        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: null,
            tipo_movimiento: 'PAGO_PROVEEDOR',
            monto: montoCalculado,
            descripcion: `Pago a proveedor ${compraData.proveedor} de compra ID ${compra.id}`,
            usuario_id: userId,
            compra_id: compra.id,
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

  /**
   * Anula una compra que nadie usó todavía (ADR 0012): los lotes quedan en 0,
   * su pago se marca anulado (el dinero vuelve a la gaveta —solo si su turno
   * sigue abierto— o a la bóveda) y, si fue al crédito sin abonos, la deuda
   * queda saldada. Nunca se borra nada. Orden de locks (ADR 0001): turno /
   * bóveda → lotes → cuenta por pagar.
   */
  async anular(id: number, motivo: string, userId?: number) {
    const compra = await this.prisma.compras_inventario.findUnique({
      where: { id },
    });
    if (!compra) {
      throw new NotFoundException(`Compra con ID ${id} no encontrada`);
    }
    if (compra.anulado) {
      throw new BadRequestException('Esta compra ya está anulada.');
    }

    // El pago que generó la compra (si salió de la gaveta o de la bóveda).
    const pago = await this.prisma.movimientos_financieros.findFirst({
      where: {
        compra_id: id,
        tipo_movimiento: 'PAGO_PROVEEDOR',
        anulado: false,
      },
    });

    return await this.prisma.$transaction(async (tx) => {
      // 1. Fondos: turno (solo gaveta) o bóveda, antes que lotes.
      if (pago) {
        await bloquearParaAnular(
          tx,
          pago,
          'Esta compra se pagó de la gaveta de un turno que ya se cerró. Un cierre no se modifica: si hubo un error, registra una merma o un conteo.',
        );
      }

      // 2. Lotes bajo lock, en orden de id.
      const lotes = await tx.$queryRaw<
        {
          id: number;
          cantidad_inicial: Prisma.Decimal | string;
          cantidad_disponible: Prisma.Decimal | string;
        }[]
      >`
        SELECT id, cantidad_inicial, cantidad_disponible
        FROM lotes_inventario
        WHERE compra_id = ${id}
        ORDER BY id
        FOR UPDATE
      `;
      const loteIds = lotes.map((l) => l.id);
      const intactos = lotes.every((l) =>
        new Prisma.Decimal(l.cantidad_disponible).equals(l.cantidad_inicial),
      );
      // Con los lotes bloqueados nadie puede venderlos, cubrir deuda de stock
      // ni ajustarlos mientras revisamos.
      const [ventas, pendientes, ajustes] = await Promise.all([
        tx.detalle_venta_lotes.count({ where: { lote_id: { in: loteIds } } }),
        tx.pendientes_stock.count({
          where: { lote_resuelto_id: { in: loteIds } },
        }),
        tx.ajustes_inventario.count({
          where: { lote_id: { in: loteIds }, anulado: false },
        }),
      ]);
      if (!intactos || ventas > 0 || pendientes > 0 || ajustes > 0) {
        throw new BadRequestException(
          'Ya se vendió o se usó mercadería de esta compra; no se puede anular. Registra una merma o un conteo.',
        );
      }

      // 3. Deuda: si ya tiene abonos, primero se corrigen esos pagos.
      const cuentas = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM cuentas_por_pagar WHERE compra_id = ${id} ORDER BY id FOR UPDATE
      `;
      const abonos = await tx.abono_deuda.count({
        where: { cuenta_id: { in: cuentas.map((c) => c.id) } },
      });
      if (abonos > 0) {
        throw new BadRequestException(
          'Esta compra ya tiene pagos; primero corrige esos pagos.',
        );
      }

      // 4. Se reclama la compra bajo lock (doble anulación → 400).
      const marcada = await tx.compras_inventario.updateMany({
        where: { id, anulado: false },
        data: {
          anulado: true,
          anulado_en: new Date(),
          anulado_por_id: userId ?? null,
          motivo_anulacion: motivo,
        },
      });
      if (marcada.count === 0) {
        throw new BadRequestException('Esta compra ya está anulada.');
      }

      // 5. Efectos: lotes en 0, deuda saldada, pago revertido.
      await tx.lotes_inventario.updateMany({
        where: { compra_id: id },
        data: { cantidad_disponible: 0 },
      });
      await tx.cuentas_por_pagar.updateMany({
        where: { compra_id: id },
        data: { saldo_pendiente: 0 },
      });
      let aviso: string | null = null;
      if (pago) {
        ({ aviso } = await marcarMovimientoAnulado(tx, pago, motivo, userId));
      }

      const actualizada = await tx.compras_inventario.findUniqueOrThrow({
        where: { id },
        include: {
          lotes_inventario: true,
          anulado_por: { select: { nombre: true } },
        },
      });
      return { ...actualizada, avisos: soloAvisos([aviso]) };
    }, TX_OPTIONS);
  }

  async findAll() {
    return this.prisma.compras_inventario.findMany({
      include: {
        lotes_inventario: true,
        usuarios: { select: { nombre: true } },
        anulado_por: { select: { nombre: true } },
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
