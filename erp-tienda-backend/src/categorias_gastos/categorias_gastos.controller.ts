import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { CategoriasGastosService } from './categorias_gastos.service';
import { CreateCategoriasGastoDto } from './dto/create-categorias_gasto.dto';
import { UpdateCategoriasGastoDto } from './dto/update-categorias_gasto.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Roles('ADMIN')
@Controller('categorias-gastos')
export class CategoriasGastosController {
  constructor(
    private readonly categoriasGastosService: CategoriasGastosService,
  ) {}

  @Post()
  create(@Body() createCategoriasGastoDto: CreateCategoriasGastoDto) {
    return this.categoriasGastosService.create(createCategoriasGastoDto);
  }

  @Get()
  findAll() {
    return this.categoriasGastosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categoriasGastosService.findOne(+id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCategoriasGastoDto: UpdateCategoriasGastoDto,
  ) {
    return this.categoriasGastosService.update(+id, updateCategoriasGastoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriasGastosService.remove(+id);
  }
}
