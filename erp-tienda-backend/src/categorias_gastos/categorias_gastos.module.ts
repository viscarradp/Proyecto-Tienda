import { Module } from '@nestjs/common';
import { CategoriasGastosService } from './categorias_gastos.service';
import { CategoriasGastosController } from './categorias_gastos.controller';

@Module({
  controllers: [CategoriasGastosController],
  providers: [CategoriasGastosService],
})
export class CategoriasGastosModule {}
