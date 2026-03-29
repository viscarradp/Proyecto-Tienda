import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';

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

  async findAll() {
    return this.prisma.productos.findMany({
      include: {
        categorias: true,
        presentaciones: true,
        lotes_inventario: {
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
