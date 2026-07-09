import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  BadRequestException,
} from '@nestjs/common';
import { VentasService } from './ventas.service';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Roles('ADMIN', 'CAJERO')
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  create(
    @Body() createVentaDto: CreateVentaDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.ventasService.create(createVentaDto, userId);
  }

  @Get()
  findAll() {
    return this.ventasService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ventasService.findOne(+id);
  }

  @Patch(':id/anular')
  anular(
    @Param('id') id: string,
    @Body('justificacion_nula') justificacion_nula: string,
  ) {
    if (!justificacion_nula) {
      throw new BadRequestException('Debe proporcionar una justificación');
    }
    return this.ventasService.anular(+id, justificacion_nula);
  }

  @Post(':id/devolucion')
  devolver(
    @Param('id') id: string,
    @Body() createDevolucionDto: CreateDevolucionDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.ventasService.devolver(+id, createDevolucionDto, userId);
  }
}
