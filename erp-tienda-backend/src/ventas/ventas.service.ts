import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CajaTurnoRow, LoteInventarioRow } from '../common/concurrency';

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createVentaDto: CreateVentaDto, userId?: number) {
    // 1. Caja Activa: Busca la caja con estado: 'ABIERTA'
    const cajaTurno = await this.prisma.cajas_turnos.findFirst({
      where: { estado: 'ABIERTA' },
    });

    if (!cajaTurno) {
      throw new BadRequestException(
        'No hay turno de caja abierto para registrar la venta',
      );
    }

    // Todo el método create() debe estar dentro de un this.prisma.$transaction
    return await this.prisma.$transaction(async (tx) => {
      // Bloquea la fila del turno ANTES de insertar la venta (que la
      // referencia por FK) y revalida que siga ABIERTA. Si se bloqueara
      // después de insertar, dos ventas concurrentes sobre el mismo turno
      // podrían deadlockearse: ambas retienen el lock compartido implícito
      // que Postgres toma en el INSERT por la FK (FOR KEY SHARE) y luego
      // ambas intentan escalarlo a exclusivo al mismo tiempo (error 40P01).
      // Ver docs/decisions/0001-concurrencia-for-update.md.
      const [turnoLocked] = await tx.$queryRaw<CajaTurnoRow[]>`
        SELECT id, estado
        FROM cajas_turnos
        WHERE id = ${cajaTurno.id}
        FOR UPDATE
      `;

      if (!turnoLocked || turnoLocked.estado !== 'ABIERTA') {
        throw new BadRequestException(
          'No hay turno de caja abierto para registrar la venta',
        );
      }

      // 2. Inicializar Venta: Crea el registro en tx.ventas con total: 0
      const venta = await tx.ventas.create({
        data: {
          caja_turno_id: cajaTurno.id,
          total: 0,
          usuario_id: userId,
        },
      });

      let total_venta_acumulado = new Prisma.Decimal(0);

      // 3. Iterar el Carrito (Bucle Principal)
      for (const item of createVentaDto.detalles) {
        // Busca la Presentacion (incluyendo su producto_id, factor_conversion y precio_venta)
        const presentacion = await tx.presentaciones.findUnique({
          where: { id: item.presentacion_id },
        });

        if (!presentacion) {
          throw new NotFoundException(
            `Presentación con ID ${item.presentacion_id} no encontrada`,
          );
        }

        // Cantidad fraccionable → Decimal en todo el cálculo (Bloque 1 §5.3).
        const cantidadItem = new Prisma.Decimal(item.cantidad);

        // unidades_base_requeridas = cantidad * factor_conversion
        let unidades_base_requeridas = cantidadItem.mul(
          presentacion.factor_conversion,
        );

        // subtotal_venta = cantidad * precio_venta
        const subtotal_venta = cantidadItem.mul(presentacion.precio_venta);
        total_venta_acumulado = total_venta_acumulado.add(subtotal_venta);

        // Crea el tx.detalle_ventas vinculándolo a la venta y la presentación
        const detalleVenta = await tx.detalle_ventas.create({
          data: {
            venta_id: venta.id,
            presentacion_id: presentacion.id,
            cantidad: cantidadItem,
            subtotal: subtotal_venta,
          },
        });

        // 4. El Algoritmo FIFO (El corazón del sistema)
        // Bloquea los lotes candidatos con FOR UPDATE: bajo concurrencia, una
        // segunda venta del mismo producto debe esperar a que esta transacción
        // termine antes de leer cantidad_disponible, evitando sobreventa
        // (ver docs/decisions/0001-concurrencia-for-update.md).
        const lotes = await tx.$queryRaw<LoteInventarioRow[]>`
          SELECT id, producto_id, cantidad_disponible, costo_unitario_adquisicion
          FROM lotes_inventario
          WHERE producto_id = ${presentacion.producto_id}
            AND cantidad_disponible > 0
          ORDER BY fecha_ingreso ASC
          FOR UPDATE
        `;

        let loteIndex = 0;
        // Bucle FIFO en Decimal: mientras falten unidades base por cubrir
        while (unidades_base_requeridas.greaterThan(0)) {
          // Si no hay más lotes y aún faltan unidades → stock insuficiente
          if (loteIndex >= lotes.length) {
            throw new BadRequestException(
              `Stock insuficiente para el producto ID ${presentacion.producto_id}. Faltan ${unidades_base_requeridas.toFixed(3)} unidades base.`,
            );
          }

          const lote = lotes[loteIndex];
          // $queryRaw puede devolver el Decimal como string → normalizar
          const disponible = new Prisma.Decimal(lote.cantidad_disponible);
          // cantidad_a_descontar = min(faltante, disponible en este lote)
          const cantidad_a_descontar = Prisma.Decimal.min(
            unidades_base_requeridas,
            disponible,
          );

          // Actualiza el lote en BD restando la cantidad descargada
          await tx.lotes_inventario.update({
            where: { id: lote.id },
            data: {
              cantidad_disponible: {
                decrement: cantidad_a_descontar,
              },
            },
          });

          // Crea el puente contable congelando el costo del lote
          await tx.detalle_venta_lotes.create({
            data: {
              detalle_venta_id: detalleVenta.id,
              lote_id: lote.id,
              cantidad_descargada: cantidad_a_descontar,
              costo_aplicado: new Prisma.Decimal(
                lote.costo_unitario_adquisicion,
              ),
            },
          });

          // Descuenta lo cubierto por este lote y pasa al siguiente
          unidades_base_requeridas =
            unidades_base_requeridas.sub(cantidad_a_descontar);
          loteIndex++;
        }
      }

      // 5. Finalizar Venta: Actualiza el registro maestro tx.ventas seteando su total final
      const ventaFinal = await tx.ventas.update({
        where: { id: venta.id },
        data: {
          total: total_venta_acumulado,
        },
        include: {
          detalle_ventas: {
            include: {
              presentaciones: true,
            },
          },
        },
      });

      // 6. Actualizar Cajas Turnos: Suma el efectivo de la venta al esperado de la caja
      await tx.cajas_turnos.update({
        where: { id: cajaTurno.id },
        data: {
          efectivo_esperado: { increment: total_venta_acumulado },
        },
      });

      return ventaFinal;
    });
  }

  findAll() {
    return this.prisma.ventas.findMany({
      orderBy: { fecha: 'desc' },
      include: {
        detalle_ventas: {
          include: {
            presentaciones: true,
          },
        },
      },
    });
  }

  findOne(id: number) {
    return this.prisma.ventas.findUnique({
      where: { id },
      include: {
        detalle_ventas: {
          include: {
            presentaciones: true,
            detalle_venta_lotes: true,
          },
        },
      },
    });
  }

  async anular(id: number, justificacion_nula: string) {
    const venta = await this.prisma.ventas.findUnique({
      where: { id },
      include: {
        detalle_ventas: {
          include: { detalle_venta_lotes: true },
        },
      },
    });

    if (!venta) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    if (venta.estado === 'ANULADA') {
      throw new BadRequestException('La venta ya se encuentra anulada');
    }

    return await this.prisma.$transaction(async (tx) => {
      // ── BUG 5: Verificar que el turno de caja esté abierto ──
      // Si el turno ya fue cerrado, su cuadre histórico (diferencia) es inmutable.
      // Modificar efectivo_esperado después del cierre corrompería ese registro.
      // Se valida DENTRO de la tx con la fila bloqueada (FOR UPDATE): si el turno
      // se cierra justo en este instante, esta anulación debe verlo y rechazarse
      // (ver docs/decisions/0001-concurrencia-for-update.md).
      const [turno] = await tx.$queryRaw<CajaTurnoRow[]>`
        SELECT id, estado
        FROM cajas_turnos
        WHERE id = ${venta.caja_turno_id}
        FOR UPDATE
      `;

      if (!turno || turno.estado !== 'ABIERTA') {
        throw new BadRequestException(
          'No se puede anular una venta de un turno de caja ya cerrado. ' +
            'Las anulaciones solo son posibles durante el turno activo.',
        );
      }

      // 1. Marcar como anulada
      const ventaAnulada = await tx.ventas.update({
        where: { id },
        data: {
          estado: 'ANULADA',
          justificacion_nula,
          fecha_anulacion: new Date(),
        },
      });

      // 2. Devolver stock a los lotes exactos
      for (const detalle of venta.detalle_ventas) {
        for (const lote of detalle.detalle_venta_lotes) {
          await tx.lotes_inventario.update({
            where: { id: lote.lote_id },
            data: {
              cantidad_disponible: {
                increment: lote.cantidad_descargada,
              },
            },
          });
        }
      }

      // 3. Reducir el efectivo esperado del turno activo
      // (Ya validamos arriba que el turno está ABIERTA)
      await tx.cajas_turnos.update({
        where: { id: venta.caja_turno_id },
        data: {
          efectivo_esperado: {
            decrement: venta.total,
          },
        },
      });

      return ventaAnulada;
    });
  }

  /**
   * Devolución de cliente post-turno (Bloque 3.B, ítem 13). Ligada a la venta
   * original: por cada línea devuelta se revierte el costo FIFO al lote exacto a
   * su costo congelado (proporcional en devoluciones parciales) y se reembolsa
   * desde el turno ACTUAL. La venta original permanece COMPLETADA.
   *  - REINGRESO: el producto vuelve al lote (revendible).
   *  - MERMA: se descarta (no reingresa stock; su costo queda como pérdida).
   */
  async devolver(ventaId: number, dto: CreateDevolucionDto, userId?: number) {
    const venta = await this.prisma.ventas.findUnique({
      where: { id: ventaId },
      include: {
        detalle_ventas: {
          include: { detalle_venta_lotes: true, detalle_devoluciones: true },
        },
      },
    });

    if (!venta) {
      throw new NotFoundException(`Venta con ID ${ventaId} no encontrada`);
    }
    if (venta.estado !== 'COMPLETADA') {
      throw new BadRequestException(
        'Solo se pueden devolver ventas completadas',
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      // El reembolso sale de la gaveta del turno ACTUAL. Se bloquea el turno
      // ANTES de insertar la devolución que lo referencia por FK (orden
      // lock-antes-de-INSERT, ver docs/decisions/0001-concurrencia-for-update.md).
      const [turno] = await tx.$queryRaw<CajaTurnoRow[]>`
        SELECT id, estado, efectivo_esperado
        FROM cajas_turnos
        WHERE estado = 'ABIERTA'
        FOR UPDATE
      `;
      if (!turno) {
        throw new BadRequestException(
          'No hay turno de caja abierto para registrar la devolución ' +
            '(el reembolso sale de la caja actual)',
        );
      }

      let totalReembolsado = new Prisma.Decimal(0);
      const detalleRows: Prisma.detalle_devolucionesCreateManyDevolucionesInput[] =
        [];

      for (const item of dto.detalles) {
        const detalle = venta.detalle_ventas.find(
          (d) => d.id === item.detalle_venta_id,
        );
        if (!detalle) {
          throw new BadRequestException(
            `La línea ${item.detalle_venta_id} no pertenece a la venta ${ventaId}`,
          );
        }

        const cantidadVendida = new Prisma.Decimal(detalle.cantidad);
        const yaDevuelto = detalle.detalle_devoluciones.reduce(
          (acc, d) => acc.add(d.cantidad),
          new Prisma.Decimal(0),
        );
        const cantidadDevolver = new Prisma.Decimal(item.cantidad);
        const disponibleDevolver = cantidadVendida.sub(yaDevuelto);
        if (cantidadDevolver.greaterThan(disponibleDevolver)) {
          throw new BadRequestException(
            `No se puede devolver ${cantidadDevolver.toFixed(3)} de la línea ` +
              `${detalle.id}: vendidas ${cantidadVendida.toFixed(3)}, ya ` +
              `devueltas ${yaDevuelto.toFixed(3)}`,
          );
        }

        // Proporción devuelta de la línea (sobre lo vendido).
        const proporcion = cantidadDevolver.div(cantidadVendida);
        // Monto a reembolsar = subtotal congelado × proporción.
        const subtotalReembolsado = new Prisma.Decimal(detalle.subtotal)
          .mul(proporcion)
          .toDecimalPlaces(2);

        // Reversión FIFO: cada lote de la línea recupera (descargado × proporción)
        // a su costo congelado. REINGRESO devuelve el stock; MERMA no.
        let costoRevertido = new Prisma.Decimal(0);
        for (const dvl of detalle.detalle_venta_lotes) {
          const cantidadLote = new Prisma.Decimal(dvl.cantidad_descargada).mul(
            proporcion,
          );
          costoRevertido = costoRevertido.add(
            cantidadLote.mul(dvl.costo_aplicado),
          );
          if (item.destino === 'REINGRESO') {
            await tx.lotes_inventario.update({
              where: { id: dvl.lote_id },
              data: { cantidad_disponible: { increment: cantidadLote } },
            });
          }
        }

        detalleRows.push({
          detalle_venta_id: detalle.id,
          cantidad: cantidadDevolver,
          destino: item.destino,
          subtotal_reembolsado: subtotalReembolsado,
          costo_revertido: costoRevertido.toDecimalPlaces(2),
        });
        totalReembolsado = totalReembolsado.add(subtotalReembolsado);
      }

      const devolucion = await tx.devoluciones.create({
        data: {
          venta_id: ventaId,
          caja_turno_id: turno.id,
          usuario_id: userId,
          total_reembolsado: totalReembolsado,
          justificacion: dto.justificacion?.trim() || null,
          detalle_devoluciones: { create: detalleRows },
        },
        include: { detalle_devoluciones: true },
      });

      // El reembolso baja el efectivo esperado del turno actual (sale de la gaveta).
      await tx.cajas_turnos.update({
        where: { id: turno.id },
        data: { efectivo_esperado: { decrement: totalReembolsado } },
      });

      return devolucion;
    });
  }
}
