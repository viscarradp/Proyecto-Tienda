import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

export const MENSAJE_SISTEMA_OCUPADO =
  'El sistema está ocupado, intenta de nuevo en unos segundos';
export const MENSAJE_NUMERO_GRANDE = 'Un número es demasiado grande';
export const MENSAJE_TEXTO_LARGO = 'Un texto es demasiado largo';

/**
 * Código SQLSTATE de Postgres que viaja dentro del error del driver (Prisma 7
 * con adaptador de pg lo deja en `meta.driverAdapterError.cause`). Sirve para
 * reconocer deadlocks y desbordes que Prisma reporta con un código genérico
 * (p. ej. P2010 en consultas crudas).
 */
function codigoPostgres(
  exception: Prisma.PrismaClientKnownRequestError,
): string | undefined {
  const meta = exception.meta as
    | {
        code?: unknown;
        driverAdapterError?: { cause?: { originalCode?: unknown } };
      }
    | undefined;
  const codigo = meta?.driverAdapterError?.cause?.originalCode ?? meta?.code;
  return typeof codigo === 'string' ? codigo : undefined;
}

/**
 * Traduce un error conocido de Prisma a una excepción HTTP con un mensaje
 * pensado para la cajera, o `null` si no hay mapeo (se deja el 500 genérico).
 * Ver docs/decisions/0006-filtro-excepciones-prisma.md.
 */
export function mapearErrorPrisma(
  exception: Prisma.PrismaClientKnownRequestError,
): HttpException | null {
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
    // P2028: la transacción superó su timeout o ya estaba cerrada.
    // P2034: conflicto de escritura / deadlock (reintentar suele funcionar).
    case 'P2028':
    case 'P2034':
      return new ServiceUnavailableException(MENSAJE_SISTEMA_OCUPADO);
    // Valor fuera de rango para el tipo de la columna (numeric field overflow).
    case 'P2020':
      return new BadRequestException(MENSAJE_NUMERO_GRANDE);
    // Texto más largo que la columna.
    case 'P2000':
      return new BadRequestException(MENSAJE_TEXTO_LARGO);
    case 'P2010': {
      // Consulta cruda fallida: se decide por el SQLSTATE del driver.
      const pg = codigoPostgres(exception);
      if (pg === '40P01' || pg === '40001') {
        // deadlock_detected / serialization_failure
        return new ServiceUnavailableException(MENSAJE_SISTEMA_OCUPADO);
      }
      if (pg === '22003') {
        // numeric_value_out_of_range
        return new BadRequestException(MENSAJE_NUMERO_GRANDE);
      }
      return null;
    }
    default:
      // Código de Prisma no mapeado explícitamente: se delega al manejo
      // por defecto de Nest (500 genérico, sin exponer detalles internos).
      return null;
  }
}

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
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const mapped = mapearErrorPrisma(exception);
    if (mapped?.getStatus() === 503) {
      // El usuario ve un mensaje amable; el detalle técnico queda en el log.
      this.logger.warn(
        `Prisma ${exception.code} → 503: ${exception.message.split('\n').pop()}`,
      );
    }
    super.catch(mapped ?? exception, host);
  }
}
