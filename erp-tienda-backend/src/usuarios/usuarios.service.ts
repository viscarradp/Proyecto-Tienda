import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsuariosService implements OnModuleInit {
  private readonly saltRounds = 10;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.usuarios.count();
    if (count === 0) {
      const password_hash = await bcrypt.hash('admin123', this.saltRounds);
      await this.prisma.usuarios.create({
        data: {
          nombre: 'admin',
          rol: 'ADMIN',
          password_hash,
        },
      });
      console.log('--- SEEDING: Usuario administrador por defecto creado (admin/admin123) ---');
    }
  }

  async create(createUsuarioDto: CreateUsuarioDto) {
    const { password, ...userData } = createUsuarioDto;

    // Encriptar el password usando bcrypt.hash
    const password_hash = await bcrypt.hash(password, this.saltRounds);

    const usuario = await this.prisma.usuarios.create({
      data: {
        nombre: userData.nombre,
        rol: userData.rol,
        password_hash,
      },
    });

    // Excluir password_hash antes de retornar
    return this.excludePasswordHash(usuario);
  }

  async findAll() {
    const usuarios = await this.prisma.usuarios.findMany({
      orderBy: { created_at: 'desc' },
    });

    return usuarios.map((u) => this.excludePasswordHash(u));
  }

  async findOne(id: number) {
    const usuario = await this.prisma.usuarios.findUnique({
      where: { id },
    });

    if (!usuario) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }

    return this.excludePasswordHash(usuario);
  }

  // Método interno para autenticación que SÍ devuelve el password_hash
  async findByNombreInternal(nombre: string) {
    return this.prisma.usuarios.findUnique({
      where: { nombre },
    });
  }

  async update(id: number, updateUsuarioDto: UpdateUsuarioDto) {
    const { password, ...userData } = updateUsuarioDto;

    // Preparar objeto de actualización con tipos parciales
    const updateData: {
      nombre?: string;
      rol?: string;
      password_hash?: string;
    } = {
      ...userData,
      rol: userData.rol as 'ADMIN' | 'CAJERO' | undefined,
    };

    if (password) {
      // Encriptar el nuevo password si viene en el request
      updateData.password_hash = await bcrypt.hash(password, this.saltRounds);
    }

    try {
      const usuario = await this.prisma.usuarios.update({
        where: { id },
        data: updateData,
      });

      return this.excludePasswordHash(usuario);
    } catch {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
  }

  async remove(id: number) {
    try {
      return await this.prisma.usuarios.delete({
        where: { id },
      });
    } catch {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
  }

  private excludePasswordHash<T extends { password_hash?: string }>(
    usuario: T,
  ): Omit<T, 'password_hash'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...rest } = usuario;
    return rest;
  }
}
