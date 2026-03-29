import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { AjustesInventarioService } from './ajustes_inventario.service';
import { CreateAjusteInventarioDto } from './dto/create-ajustes_inventario.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Roles('ADMIN')
@Controller('ajustes-inventario')
export class AjustesInventarioController {
  constructor(
    private readonly ajustesInventarioService: AjustesInventarioService,
  ) {}

  @Post()
  create(@Body() createAjusteInventarioDto: CreateAjusteInventarioDto) {
    return this.ajustesInventarioService.create(createAjusteInventarioDto);
  }

  @Get()
  findAll() {
    return this.ajustesInventarioService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ajustesInventarioService.findOne(+id);
  }
}
