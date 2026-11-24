import { Module } from '@nestjs/common';
import { CuentasPorPagarController } from './cuentas_por_pagar.controller';
import { CuentasPorPagarService } from './cuentas_por_pagar.service';

@Module({
  providers: [CuentasPorPagarService],
  controllers: [CuentasPorPagarController],
})
export class CuentasPorPagarModule {}
