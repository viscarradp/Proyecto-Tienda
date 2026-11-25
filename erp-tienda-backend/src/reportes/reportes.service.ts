import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { efectivoEnGaveta } from '../common/efectivo-gaveta';
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

    // Ventas sin stock registrado (L5a · D-01): su costo quedó congelado al
    // estimado (cantidad_base × costo_unitario_estimado) y cuenta como costo de
    // ventas aunque el pendiente se cubra después.
    const pendientesRaw = await this.prisma.pendientes_stock.findMany({
      where: {
        detalle_ventas: {
          ventas: {
            estado: 'COMPLETADA',
            fecha: { gte: desde, lte: hasta },
          },
        },
      },
      select: { cantidad_base: true, costo_unitario_estimado: true },
    });

    const costo_de_ventas_bruto = costosRaw
      .reduce(
        (acc, row) =>
          acc.add(
            new Prisma.Decimal(row.cantidad_descargada).mul(row.costo_aplicado),
          ),
        new Prisma.Decimal(0),
      )
      .add(
        pendientesRaw.reduce(
          (acc, row) =>
            acc.add(
              new Prisma.Decimal(row.cantidad_base).mul(
                row.costo_unitario_estimado,
              ),
            ),
          new Prisma.Decimal(0),
        ),
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
        anulado: false,
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { monto: true },
    });
    const gastos_operativos = gastosAgg._sum.monto ?? new Prisma.Decimal(0);

    // ── 6. Pérdidas por Mermas ──
    const mermasAgg = await this.prisma.movimientos_financieros.aggregate({
      where: {
        tipo_movimiento: 'MERMA_INVENTARIO',
        anulado: false,
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
        anulado: false,
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
        anulado: false,
        fecha: { gte: desde, lte: hasta },
      },
      _sum: { monto: true },
    });
    const faltantes = faltantesAgg._sum.monto ?? new Prisma.Decimal(0);

    const sobrantesAgg = await this.prisma.movimientos_financieros.aggregate({
      where: {
        tipo_movimiento: { in: ['AJUSTE_SOBRANTE', 'AJUSTE_BOVEDA_SOBRANTE'] },
        anulado: false,
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

    const ventas_sin_costo = await this.getVentasSinCosto(desde, hasta);

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
      ventas_sin_costo,
    };
  }

  /**
   * Lo vendido en el período cuyo costo todavía es $0 (DUE-27): deuda de stock
   * (`pendientes_stock`) con costo estimado 0, es decir, producto sin compras
   * previas que no se ha cubierto con una compra. Cuando una compra lo cubre el
   * estimado pasa al costo real del lote y la fila deja de contar aquí.
   * Solo ventas COMPLETADAS; el monto se prorratea sobre el subtotal de la
   * línea (la parte sin costo) y descuenta la proporción ya devuelta.
   */
  private async getVentasSinCosto(desde: Date, hasta: Date) {
    const filas = await this.prisma.pendientes_stock.findMany({
      where: {
        costo_unitario_estimado: 0,
        cantidad_base: { gt: 0 },
        detalle_ventas: {
          ventas: { estado: 'COMPLETADA', fecha: { gte: desde, lte: hasta } },
        },
      },
      include: {
        detalle_ventas: {
          include: {
            presentaciones: { include: { productos: true } },
            detalle_devoluciones: { select: { cantidad: true } },
          },
        },
      },
    });

    let monto = new Prisma.Decimal(0);
    const lineas = new Set<number>();
    const productos = new Map<number, string>();
    for (const f of filas) {
      const det = f.detalle_ventas;
      const pres = det.presentaciones;
      const baseLinea = new Prisma.Decimal(det.cantidad).mul(
        pres.factor_conversion,
      );
      if (baseLinea.lte(0)) continue;
      const devuelto = det.detalle_devoluciones.reduce(
        (acc, d) => acc.add(d.cantidad),
        new Prisma.Decimal(0),
      );
      const noDevuelto = Prisma.Decimal.max(
        new Prisma.Decimal(1).sub(
          devuelto.div(new Prisma.Decimal(det.cantidad)),
        ),
        0,
      );
      const parte = new Prisma.Decimal(det.subtotal)
        .mul(
          Prisma.Decimal.min(
            new Prisma.Decimal(f.cantidad_base).div(baseLinea),
            1,
          ),
        )
        .mul(noDevuelto);
      if (parte.lte(0)) continue;
      monto = monto.add(parte);
      lineas.add(det.id);
      productos.set(pres.producto_id, pres.productos.nombre);
    }

    const ordenados = Array.from(productos.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], 'es'),
    );
    return {
      monto_vendido: monto.toDecimalPlaces(2),
      lineas: lineas.size,
      productos: ordenados.map(([, nombre]) => nombre),
      producto_ids: ordenados.map(([id]) => id),
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
    return efectivoEnGaveta(this.prisma);
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
          where: { cuenta_destino: cuenta, anulado: false, fecha: rango },
          _sum: { monto: true },
        }),
        this.prisma.movimientos_financieros.aggregate({
          where: { cuenta_origen: cuenta, anulado: false, fecha: rango },
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
   * Los números son NETOS de devoluciones del período.
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
        pendientes_stock: true,
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

      // Costo FIFO de los lotes + costo estimado de lo vendido sin stock
      // registrado (L5a · D-01).
      const costoDetalles = det.detalle_venta_lotes
        .reduce(
          (acc, dvl) =>
            acc.add(
              new Prisma.Decimal(dvl.cantidad_descargada).mul(
                dvl.costo_aplicado,
              ),
            ),
          new Prisma.Decimal(0),
        )
        .add(
          det.pendientes_stock.reduce(
            (acc, p) =>
              acc.add(
                new Prisma.Decimal(p.cantidad_base).mul(
                  p.costo_unitario_estimado,
                ),
              ),
            new Prisma.Decimal(0),
          ),
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

    // Devoluciones del período (mismo criterio de fechas que el estado de
    // resultados: por la fecha de la devolución). Restan unidades, ingreso y,
    // solo si el destino es REINGRESO, el costo que volvió al inventario.
    const devueltos = await this.prisma.detalle_devoluciones.findMany({
      where: { devoluciones: { fecha: { gte: desde, lte: hasta } } },
      include: {
        detalle_ventas: {
          include: { presentaciones: { include: { productos: true } } },
        },
      },
    });

    for (const dev of devueltos) {
      const pres = dev.detalle_ventas.presentaciones;
      const unidadesBase = new Prisma.Decimal(dev.cantidad)
        .mul(pres.factor_conversion)
        .toNumber();
      const costoRevertido =
        dev.destino === 'REINGRESO'
          ? new Prisma.Decimal(dev.costo_revertido)
          : new Prisma.Decimal(0);

      const existing = productosMap.get(pres.producto_id);
      if (existing) {
        existing.unidades_vendidas -= unidadesBase;
        existing.ingreso = existing.ingreso.sub(dev.subtotal_reembolsado);
        existing.costo_fifo = existing.costo_fifo.sub(costoRevertido);
      } else {
        productosMap.set(pres.producto_id, {
          nombre: pres.productos.nombre,
          unidades_vendidas: -unidadesBase,
          ingreso: new Prisma.Decimal(dev.subtotal_reembolsado).neg(),
          costo_fifo: costoRevertido.neg(),
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
