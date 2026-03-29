import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePresentacionDto } from './dto/create-presentacion.dto';
import { UpdatePresentacionDto } from './dto/update-presentacion.dto';

@Injectable()
export class PresentacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPresentacionDto: CreatePresentacionDto) {
    try {
      return await this.prisma.presentaciones.create({
        data: createPresentacionDto,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findAll() {
    return this.prisma.presentaciones.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number) {
    const presentacion = await this.prisma.presentaciones.findUnique({
      where: { id },
    });

    if (!presentacion) {
      throw new NotFoundException(`Presentación con ID ${id} no encontrada`);
    }

    return presentacion;
  }

  async update(id: number, updatePresentacionDto: UpdatePresentacionDto) {
    try {
      await this.findOne(id);
      return await this.prisma.presentaciones.update({
        where: { id },
        data: updatePresentacionDto,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: number) {
    try {
      await this.findOne(id);
      return await this.prisma.presentaciones.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'No se puede eliminar la presentación porque tiene registros asociados',
        );
      }
      throw error;
    }
  }

  private handlePrismaError(error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('El código de barras ya existe');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('El producto especificado no existe');
      }
    }
    throw error;
  }
}
