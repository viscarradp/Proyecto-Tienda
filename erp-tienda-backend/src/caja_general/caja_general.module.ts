import { Module } from '@nestjs/common';
import { CajaGeneralService } from './caja_general.service';
import { CajaGeneralController } from './caja_general.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CajaGeneralController],
  providers: [CajaGeneralService],
  exports: [CajaGeneralService],
})
export class CajaGeneralModule {}
