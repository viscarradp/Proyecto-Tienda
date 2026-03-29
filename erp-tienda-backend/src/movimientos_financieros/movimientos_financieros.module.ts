import { Module } from '@nestjs/common';
import { MovimientosFinancierosService } from './movimientos_financieros.service';
import { MovimientosFinancierosController } from './movimientos_financieros.controller';

@Module({
  controllers: [MovimientosFinancierosController],
  providers: [MovimientosFinancierosService],
})
export class MovimientosFinancierosModule {}
