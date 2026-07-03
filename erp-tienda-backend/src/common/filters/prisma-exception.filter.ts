import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Traduce los códigos de error más comunes de Prisma a respuestas HTTP
 * claras. Sin este filtro, un P2002 (valor único duplicado) sin manejar
 * localmente en el servicio llega al cliente como un 500 genérico (ver
 * docs/decisions/0006-filtro-excepciones-prisma.md).
 *
 * Si un servicio ya maneja el error localmente (try/catch propio, como
 * categorias.service.ts), ese manejo ocurre primero y este filtro nunca
 * se activa para ese caso — es una red de seguridad, no un reemplazo.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = this.mapToHttpException(exception);
    super.catch(mapped ?? exception, host);
  }

  private mapToHttpException(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': {
        const target = Array.isArray(exception.meta?.target)
          ? (exception.meta.target as string[]).join(', ')
          : undefined;
        return new ConflictException(
          `Ya existe un registro con ese valor${target ? ` (${target})` : ''}`,
        );
      }
      case 'P2003':
        return new BadRequestException(
          'La operación viola una relación con otro registro existente',
        );
      case 'P2025':
        return new NotFoundException('El registro solicitado no existe');
      default:
        // Código de Prisma no mapeado explícitamente: se delega al manejo
        // por defecto de Nest (500 genérico, sin exponer detalles internos).
        return null;
    }
  }
}
