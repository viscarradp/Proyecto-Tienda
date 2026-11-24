import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { CreateProductoRapidoDto } from './dto/create-producto-rapido.dto';

/** Categoría donde caen los productos dados de alta a las prisas. */
export const CATEGORIA_POR_REVISAR = 'Por revisar';

@Injectable()
export class ProductosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductoDto: CreateProductoDto) {
    try {
      return await this.prisma.productos.create({
        data: createProductoDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new BadRequestException('La categoría especificada no existe');
        }
      }
      throw error;
    }
  }

  /**
   * Alta rápida (D-02): la cajera da de alta lo que no está en el catálogo con
   * solo nombre + precio. Crea el producto en la categoría "Por revisar" (si no
   * existe, la crea) con una presentación "Unidad" y lo marca por_revisar.
   */
  async createRapido(dto: CreateProductoRapidoDto) {
    const codigo = dto.codigo_barras ?? null;
    if (codigo) await this.validarCodigoLibre(codigo);

    try {
      const categoria = await this.prisma.categorias.upsert({
        where: { nombre: CATEGORIA_POR_REVISAR },
        update: {},
        create: { nombre: CATEGORIA_POR_REVISAR },
      });
      return await this.prisma.productos.create({
        data: {
          nombre: dto.nombre,
          categoria_id: categoria.id,
          por_revisar: true,
          presentaciones: {
            create: {
              descripcion: 'Unidad',
              factor_conversion: 1,
              precio_venta: dto.precio_venta,
              codigo_barras: codigo,
            },
          },
        },
        include: { categorias: true, presentaciones: true },
      });
    } catch (error) {
      // Otra cajera dio de alta el mismo código justo ahora.
      if (
        codigo &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        await this.validarCodigoLibre(codigo);
      }
      throw error;
    }
  }

  private async validarCodigoLibre(codigo: string) {
    const existente = await this.prisma.presentaciones.findUnique({
      where: { codigo_barras: codigo },
      include: { productos: { select: { nombre: true } } },
    });
    if (existente) {
      throw new ConflictException(
        `Ese código de barras ya es de «${existente.productos.nombre}»`,
      );
    }
  }

  async findAll() {
    const productos = await this.prisma.productos.findMany({
      include: {
        categorias: true,
        presentaciones: true,
        // Solo los lotes con stock: la historia de lotes agotados crece sin fin
        // y la pantalla de Inventario no la necesita.
        lotes_inventario: {
          where: { cantidad_disponible: { gt: 0 } },
          select: {
            id: true,
            cantidad_inicial: true,
            cantidad_disponible: true,
            costo_unitario_adquisicion: true,
            fecha_vencimiento: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    // Deuda de stock abierta por producto (D-01), en unidades base.
    const pendientes = await this.prisma.pendientes_stock.groupBy({
      by: ['producto_id'],
      where: { resuelto_en: null, cantidad_pendiente: { gt: 0 } },
      _sum: { cantidad_pendiente: true },
    });
    const pendientePorProducto = new Map(
      pendientes.map((p) => [
        p.producto_id,
        p._sum.cantidad_pendiente ?? new Prisma.Decimal(0),
      ]),
    );

    return productos.map((p) => ({
      ...p,
      stock_total: p.lotes_inventario.reduce(
        (acc, l) => acc.add(l.cantidad_disponible),
        new Prisma.Decimal(0),
      ),
      pendiente_total: pendientePorProducto.get(p.id) ?? new Prisma.Decimal(0),
    }));
  }

  async findOne(id: number) {
    const producto = await this.prisma.productos.findUnique({
      where: { id },
      include: {
        categorias: true,
        presentaciones: true,
      },
    });

    if (!producto) {
      throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    }

    return producto;
  }

  async update(id: number, updateProductoDto: UpdateProductoDto) {
    try {
      await this.findOne(id); // Validar existencia antes de actualizar
      return await this.prisma.productos.update({
        where: { id },
        data: updateProductoDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2003') {
          throw new BadRequestException('La categoría especificada no existe');
        }
      }
      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id); // Validar existencia antes de eliminar
    return this.prisma.productos.delete({
      where: { id },
    });
  }
}
