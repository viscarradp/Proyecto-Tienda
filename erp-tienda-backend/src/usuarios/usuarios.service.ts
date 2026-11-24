import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { PrismaService } from '../prisma/prisma.service';
import { acquireAdvisoryLock } from '../common/concurrency';
import { TX_OPTIONS } from '../common/transaccion';
import * as bcrypt from 'bcrypt';

/** Serializa los cambios que pueden dejar al sistema sin ADMIN activo. */
const ADMINS_LOCK = 'usuarios_admins';

@Injectable()
export class UsuariosService implements OnModuleInit {
  private readonly saltRounds = 10;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.usuarios.count();
    if (count > 0) {
      return;
    }

    // No hay usuarios y las rutas están bloqueadas por defecto (guards
    // globales): sin un admin inicial nadie podría autenticarse. La
    // contraseña viene de env, nunca hardcodeada ni impresa en logs.
    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
    if (!initialPassword) {
      console.warn(
        '--- SEEDING: No hay usuarios registrados y falta la variable de entorno ' +
          'INITIAL_ADMIN_PASSWORD. No se creó ningún usuario administrador. ' +
          'Define INITIAL_ADMIN_PASSWORD y reinicia el servidor para crear el admin inicial. ---',
      );
      return;
    }

    const password_hash = await bcrypt.hash(initialPassword, this.saltRounds);
    await this.prisma.usuarios.create({
      data: {
        nombre: 'admin',
        rol: 'ADMIN',
        password_hash,
      },
    });
    console.log(
      '--- SEEDING: Usuario administrador "admin" creado con la contraseña de INITIAL_ADMIN_PASSWORD. ---',
    );
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

  /**
   * Lo que la autenticación necesita en CADA request: existencia, estado y rol
   * vigentes en la base de datos (no los del token). Nunca incluye el hash.
   */
  async findParaAutenticacion(id: number) {
    return this.prisma.usuarios.findUnique({
      where: { id },
      select: { id: true, nombre: true, rol: true, activo: true },
    });
  }

  async update(id: number, updateUsuarioDto: UpdateUsuarioDto) {
    const { password, ...userData } = updateUsuarioDto;

    const updateData: Prisma.usuariosUpdateInput = {
      nombre: userData.nombre,
      rol: userData.rol,
    };
    if (password) {
      // Encriptar el nuevo password si viene en el request
      updateData.password_hash = await bcrypt.hash(password, this.saltRounds);
    }

    return await this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, ADMINS_LOCK);
      const actual = await this.obtenerOFallar(tx, id);

      // Bajar de ADMIN a CAJERO no puede dejar el sistema sin dueña activa.
      if (
        userData.rol &&
        userData.rol !== 'ADMIN' &&
        actual.rol === 'ADMIN' &&
        actual.activo
      ) {
        await this.exigirOtroAdminActivo(tx, id, 'cambiar el rol de');
      }

      const usuario = await tx.usuarios.update({
        where: { id },
        data: updateData,
      });
      return this.excludePasswordHash(usuario);
    }, TX_OPTIONS);
  }

  /**
   * Desactiva (nunca borra: la autoría del historial se conserva). El usuario
   * deja de poder entrar y su token vigente deja de servir de inmediato.
   */
  async desactivar(id: number, actorId: number) {
    if (id === actorId) {
      throw new BadRequestException('No puedes desactivar tu propio usuario.');
    }
    return await this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, ADMINS_LOCK);
      const actual = await this.obtenerOFallar(tx, id);
      if (actual.rol === 'ADMIN' && actual.activo) {
        await this.exigirOtroAdminActivo(tx, id, 'desactivar a');
      }
      const usuario = await tx.usuarios.update({
        where: { id },
        data: { activo: false },
      });
      return this.excludePasswordHash(usuario);
    }, TX_OPTIONS);
  }

  async reactivar(id: number) {
    await this.findOne(id);
    const usuario = await this.prisma.usuarios.update({
      where: { id },
      data: { activo: true },
    });
    return this.excludePasswordHash(usuario);
  }

  private async obtenerOFallar(tx: Prisma.TransactionClient, id: number) {
    const usuario = await tx.usuarios.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    }
    return usuario;
  }

  private async exigirOtroAdminActivo(
    tx: Prisma.TransactionClient,
    id: number,
    accion: string,
  ) {
    const otros = await tx.usuarios.count({
      where: { rol: 'ADMIN', activo: true, id: { not: id } },
    });
    if (otros === 0) {
      throw new ConflictException(
        `No se puede ${accion} la única administradora activa. Antes, crea o reactiva a otra administradora.`,
      );
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
