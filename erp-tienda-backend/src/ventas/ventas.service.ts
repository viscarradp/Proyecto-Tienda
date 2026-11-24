import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { QueryVentasDto } from './dto/query-ventas.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CajaTurnoRow, LoteInventarioRow } from '../common/concurrency';
import { TX_OPTIONS } from '../common/transaccion';
import { redondearDinero } from '../common/redondeo';

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

/** Cantidad legible: hasta 3 decimales, redondeo hacia abajo, sin ceros sobrantes. */
function cantidadLegible(valor: Prisma.Decimal.Value): string {
  return new Prisma.Decimal(valor)
    .toDecimalPlaces(3, Prisma.Decimal.ROUND_DOWN)
    .toString();
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

  private buscarPorClave(
    db: Prisma.TransactionClient | PrismaService,
    clave: string,
  ) {
    return db.ventas.findUnique({
      where: { clave_idempotencia: clave },
      include: VENTA_INCLUDE,
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
        const cantidadItem = new Prisma.Decimal(item.cantidad);

        // unidades_base_requeridas = cantidad * factor_conversion
        const unidades_base_totales = cantidadItem.mul(
          presentacion.factor_conversion,
        );
        let unidades_base_requeridas = unidades_base_totales;

        // subtotal_venta = cantidad * precio_venta, redondeado a 2 decimales
        // (half-up) ANTES de sumar: el total es la suma de lo guardado.
        const subtotal_venta = redondearDinero(
          cantidadItem.mul(presentacion.precio_venta),
        );
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
        // Bucle FIFO en Decimal: mientras falten unidades base por cubrir
        while (unidades_base_requeridas.greaterThan(0)) {
          // Si no hay más lotes y aún faltan unidades → stock insuficiente
          if (loteIndex >= lotes.length) {
            // Lo que queda, en unidades de ESTA presentación (no unidades base).
            const quedan = unidades_base_totales
              .sub(unidades_base_requeridas)
              .div(presentacion.factor_conversion);
            throw new BadRequestException(
              `No hay suficiente "${presentacion.productos.nombre} (${presentacion.descripcion})": ` +
                `quedan ${cantidadLegible(quedan)} y estás vendiendo ${cantidadLegible(cantidadItem)}.`,
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
        include: VENTA_INCLUDE,
      });

      // 6. Actualizar Cajas Turnos: Suma el efectivo de la venta al esperado de la caja
      await tx.cajas_turnos.update({
        where: { id: cajaTurno.id },
        data: {
          efectivo_esperado: { increment: total_venta_acumulado },
        },
      });

      return ventaFinal;
    }, TX_OPTIONS);
  }

  /**
   * Listado acotado, más recientes primero (cursor `antes_de`). Con
   * `caja_turno_id` (los turnos que la pantalla tiene a la vista, máx. 50) no
   * se aplica límite por defecto; sin él, el límite por defecto es 50.
   */
  findAll(query: QueryVentasDto = {}) {
    const { caja_turno_id, limit, antes_de } = query;
    const porTurno = !!caja_turno_id?.length;
    return this.prisma.ventas.findMany({
      where: {
        ...(porTurno ? { caja_turno_id: { in: caja_turno_id } } : {}),
        ...(antes_de ? { id: { lt: antes_de } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit ?? (porTurno ? undefined : 50),
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

  async findOne(id: number) {
    const venta = await this.prisma.ventas.findUnique({
      where: { id },
      include: {
        // Misma forma que el listado: la pantalla Movimientos busca por número.
        _count: { select: { devoluciones: true } },
        devoluciones: { select: { total_reembolsado: true } },
        detalle_ventas: {
          include: {
            presentaciones: {
              include: { productos: { select: { nombre: true } } },
            },
            detalle_venta_lotes: true,
          },
        },
      },
    });
    if (!venta) {
      throw new NotFoundException(`No hay una venta con el número ${id}`);
    }
    return venta;
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

      // Lectura de líneas y lotes ya bajo lock.
      const venta = await tx.ventas.findUniqueOrThrow({
        where: { id },
        include: {
          detalle_ventas: {
            include: { detalle_venta_lotes: true },
          },
        },
      });

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
            include: { detalle_venta_lotes: true, detalle_devoluciones: true },
          },
        },
      });

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

        // Costo FIFO de la línea completa (a 2 decimales) y su saldo por revertir.
        const costoLinea = redondearDinero(
          detalle.detalle_venta_lotes.reduce(
            (acc, dvl) =>
              acc.add(
                new Prisma.Decimal(dvl.cantidad_descargada).mul(
                  dvl.costo_aplicado,
                ),
              ),
            new Prisma.Decimal(0),
          ),
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
