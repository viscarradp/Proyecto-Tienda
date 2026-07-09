import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { saldoBovedaDerivado } from '../common/cuentas-efectivo';

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

    const costo_de_ventas_bruto = costosRaw.reduce(
      (acc, row) =>
        acc.add(
          new Prisma.Decimal(row.cantidad_descargada).mul(row.costo_aplicado),
        ),
      new Prisma.Decimal(0),
    );

    // ── 3.5. Devoluciones de clientes del período (Bloque 3.B, ítem 13) ──
    // Reversan ingreso; las de destino REINGRESO además devuelven su costo al
    // inventario, así que bajan el costo de ventas (las MERMA dejan ese costo
    // como pérdida real). Se netean por la fecha de la devolución.
    const devolucionesAgg = await this.prisma.devoluciones.aggregate({
      where: { fecha: { gte: desde, lte: hasta } },
      _sum: { total_reembolsado: true },
    });
    const devoluciones =
      devolucionesAgg._sum.total_reembolsado ?? new Prisma.Decimal(0);

    const reingresoAgg = await this.prisma.detalle_devoluciones.aggregate({
      where: {
        destino: 'REINGRESO',
        devoluciones: { fecha: { gte: desde, lte: hasta } },
      },
      _sum: { costo_revertido: true },
    });
    const costo_revertido_reingreso =
      reingresoAgg._sum.costo_revertido ?? new Prisma.Decimal(0);

    // Ingreso y costo NETOS de devoluciones.
    const ingreso_neto = new Prisma.Decimal(ingreso_bruto).sub(devoluciones);
    const costo_de_ventas = costo_de_ventas_bruto.sub(
      costo_revertido_reingreso,
    );

    // ── 4. Utilidad Bruta ──
    const utilidad_bruta = ingreso_neto.sub(costo_de_ventas);

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

    // ── 8. Margen bruto % (sobre ingreso neto de devoluciones) ──
    const margen_bruto_pct = ingreso_neto.gt(0)
      ? utilidad_bruta.div(ingreso_neto).mul(100).toDecimalPlaces(2)
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
      devoluciones,
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
   * Efectivo en la GAVETA (caja del mostrador) en este instante.
   *  - Si hay un turno ABIERTA: es su efectivo_esperado.
   *  - Si no: es el fondo que quedó del último cierre = efectivo declarado
   *    menos lo que ese cierre trasladó a la bóveda. Se consideran tanto
   *    'CERRADA' como 'CERRADA_FORZADA' (2.B) para no derivar de un cierre viejo.
   */
  private async getEfectivoGaveta(): Promise<Prisma.Decimal> {
    const turnoAbierto = await this.prisma.cajas_turnos.findFirst({
      where: { estado: 'ABIERTA' },
    });
    if (turnoAbierto) {
      return new Prisma.Decimal(turnoAbierto.efectivo_esperado ?? 0);
    }

    const ultimoCierre = await this.prisma.cajas_turnos.findFirst({
      where: { estado: { in: ['CERRADA', 'CERRADA_FORZADA'] } },
      orderBy: { fecha_cierre: 'desc' },
      include: {
        movimientos_financieros: {
          where: { tipo_movimiento: 'TRASLADO_A_BOVEDA' },
        },
      },
    });
    if (!ultimoCierre) {
      return new Prisma.Decimal(0);
    }
    const trasladado = ultimoCierre.movimientos_financieros.reduce(
      (acc, m) => acc.add(m.monto),
      new Prisma.Decimal(0),
    );
    return new Prisma.Decimal(ultimoCierre.efectivo_declarado ?? 0).sub(
      trasladado,
    );
  }

  /**
   * Patrimonio del negocio (foto de balance al instante), §8.4 de la auditoría:
   *   patrimonio_neto = inventario + efectivo(gaveta + bóveda) + activos_fijos − deudas
   *
   * - inventario: valuado al costo FIFO congelado de cada lote (Σ disponible × costo).
   * - efectivo: gaveta (turno o último cierre) + bóveda (saldo derivado del libro).
   * - activos_fijos: a valor estimado, SIN depreciación (decisión consciente a esta escala).
   * - deudas: saldo pendiente de cuentas por pagar.
   */
  async getPatrimonio() {
    // Inventario: Σ (cantidad_disponible × costo_unitario_adquisicion). No se puede
    // expresar con aggregate de Prisma (multiplica dos columnas) → SQL crudo.
    const invRows = await this.prisma.$queryRaw<
      { valor: Prisma.Decimal | string | null }[]
    >`
      SELECT COALESCE(SUM(cantidad_disponible * costo_unitario_adquisicion), 0) AS valor
      FROM lotes_inventario
    `;
    const inventario = new Prisma.Decimal(invRows[0]?.valor ?? 0);

    const gaveta = await this.getEfectivoGaveta();
    const boveda = await saldoBovedaDerivado(this.prisma);
    const efectivo_total = gaveta.add(boveda);

    const activosAgg = await this.prisma.activos_fijos.aggregate({
      _sum: { valor_estimado: true },
    });
    const activos_fijos =
      activosAgg._sum.valor_estimado ?? new Prisma.Decimal(0);

    const deudasAgg = await this.prisma.cuentas_por_pagar.aggregate({
      _sum: { saldo_pendiente: true },
    });
    const deudas = deudasAgg._sum.saldo_pendiente ?? new Prisma.Decimal(0);

    const patrimonio_neto = inventario
      .add(efectivo_total)
      .add(activos_fijos)
      .sub(deudas);

    return {
      inventario,
      efectivo: { gaveta, boveda, total: efectivo_total },
      activos_fijos,
      deudas,
      patrimonio_neto,
    };
  }

  /**
   * Flujo de efectivo por cuenta en el período (§8.5). "Casi gratis" gracias al
   * modelo origen→destino del Bloque 1: para cada cuenta de efectivo real,
   * entradas = Σ(monto donde destino = cuenta), salidas = Σ(monto donde origen = cuenta).
   *
   * Las VENTAS entran a la gaveta pero no viven en movimientos_financieros (suben
   * efectivo_esperado directamente) → se suman aparte como entrada a gaveta.
   * (Las devoluciones del ítem 13 restarán de la gaveta cuando aterrice 3.B.)
   */
  async getFlujoEfectivo(desde: Date, hasta: Date) {
    const rango = { gte: desde, lte: hasta };

    const flujoCuenta = async (cuenta: 'GAVETA' | 'BOVEDA') => {
      const [entradasAgg, salidasAgg] = await Promise.all([
        this.prisma.movimientos_financieros.aggregate({
          where: { cuenta_destino: cuenta, fecha: rango },
          _sum: { monto: true },
        }),
        this.prisma.movimientos_financieros.aggregate({
          where: { cuenta_origen: cuenta, fecha: rango },
          _sum: { monto: true },
        }),
      ]);
      return {
        entradas: entradasAgg._sum.monto ?? new Prisma.Decimal(0),
        salidas: salidasAgg._sum.monto ?? new Prisma.Decimal(0),
      };
    };

    const gaveta = await flujoCuenta('GAVETA');
    const boveda = await flujoCuenta('BOVEDA');

    // Ventas completadas: efectivo que entró a la gaveta sin pasar por el libro.
    const ventasAgg = await this.prisma.ventas.aggregate({
      where: { estado: 'COMPLETADA', fecha: rango },
      _sum: { total: true },
    });
    const ventas_efectivo = ventasAgg._sum.total ?? new Prisma.Decimal(0);
    gaveta.entradas = gaveta.entradas.add(ventas_efectivo);

    // Devoluciones: reembolsos que SALEN de la gaveta (Bloque 3.B). Tampoco
    // viven en movimientos_financieros, así que se restan aparte.
    const devolucionesAgg = await this.prisma.devoluciones.aggregate({
      where: { fecha: rango },
      _sum: { total_reembolsado: true },
    });
    const devoluciones_efectivo =
      devolucionesAgg._sum.total_reembolsado ?? new Prisma.Decimal(0);
    gaveta.salidas = gaveta.salidas.add(devoluciones_efectivo);

    const conNeto = (c: {
      entradas: Prisma.Decimal;
      salidas: Prisma.Decimal;
    }) => ({
      entradas: c.entradas,
      salidas: c.salidas,
      neto: c.entradas.sub(c.salidas),
    });

    return {
      periodo: { desde, hasta },
      ventas_efectivo,
      devoluciones_efectivo,
      gaveta: conNeto(gaveta),
      boveda: conNeto(boveda),
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
