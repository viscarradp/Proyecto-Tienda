import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCategoriasGastoDto } from './dto/create-categorias_gasto.dto';
import { UpdateCategoriasGastoDto } from './dto/update-categorias_gasto.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CategoriasGastosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCategoriasGastoDto: CreateCategoriasGastoDto) {
    try {
      return await this.prisma.categorias_gastos.create({
        data: createCategoriasGastoDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Ya existe una categoría con ese nombre');
        }
      }
      throw error;
    }
  }

  findAll() {
    return this.prisma.categorias_gastos.findMany({
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: number) {
    const categoria = await this.prisma.categorias_gastos.findUnique({
      where: { id },
    });
    if (!categoria) {
      throw new NotFoundException(
        `Categoría de gasto con ID ${id} no encontrada`,
      );
    }
    return categoria;
  }

  async update(id: number, updateCategoriasGastoDto: UpdateCategoriasGastoDto) {
    try {
      return await this.prisma.categorias_gastos.update({
        where: { id },
        data: updateCategoriasGastoDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Ya existe una categoría con ese nombre');
        }
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Categoría de gasto con ID ${id} no encontrada`,
          );
        }
      }
      throw error;
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.categorias_gastos.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(
            `Categoría de gasto con ID ${id} no encontrada`,
          );
        }
      }
      throw error;
    }
  }
}
