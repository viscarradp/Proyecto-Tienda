import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CajaTurnoRow, LoteInventarioRow } from '../common/concurrency';
import { TX_OPTIONS } from '../common/transaccion';
import { redondearDinero } from '../common/redondeo';
import { MAX_CANTIDAD } from '../common/validacion';
import {
  bloquearLotes,
  bloquearPendientesDeDetalles,
  redondearCantidad,
  reingresarPendiente,
  revertirPendientesPorAnulacion,
} from '../common/pendientes-stock';

/** Máximo de días hacia atrás que acepta la fecha de contingencia. */
const DIAS_MAX_CONTINGENCIA = 30;

/** Qué se devuelve al crear (o al repetir una creación idempotente) una venta. */
const VENTA_INCLUDE = {
  detalle_ventas: {
    include: {
      presentaciones: true,
    },
  },
} satisfies Prisma.ventasInclude;

/**
 * Cantidad legible para un aviso: hasta 3 decimales, redondeo hacia arriba
 * (para que una fracción mínima no se lea como 0), sin ceros sobrantes.
 */
function cantidadLegible(valor: Prisma.Decimal.Value): string {
  return new Prisma.Decimal(valor)
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_UP)
    .toString();
}

/** Arma el texto de aviso de una línea vendida sin stock registrado. */
function textoAviso(
  nombre: string,
  descripcion: string,
  cantidad: Prisma.Decimal.Value,
  sinCosto: boolean,
): string {
  const base = `Vendiste ${cantidadLegible(cantidad)} "${nombre} (${descripcion})" sin stock registrado.`;
  return sinCosto
    ? `${base} Este producto no tiene costo registrado: la ganancia de esta venta saldrá alta hasta que registres la compra.`
    : `${base} Registra la compra o un conteo en Inventario.`;
}

/** Fila de ventas leída con FOR UPDATE. */
interface VentaRow {
  id: number;
  estado: string;
}

