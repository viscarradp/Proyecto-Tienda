import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Estado de Resultados del negocio para un período dado.
   *
   * Fórmula contable:
   *   Ingreso Bruto (ventas completadas)
   * - Costo de Ventas FIFO (costo real de los lotes consumidos)
   * = UTILIDAD BRUTA
   * - Gastos Operativos (egresos registrados)
   * - Pérdidas por Mermas (mermas de inventario)
   * = UTILIDAD NETA
   */
  async getEstadoResultados(desde: Date, hasta: Date) {
    // ── 1. Ingresos brutos: ventas COMPLETADAS en el período ──
    const ventasAgg = await this.prisma.ventas.aggregate({
      where: {
        estado: 'COMPLETADA',
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { total: true },
      _count: { id: true },
    });

    const ingreso_bruto = ventasAgg._sum.total ?? new Prisma.Decimal(0);
    const total_ventas_completadas = ventasAgg._count.id;

    // ── 2. Ventas anuladas (solo conteo informativo) ──
    const anuladasAgg = await this.prisma.ventas.aggregate({
      where: {
        estado: 'ANULADA',
        fecha: { gte: desde, lte: hasta },
      },
      _count: { id: true },
    });
    const total_ventas_anuladas = anuladasAgg._count.id;

    // ── 3. Costo de Ventas FIFO ──
    // Sumamos cantidad_descargada × costo_aplicado de cada descarga de lote
    // que pertenezca a ventas COMPLETADAS del período.
    const costosRaw = await this.prisma.detalle_venta_lotes.findMany({
      where: {
        detalle_ventas: {
          ventas: {
            estado: 'COMPLETADA',
            fecha: { gte: desde, lte: hasta },
          },
        },
      },
      select: {
        cantidad_descargada: true,
        costo_aplicado: true,
      },
    });

    const costo_de_ventas = costosRaw.reduce(
      (acc, row) =>
        acc.add(
          new Prisma.Decimal(row.cantidad_descargada).mul(row.costo_aplicado),
        ),
      new Prisma.Decimal(0),
    );

    // ── 4. Utilidad Bruta ──
    const utilidad_bruta = new Prisma.Decimal(ingreso_bruto).sub(
      costo_de_ventas,
    );

    // ── 5. Gastos Operativos ──
    const gastosAgg = await this.prisma.movimientos_financieros.aggregate({
      where: {
        tipo_movimiento: 'EGRESO_OPERATIVO',
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { monto: true },
    });
    const gastos_operativos = gastosAgg._sum.monto ?? new Prisma.Decimal(0);

    // ── 6. Pérdidas por Mermas ──
    const mermasAgg = await this.prisma.movimientos_financieros.aggregate({
      where: {
        tipo_movimiento: 'MERMA_INVENTARIO',
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { monto: true },
    });
    const mermas_inventario = mermasAgg._sum.monto ?? new Prisma.Decimal(0);

    // ── 6.5. Retiros personales del dueño (§2, Bloque 1.D) ──
    // Es una DISTRIBUCIÓN de patrimonio, NO un gasto: no resta de la utilidad.
    // Se reporta aparte para explicar "el negocio ganó $X y vos retiraste $Y".
    const retirosAgg = await this.prisma.movimientos_financieros.aggregate({
      where: {
        tipo_movimiento: 'RETIRO_PERSONAL',
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { monto: true },
    });
    const retiros_duenos = retirosAgg._sum.monto ?? new Prisma.Decimal(0);

    // ── 6.6. Faltantes / sobrantes de caja y bóveda (§4, Bloque 2) ──
    // El faltante es una pérdida real (señal #1 de robo hormiga) y debe restar
    // de la utilidad; el sobrante, sumar. Antes se ignoraban y la utilidad se
    // inflaba sistemáticamente.
    const faltantesAgg = await this.prisma.movimientos_financieros.aggregate({
      where: {
        tipo_movimiento: { in: ['AJUSTE_FALTANTE', 'AJUSTE_BOVEDA_FALTANTE'] },
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { monto: true },
    });
    const faltantes = faltantesAgg._sum.monto ?? new Prisma.Decimal(0);

    const sobrantesAgg = await this.prisma.movimientos_financieros.aggregate({
      where: {
        tipo_movimiento: { in: ['AJUSTE_SOBRANTE', 'AJUSTE_BOVEDA_SOBRANTE'] },
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { monto: true },
    });
    const sobrantes = sobrantesAgg._sum.monto ?? new Prisma.Decimal(0);

    // ── 7. Utilidad Neta ──
    const utilidad_neta = utilidad_bruta
      .sub(gastos_operativos)
      .sub(mermas_inventario)
      .sub(faltantes)
      .add(sobrantes);

    // ── 8. Margen bruto % ──
    const margen_bruto_pct = ingreso_bruto.gt(0)
      ? utilidad_bruta.div(ingreso_bruto).mul(100).toDecimalPlaces(2)
      : new Prisma.Decimal(0);

    // ── 9. Ticket promedio ──
    const ticket_promedio =
      total_ventas_completadas > 0
        ? new Prisma.Decimal(ingreso_bruto)
            .div(total_ventas_completadas)
            .toDecimalPlaces(2)
        : new Prisma.Decimal(0);

    return {
      periodo: { desde, hasta },
      ingreso_bruto_ventas: ingreso_bruto,
      costo_de_ventas_fifo: costo_de_ventas,
      utilidad_bruta,
      margen_bruto_porcentaje: margen_bruto_pct,
      gastos_operativos,
      mermas_inventario,
      faltantes,
      sobrantes,
      utilidad_neta,
      retiros_duenos,
      total_ventas_completadas,
      total_ventas_anuladas,
      ticket_promedio,
    };
  }

  /**
   * Productos más vendidos en el período, con cálculo de margen FIFO.
   */
  async getProductosTop(desde: Date, hasta: Date, limit: number = 10) {
    // Obtener todos los detalles de venta del período (ventas completadas)
    const detalles = await this.prisma.detalle_ventas.findMany({
      where: {
        ventas: {
          estado: 'COMPLETADA',
          fecha: { gte: desde, lte: hasta },
        },
      },
      include: {
        presentaciones: {
          include: { productos: true },
        },
        detalle_venta_lotes: true,
      },
    });

    // Agrupar por producto
    const productosMap = new Map<
      number,
      {
        nombre: string;
        unidades_vendidas: number;
        ingreso: Prisma.Decimal;
        costo_fifo: Prisma.Decimal;
      }
    >();

    for (const det of detalles) {
      const prodId = det.presentaciones.producto_id;
      const prodNombre = det.presentaciones.productos.nombre;
      // cantidad y factor_conversion son Decimal desde 1.B; a number para el reporte
      const unidadesBase = new Prisma.Decimal(det.cantidad)
        .mul(det.presentaciones.factor_conversion)
        .toNumber();

      const costoDetalles = det.detalle_venta_lotes.reduce(
        (acc, dvl) =>
          acc.add(
            new Prisma.Decimal(dvl.cantidad_descargada).mul(dvl.costo_aplicado),
          ),
        new Prisma.Decimal(0),
      );

      const existing = productosMap.get(prodId);
      if (existing) {
        existing.unidades_vendidas += unidadesBase;
        existing.ingreso = existing.ingreso.add(det.subtotal);
        existing.costo_fifo = existing.costo_fifo.add(costoDetalles);
      } else {
        productosMap.set(prodId, {
          nombre: prodNombre,
          unidades_vendidas: unidadesBase,
          ingreso: new Prisma.Decimal(det.subtotal),
          costo_fifo: costoDetalles,
        });
      }
    }

    // Convertir a array, calcular margen, ordenar
    const resultado = Array.from(productosMap.entries())
      .map(([producto_id, data]) => {
        const margen = data.ingreso.sub(data.costo_fifo);
        const margen_pct = data.ingreso.gt(0)
          ? margen.div(data.ingreso).mul(100).toDecimalPlaces(2)
          : new Prisma.Decimal(0);

        return {
          producto_id,
          nombre: data.nombre,
          unidades_vendidas: data.unidades_vendidas,
          ingreso: data.ingreso,
          costo_fifo: data.costo_fifo,
          margen,
          margen_porcentaje: margen_pct,
        };
      })
      .sort((a, b) => b.unidades_vendidas - a.unidades_vendidas)
      .slice(0, limit);

    return resultado;
  }

  /**
   * Margen de ganancia FIFO por cada producto vendido en el período.
   * Ordenado por margen porcentual ascendente (los peores márgenes primero).
   */
  async getMargenPorProducto(desde: Date, hasta: Date) {
    // Reutilizamos la misma lógica pero sin limit y ordenamos por margen
    const todos = await this.getProductosTop(desde, hasta, 9999);

    return todos.sort((a, b) =>
      a.margen_porcentaje.sub(b.margen_porcentaje).toNumber(),
    );
  }
}
