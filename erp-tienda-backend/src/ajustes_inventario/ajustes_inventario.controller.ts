import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { AjustesInventarioService } from './ajustes_inventario.service';
import { CreateAjusteInventarioDto } from './dto/create-ajustes_inventario.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Roles('ADMIN')
@Controller('ajustes-inventario')
export class AjustesInventarioController {
  constructor(
    private readonly ajustesInventarioService: AjustesInventarioService,
  ) {}

  // La cajera registra mermas (con motivo); los conteos los valida el servicio.
  @Post()
  @Roles('ADMIN', 'CAJERO')
  create(
    @Body() createAjusteInventarioDto: CreateAjusteInventarioDto,
    @CurrentUser('userId') userId: number,
    @CurrentUser('rol') rol: string,
  ) {
    return this.ajustesInventarioService.create(
      createAjusteInventarioDto,
      userId,
      rol,
    );
  }

  @Get()
  findAll() {
    return this.ajustesInventarioService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ajustesInventarioService.findOne(id);
  }
}
