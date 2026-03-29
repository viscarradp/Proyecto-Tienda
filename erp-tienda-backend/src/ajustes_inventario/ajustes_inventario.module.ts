import { Module } from '@nestjs/common';
import { AjustesInventarioService } from './ajustes_inventario.service';
import { AjustesInventarioController } from './ajustes_inventario.controller';

@Module({
  controllers: [AjustesInventarioController],
  providers: [AjustesInventarioService],
})
export class AjustesInventarioModule {}
