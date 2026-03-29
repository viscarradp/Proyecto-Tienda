import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ComprasService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCompraDto: CreateCompraDto) {
    const { detalles_lotes, ...compraData } = createCompraDto;

    return await this.prisma.$transaction(async (tx) => {
      // Paso 1: Crear el registro de compra
      const compra = await tx.compras_inventario.create({
        data: {
          proveedor: compraData.proveedor,
          monto_total: compraData.monto_total,
          estado_pago: compraData.estado_pago,
          origen_fondos: compraData.origen_fondos,
        },
      });

      // Paso 2: Crear los lotes de inventario
      for (const lote of detalles_lotes) {
        await tx.lotes_inventario.create({
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
      }

      // Paso 3: Cuentas por Pagar
      if (compraData.estado_pago === 'AL_CREDITO') {
        await tx.cuentas_por_pagar.create({
          data: {
            compra_id: compra.id,
            acreedor: compraData.proveedor,
            monto_deuda: compraData.monto_total,
            saldo_pendiente: compraData.monto_total,
          },
        });
      }

      // Paso 4: Impacto en Caja
      if (compraData.origen_fondos === 'CAJA_POS') {
        const cajaActiva = await tx.cajas_turnos.findFirst({
          where: { estado: 'ABIERTA' },
        });

        if (!cajaActiva) {
          throw new BadRequestException(
            'No hay turno abierto para sacar el dinero de la caja POS',
          );
        }

        await tx.movimientos_financieros.create({
          data: {
            caja_turno_id: cajaActiva.id,
            tipo_movimiento: 'PAGO_PROVEEDOR',
            monto: compraData.monto_total,
            descripcion: `Pago a proveedor ${compraData.proveedor} por compra ID ${compra.id}`,
          },
        });

        // Actualizar el efectivo esperado en la caja (se resta la compra)
        await tx.cajas_turnos.update({
          where: { id: cajaActiva.id },
          data: {
            efectivo_esperado: { decrement: compraData.monto_total },
          },
        });
      } else if (compraData.origen_fondos === 'CAJA_GENERAL') {
        const montoDecimal = new Prisma.Decimal(-compraData.monto_total);
        await tx.caja_general.create({
          data: {
            monto: montoDecimal,
            descripcion: `Pago a proveedor ${compraData.proveedor} de compra ID ${compra.id}`,
          },
        });
      }

      return compra;
    });
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
