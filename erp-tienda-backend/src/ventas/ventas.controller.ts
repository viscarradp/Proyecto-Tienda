import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Headers,
  BadRequestException,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { VentasService } from './ventas.service';
import { QueryVentasDto } from './dto/query-ventas.dto';
import { CreateVentaDto } from './dto/create-venta.dto';
import { CreateDevolucionDto } from './dto/create-devolucion.dto';
import { AnularVentaDto } from './dto/anular-venta.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/** Largo permitido del header Idempotency-Key (p. ej. un UUID mide 36). */
const CLAVE_MIN = 8;
const CLAVE_MAX = 64;

@Roles('ADMIN', 'CAJERO')
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  create(
    @Body() createVentaDto: CreateVentaDto,
    @CurrentUser('userId') userId: number,
    // Opcional. Con la misma clave, un reintento devuelve la venta ya creada.
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (
      idempotencyKey !== undefined &&
      (idempotencyKey.length < CLAVE_MIN || idempotencyKey.length > CLAVE_MAX)
    ) {
      throw new BadRequestException(
        `El encabezado Idempotency-Key debe tener entre ${CLAVE_MIN} y ${CLAVE_MAX} caracteres`,
      );
    }
    return this.ventasService.create(createVentaDto, userId, idempotencyKey);
  }

  @Get()
  findAll(@Query() query: QueryVentasDto) {
    return this.ventasService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ventasService.findOne(id);
  }

  @Patch(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() anularVentaDto: AnularVentaDto,
  ) {
    return this.ventasService.anular(id, anularVentaDto.justificacion_nula);
  }

  @Post(':id/devolucion')
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @Body() createDevolucionDto: CreateDevolucionDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.ventasService.devolver(id, createDevolucionDto, userId);
  }
}
