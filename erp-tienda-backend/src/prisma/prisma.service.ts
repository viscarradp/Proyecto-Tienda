import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { opcionesPool } from '../common/pool-config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static readonly logger = new Logger('PrismaService');

  constructor() {
    const pool = new Pool(opcionesPool());
    // Sin este manejador, un error en una conexión ociosa (la BD o el pooler
    // la cierran) es una excepción no capturada y tumba el proceso. Se
    // registra; el pool descarta ese cliente y abre otro cuando haga falta.
    pool.on('error', (err) => {
      PrismaService.logger.error(
        `Error en una conexión ociosa del pool: ${err.message}`,
      );
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const adapter = new PrismaPg(pool as any);
    super({ adapter, log: ['error'] });
  }

  async onModuleInit() {
    await this.$connect();
    PrismaService.logger.log('Conectado a la base de datos.');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
