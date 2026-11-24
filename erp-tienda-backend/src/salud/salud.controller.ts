import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health check para el proveedor de despliegue y monitores externos.
 * Público y sin datos sensibles: solo confirma que el proceso y la BD
 * responden. Exento del throttler para que las sondas no reciban 429.
 */
@Controller('salud')
export class SaludController {
  private readonly logger = new Logger(SaludController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async salud() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { estado: 'ok' };
    } catch (err) {
      this.logger.error(
        `Health check: la BD no responde (${err instanceof Error ? err.message : String(err)})`,
      );
      throw new ServiceUnavailableException({ estado: 'error' });
    }
  }
}