@Injectable()
export class VentasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea una venta. Con `claveIdempotencia` (header Idempotency-Key) un
   * reintento —p. ej. tras un corte de red— devuelve la venta ya creada en
   * lugar de duplicarla (ver docs/domain/caja-y-ventas.md).
   */
  async create(
    createVentaDto: CreateVentaDto,
    userId?: number,
    claveIdempotencia?: string,
  ) {
    this.validarCantidadOMonto(createVentaDto);

    // Atajo: si el reintento llega cuando la venta original ya está guardada
    // (incluso con el turno ya cerrado), se responde con ella. La garantía real
    // contra carreras está dentro de la transacción, bajo el lock del turno.
    if (claveIdempotencia) {
      const previa = await this.buscarPorClave(this.prisma, claveIdempotencia);
      if (previa) return previa;
    }

    try {
      return await this.crearVenta(createVentaDto, userId, claveIdempotencia);
    } catch (error) {
      // Defensa: si aun así salta la restricción única de la clave (dos
      // peticiones que se cruzaron), la venta ya existe: se devuelve esa.
      if (claveIdempotencia && this.esViolacionDeClave(error)) {
        const existente = await this.buscarPorClave(
          this.prisma,
          claveIdempotencia,
        );
        if (existente) return existente;
      }
      throw error;
    }
  }

  /**
   * Cada línea lleva exactamente UNO de `cantidad` o `monto` (D-03). Se valida
   * antes de abrir la transacción para dar un 400 claro.
   */
  private validarCantidadOMonto(dto: CreateVentaDto) {
    for (const item of dto.detalles) {
      const tieneCantidad =
        item.cantidad !== undefined && item.cantidad !== null;
      const tieneMonto = item.monto !== undefined && item.monto !== null;
      if (tieneCantidad && tieneMonto) {
        throw new BadRequestException(
          'Cada producto se vende por cantidad o por monto, no por las dos cosas a la vez',
        );
      }
      if (!tieneCantidad && !tieneMonto) {
        throw new BadRequestException(
          'Indica la cantidad o el monto de cada producto',
        );
      }
    }
  }

  private async buscarPorClave(
    db: Prisma.TransactionClient | PrismaService,
    clave: string,
  ) {
    const venta = await db.ventas.findUnique({
      where: { clave_idempotencia: clave },
      include: VENTA_INCLUDE,
    });
    if (!venta) return null;
    return { ...venta, avisos: await this.avisosDeVenta(db, venta.id) };
  }

  /**
   * Avisos de las líneas de una venta que quedaron con stock pendiente (D-01),
   * uno por línea, en la unidad de su presentación.
   */
  private async avisosDeVenta(
    db: Prisma.TransactionClient | PrismaService,
    ventaId: number,
  ): Promise<string[]> {
    const pendientes = await db.pendientes_stock.findMany({
      where: {
        detalle_ventas: { venta_id: ventaId },
        cantidad_pendiente: { gt: 0 },
      },
      orderBy: { id: 'asc' },
      include: {
        detalle_ventas: {
          include: {
            presentaciones: {
              include: { productos: { select: { nombre: true } } },
            },
          },
        },
      },
    });
    return pendientes.map((p) => {
      const pres = p.detalle_ventas.presentaciones;
      return textoAviso(
        pres.productos.nombre,
        pres.descripcion,
        new Prisma.Decimal(p.cantidad_pendiente).div(pres.factor_conversion),
        new Prisma.Decimal(p.costo_unitario_estimado).isZero(),
      );
    });
  }

  private esViolacionDeClave(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }
    // Con el adaptador de pg el target puede venir como lista de columnas o
    // dentro del error del driver; se busca el nombre de la columna en meta.
    return JSON.stringify(error.meta ?? {}).includes('clave_idempotencia');
  }

  private async crearVenta(
    createVentaDto: CreateVentaDto,
    userId?: number,
    claveIdempotencia?: string,
  ) {
    // 1. Caja Activa: Busca la caja con estado: 'ABIERTA'
    const cajaTurno = await this.prisma.cajas_turnos.findFirst({
      where: { estado: 'ABIERTA' },
    });

    if (!cajaTurno) {
      throw new BadRequestException(
        'No hay turno de caja abierto para registrar la venta',
      );
    }

    // Modo contingencia (3.D): si viene una fecha real (venta de un apagón), se
    // usa esa; nunca puede ser futura. Si se omite, Prisma usa el default now().
    let fechaVenta: Date | undefined;
    if (createVentaDto.fecha) {
      fechaVenta = new Date(createVentaDto.fecha);
      if (fechaVenta.getTime() > Date.now()) {
        throw new BadRequestException(
          'La fecha de la venta no puede estar en el futuro',
        );
      }
      const limiteAtras =
        Date.now() - DIAS_MAX_CONTINGENCIA * 24 * 60 * 60 * 1000;
      if (fechaVenta.getTime() < limiteAtras) {
        throw new BadRequestException(
          `La fecha de la venta no puede ser de hace más de ${DIAS_MAX_CONTINGENCIA} días`,
        );
      }
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

      // Idempotencia: con el turno ya bloqueado, cualquier otra venta con la
      // misma clave o ya está confirmada (la vemos) o espera detrás de este
      // lock; así dos peticiones simultáneas con la misma clave no duplican.
      if (claveIdempotencia) {
        const existente = await this.buscarPorClave(tx, claveIdempotencia);
        if (existente) return existente;
      }

      // 2. Inicializar Venta: Crea el registro en tx.ventas con total: 0
      const venta = await tx.ventas.create({
        data: {
          caja_turno_id: cajaTurno.id,
          total: 0,
          usuario_id: userId,
          fecha: fechaVenta,
          clave_idempotencia: claveIdempotencia ?? null,
        },
      });

      let total_venta_acumulado = new Prisma.Decimal(0);

      // 3. Iterar el Carrito (Bucle Principal)
      for (const item of createVentaDto.detalles) {
        // Busca la Presentacion (incluyendo su producto_id, factor_conversion y precio_venta)
        const presentacion = await tx.presentaciones.findUnique({
          where: { id: item.presentacion_id },
          include: { productos: { select: { nombre: true } } },
        });

        if (!presentacion) {
          throw new NotFoundException(
            `Presentación con ID ${item.presentacion_id} no encontrada`,
          );
        }

        // Cantidad fraccionable → Decimal en todo el cálculo (Bloque 1 §5.3).
        // Venta por monto (D-03): cantidad = monto ÷ precio (3 decimales,
        // half-up) y el subtotal es EXACTAMENTE el monto pedido.
        let cantidadItem: Prisma.Decimal;
        let montoExacto: Prisma.Decimal | null = null;
        if (item.monto !== undefined && item.monto !== null) {
          const precio = new Prisma.Decimal(presentacion.precio_venta);
          if (precio.lte(0)) {
            throw new BadRequestException(
              'No se puede vender por monto un producto sin precio',
            );
          }
          montoExacto = redondearDinero(item.monto);
          cantidadItem = redondearCantidad(montoExacto.div(precio));
          if (cantidadItem.lte(0)) {
            throw new BadRequestException(
              `El monto de $${montoExacto.toFixed(2)} es muy pequeño para "${presentacion.productos.nombre} (${presentacion.descripcion})"`,
            );
          }
          if (cantidadItem.gt(MAX_CANTIDAD)) {
            throw new BadRequestException(
              `El monto de $${montoExacto.toFixed(2)} es demasiado grande para "${presentacion.productos.nombre} (${presentacion.descripcion})"`,
            );
          }
        } else {
          cantidadItem = new Prisma.Decimal(item.cantidad as number);
        }

        // unidades_base_requeridas = cantidad * factor_conversion
        const unidades_base_totales = cantidadItem.mul(
          presentacion.factor_conversion,
        );
        let unidades_base_requeridas = unidades_base_totales;

        // subtotal_venta = cantidad * precio_venta, redondeado a 2 decimales
        // (half-up) ANTES de sumar: el total es la suma de lo guardado.
        const subtotal_venta =
          montoExacto ??
          redondearDinero(cantidadItem.mul(presentacion.precio_venta));
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
          ORDER BY fecha_ingreso ASC, id ASC
          FOR UPDATE
        `;

        let loteIndex = 0;
        // Bucle FIFO en Decimal: mientras falten unidades base por cubrir y
        // queden lotes con stock. Si se acaban los lotes, la venta NO falla
        // (D-01): lo que falta queda como "deuda de stock" (más abajo).
        while (
          unidades_base_requeridas.greaterThan(0) &&
          loteIndex < lotes.length
        ) {
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

        // Faltó stock registrado: se vende igual y se anota la deuda. El costo
        // se congela al del lote MÁS RECIENTE del producto (aunque esté
        // agotado), o 0 si nunca tuvo lotes.
        if (unidades_base_requeridas.greaterThan(0)) {
          const ultimoLote = await tx.lotes_inventario.findFirst({
            where: { producto_id: presentacion.producto_id },
            orderBy: [{ fecha_ingreso: 'desc' }, { id: 'desc' }],
            select: { costo_unitario_adquisicion: true },
          });
          await tx.pendientes_stock.create({
            data: {
              detalle_venta_id: detalleVenta.id,
              producto_id: presentacion.producto_id,
              cantidad_base: unidades_base_requeridas,
              cantidad_pendiente: unidades_base_requeridas,
              costo_unitario_estimado:
                ultimoLote?.costo_unitario_adquisicion ?? 0,
            },
          });
        }
      }

      // 5. Finalizar Venta: Actualiza el registro maestro tx.ventas seteando su total final
      const ventaFinal = await tx.ventas.update({
        where: { id: venta.id },
        data: {
          total: total_venta_acumulado,
        },
        include: VENTA_INCLUDE,
      });

      // 6. Actualizar Cajas Turnos: Suma el efectivo de la venta al esperado de la caja
      await tx.cajas_turnos.update({
        where: { id: cajaTurno.id },
        data: {
          efectivo_esperado: { increment: total_venta_acumulado },
        },
      });

      return {
        ...ventaFinal,
        avisos: await this.avisosDeVenta(tx, venta.id),
      };
    }, TX_OPTIONS);
  }

  findAll() {
    return this.prisma.ventas.findMany({
      orderBy: { fecha: 'desc' },
      include: {
        // Solo el conteo: la UI decide si ofrece «Anular» (no se puede anular
        // una venta con devoluciones).
        _count: { select: { devoluciones: true } },
        // Solo los montos reembolsados: la pantalla descuenta las devoluciones
        // de los «Ingresos del período».
        devoluciones: { select: { total_reembolsado: true } },
        detalle_ventas: {
          include: {
            // Nombre del producto para mostrar «Frijol rojo · Libra».
            presentaciones: {
              include: { productos: { select: { nombre: true } } },
            },
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
            pendientes_stock: true,
          },
        },
      },
    });
  }

  async anular(id: number, justificacion_nula: string) {
    // Lectura previa SOLO para ubicar el turno a bloquear. Todo lo demás
    // (estado, devoluciones, líneas y lotes) se lee y valida bajo lock dentro
    // de la transacción.
    const previa = await this.prisma.ventas.findUnique({
      where: { id },
      select: { caja_turno_id: true },
    });

    if (!previa) {
      throw new NotFoundException(`Venta con ID ${id} no encontrada`);
    }

    return await this.prisma.$transaction(async (tx) => {
      // Orden de locks: TURNO primero, luego VENTA (igual que devolver(), para
      // no crear deadlocks). Ver docs/decisions/0001-concurrencia-for-update.md.
      // Si el turno ya fue cerrado, su cuadre histórico (diferencia) es
      // inmutable: modificar efectivo_esperado lo corrompería.
      const [turno] = await tx.$queryRaw<CajaTurnoRow[]>`
        SELECT id, estado
        FROM cajas_turnos
        WHERE id = ${previa.caja_turno_id}
        FOR UPDATE
      `;

      if (!turno || turno.estado !== 'ABIERTA') {
        throw new BadRequestException(
          'No se puede anular una venta de un turno de caja ya cerrado. ' +
            'Las anulaciones solo son posibles durante el turno activo.',
        );
      }

      // Bloquea la fila de la venta y re-valida bajo lock: una segunda
      // anulación concurrente (doble clic) espera aquí y, al continuar, ve la
      // venta ya ANULADA y se rechaza en vez de revertir dos veces.
      const [ventaLocked] = await tx.$queryRaw<VentaRow[]>`
        SELECT id, estado
        FROM ventas
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!ventaLocked) {
        throw new NotFoundException(`Venta con ID ${id} no encontrada`);
      }
      if (ventaLocked.estado === 'ANULADA') {
        throw new BadRequestException('La venta ya se encuentra anulada');
      }

      // Una venta con devoluciones no se anula: revertirla completa duplicaría
      // el stock y el efectivo ya devueltos por la devolución.
      const devoluciones = await tx.devoluciones.count({
        where: { venta_id: id },
      });
      if (devoluciones > 0) {
        throw new ConflictException(
          'Esta venta ya tiene devoluciones registradas, así que no se puede ' +
            'anular. Usa «Devolver» para el resto de los productos.',
        );
      }

      // Lectura de líneas, lotes y pendientes ya bajo lock de venta.
      const venta = await tx.ventas.findUniqueOrThrow({
        where: { id },
        include: {
          detalle_ventas: {
            include: { detalle_venta_lotes: true, pendientes_stock: true },
          },
        },
      });

      // Orden global: turno → venta → LOTES → PENDIENTES. Los lotes a tocar son
      // los de donde salió el stock y los que cubrieron pendientes.
      const lotesBloqueados = new Set<number>();
      const idsLotes = venta.detalle_ventas.flatMap((d) => [
        ...d.detalle_venta_lotes.map((l) => l.lote_id),
        ...d.pendientes_stock.flatMap((p) =>
          p.lote_resuelto_id !== null ? [p.lote_resuelto_id] : [],
        ),
      ]);
      await bloquearLotes(tx, idsLotes);
      idsLotes.forEach((l) => lotesBloqueados.add(l));

      const pendientes = await bloquearPendientesDeDetalles(
        tx,
        venta.detalle_ventas
          .filter((d) => d.pendientes_stock.length > 0)
          .map((d) => d.id),
      );
      // Una compra pudo cubrir un pendiente entre la lectura y el lock: si hay
      // un lote nuevo, se bloquea ahora (ver ADR 0001, "pendientes").
      await bloquearLotes(
        tx,
        pendientes.flatMap((p) =>
          p.lote_resuelto_id !== null &&
          !lotesBloqueados.has(p.lote_resuelto_id)
            ? [p.lote_resuelto_id]
            : [],
        ),
      );

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

      // 2b. Deuda de stock: lo no cubierto se cancela; lo cubierto vuelve al
      // lote que lo cubrió.
      await revertirPendientesPorAnulacion(tx, pendientes);

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
    }, TX_OPTIONS);
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
    // Existencia previa (404 rápido); estado y cantidades ya devueltas se
    // leen de nuevo bajo lock dentro de la transacción.
    const existe = await this.prisma.ventas.findUnique({
      where: { id: ventaId },
      select: { id: true },
    });
    if (!existe) {
      throw new NotFoundException(`Venta con ID ${ventaId} no encontrada`);
    }

    // La misma línea dos veces en un request haría que cada ítem se validara
    // contra lo ya devuelto en la BD y la suma superara lo vendido.
    const lineasVistas = new Set<number>();
    for (const item of dto.detalles) {
      if (lineasVistas.has(item.detalle_venta_id)) {
        throw new BadRequestException(
          'Hay una línea de la venta repetida en la devolución. ' +
            'Junta las cantidades en una sola línea e inténtalo de nuevo.',
        );
      }
      lineasVistas.add(item.detalle_venta_id);
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

      // Luego se bloquea la venta (orden turno → venta, igual que anular()).
      // Así dos devoluciones simultáneas, o una devolución y una anulación,
      // se serializan y la segunda ve lo que dejó la primera.
      const [ventaLocked] = await tx.$queryRaw<VentaRow[]>`
        SELECT id, estado
        FROM ventas
        WHERE id = ${ventaId}
        FOR UPDATE
      `;
      if (!ventaLocked) {
        throw new NotFoundException(`Venta con ID ${ventaId} no encontrada`);
      }
      if (ventaLocked.estado !== 'COMPLETADA') {
        throw new BadRequestException(
          'Solo se pueden devolver ventas completadas',
        );
      }

      // Re-lectura bajo lock: líneas, lotes y lo ya devuelto por línea.
      const venta = await tx.ventas.findUniqueOrThrow({
        where: { id: ventaId },
        include: {
          detalle_ventas: {
            include: {
              detalle_venta_lotes: true,
              detalle_devoluciones: true,
              pendientes_stock: true,
            },
          },
        },
      });

      // Pendientes que se tocan: los de líneas con destino REINGRESO. Orden
      // global de locks: lotes → pendientes (ver ADR 0001).
      const lineasReingreso = new Set(
        dto.detalles
          .filter((i) => i.destino === 'REINGRESO')
          .map((i) => i.detalle_venta_id),
      );
      const detallesConPendientes = venta.detalle_ventas.filter(
        (d) => lineasReingreso.has(d.id) && d.pendientes_stock.length > 0,
      );
      const pendientesPorLinea = new Map<
        number,
        Awaited<ReturnType<typeof bloquearPendientesDeDetalles>>
      >();
      if (detallesConPendientes.length > 0) {
        const idsLotes = detallesConPendientes.flatMap((d) => [
          ...d.detalle_venta_lotes.map((l) => l.lote_id),
          ...d.pendientes_stock.flatMap((p) =>
            p.lote_resuelto_id !== null ? [p.lote_resuelto_id] : [],
          ),
        ]);
        await bloquearLotes(tx, idsLotes);
        const bloqueados = await bloquearPendientesDeDetalles(
          tx,
          detallesConPendientes.map((d) => d.id),
        );
        // Lotes que cubrieron pendientes después de la lectura (compra nueva).
        const conocidos = new Set(idsLotes);
        await bloquearLotes(
          tx,
          bloqueados.flatMap((p) =>
            p.lote_resuelto_id !== null && !conocidos.has(p.lote_resuelto_id)
              ? [p.lote_resuelto_id]
              : [],
          ),
        );
        for (const p of bloqueados) {
          const lista = pendientesPorLinea.get(p.detalle_venta_id) ?? [];
          lista.push(p);
          pendientesPorLinea.set(p.detalle_venta_id, lista);
        }
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
        // ¿Con esta devolución la línea queda devuelta por completo?
        const lineaCompleta = cantidadDevolver.equals(disponibleDevolver);

        // Monto a reembolsar: subtotal congelado × proporción, a 2 decimales.
        // Si la línea queda completa se reembolsa EXACTAMENTE el saldo
        // (subtotal − ya reembolsado) para no dejar centavos sueltos.
        const subtotalLinea = new Prisma.Decimal(detalle.subtotal);
        const yaReembolsado = detalle.detalle_devoluciones.reduce(
          (acc, d) => acc.add(d.subtotal_reembolsado),
          new Prisma.Decimal(0),
        );
        const saldoSubtotal = subtotalLinea.sub(yaReembolsado);
        const subtotalReembolsado = lineaCompleta
          ? saldoSubtotal
          : Prisma.Decimal.min(
              redondearDinero(subtotalLinea.mul(proporcion)),
              saldoSubtotal,
            );

        // Costo de la línea completa (a 2 decimales) y su saldo por revertir:
        // costo FIFO congelado de sus lotes + costo estimado de lo que se
        // vendió sin stock registrado (D-01).
        const costoLineaLotes = detalle.detalle_venta_lotes.reduce(
          (acc, dvl) =>
            acc.add(
              new Prisma.Decimal(dvl.cantidad_descargada).mul(
                dvl.costo_aplicado,
              ),
            ),
          new Prisma.Decimal(0),
        );
        const costoLineaPendientes = detalle.pendientes_stock.reduce(
          (acc, p) =>
            acc.add(
              new Prisma.Decimal(p.cantidad_base).mul(
                p.costo_unitario_estimado,
              ),
            ),
          new Prisma.Decimal(0),
        );
        const costoLinea = redondearDinero(
          costoLineaLotes.add(costoLineaPendientes),
        );
        const yaRevertido = detalle.detalle_devoluciones.reduce(
          (acc, d) => acc.add(d.costo_revertido),
          new Prisma.Decimal(0),
        );
        const saldoCosto = costoLinea.sub(yaRevertido);
        const costoRevertido = lineaCompleta
          ? saldoCosto
          : Prisma.Decimal.min(
              redondearDinero(costoLinea.mul(proporcion)),
              saldoCosto,
            );

        // Reversión FIFO: cada lote de la línea recupera (descargado × proporción)
        // a su costo congelado. REINGRESO devuelve el stock; MERMA no.
        for (const dvl of detalle.detalle_venta_lotes) {
          const cantidadLote = new Prisma.Decimal(dvl.cantidad_descargada).mul(
            proporcion,
          );
          if (item.destino === 'REINGRESO') {
            await tx.lotes_inventario.update({
              where: { id: dvl.lote_id },
              data: { cantidad_disponible: { increment: cantidadLote } },
            });
          }
        }

        // Deuda de stock de la línea (solo REINGRESO la toca; MERMA no: la
        // unidad se descartó y la compra igual debe cubrirla). La parte
        // devuelta es proporcional con redondeo ACUMULADO, para que la suma de
        // devoluciones parciales dé exactamente lo que se vendió sin stock.
        if (item.destino === 'REINGRESO') {
          const yaReingresado = detalle.detalle_devoluciones
            .filter((d) => d.destino === 'REINGRESO')
            .reduce((acc, d) => acc.add(d.cantidad), new Prisma.Decimal(0));
          const propAntes = yaReingresado.div(cantidadVendida);
          const propDespues = yaReingresado
            .add(cantidadDevolver)
            .div(cantidadVendida);
          for (const p of pendientesPorLinea.get(detalle.id) ?? []) {
            const base = new Prisma.Decimal(p.cantidad_base);
            const parte = redondearCantidad(base.mul(propDespues)).sub(
              redondearCantidad(base.mul(propAntes)),
            );
            await reingresarPendiente(tx, p, parte);
          }
        }

        detalleRows.push({
          detalle_venta_id: detalle.id,
          cantidad: cantidadDevolver,
          destino: item.destino,
          subtotal_reembolsado: subtotalReembolsado,
          costo_revertido: costoRevertido,
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
    }, TX_OPTIONS);
  }
}
