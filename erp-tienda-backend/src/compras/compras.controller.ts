import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ComprasService } from './compras.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AnularDto } from '../common/anular.dto';

@ApiTags('compras')
@Roles('ADMIN', 'CAJERO')
@Controller('compras')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Registra una nueva compra y genera lotes de inventario',
  })
  create(
    @Body() createCompraDto: CreateCompraDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.comprasService.create(createCompraDto, userId);
  }

  @Patch(':id/anular')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Anula una compra sin usar (marca, no borra) y revierte su pago',
  })
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.comprasService.anular(id, dto.motivo, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Obtiene el historial de compras' })
  findAll() {
    return this.comprasService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene los detalles de una compra específica' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.comprasService.findOne(id);
  }
}
