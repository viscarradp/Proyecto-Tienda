import { Module } from '@nestjs/common';
import { CajasTurnosService } from './cajas_turnos.service';
import { CajasTurnosController } from './cajas_turnos.controller';

@Module({
  providers: [CajasTurnosService],
  controllers: [CajasTurnosController],
})
export class CajasTurnosModule {}
