import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CajasTurnosService } from './cajas_turnos.service';
import { CreateCajaTurnoDto } from './dto/create-caja_turno.dto';
import { CloseCajaTurnoDto } from './dto/close-caja_turno.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Control de Caja (Turnos)')
@Roles('ADMIN', 'CAJERO')
@Controller('cajas-turnos')
export class CajasTurnosController {
  constructor(private readonly cajasTurnosService: CajasTurnosService) {}

  @Post('abrir')
  @ApiOperation({ summary: 'Abrir un nuevo turno de caja' })
  @ApiResponse({ status: 201, description: 'Turno abierto exitosamente.' })
  @ApiResponse({ status: 409, description: 'Ya existe un turno abierto.' })
  abrir(@Body() createCajaTurnoDto: CreateCajaTurnoDto) {
    return this.cajasTurnosService.abrir(createCajaTurnoDto);
  }

  @Get('activa')
  @ApiOperation({ summary: 'Obtener el turno de caja abierto actualmente' })
  @ApiResponse({ status: 200, description: 'Turno activo encontrado.' })
  @ApiResponse({ status: 404, description: 'No hay turnos abiertos.' })
  getActiva() {
    return this.cajasTurnosService.getActiva();
  }

  @Get('ultimo-cierre')
  @ApiOperation({ summary: 'Obtener información del último turno cerrado' })
  getUltimoCierre() {
    return this.cajasTurnosService.getUltimoCierre();
  }

  @Patch(':id/cerrar')
  @ApiOperation({ summary: 'Cerrar un turno de caja' })
  @ApiResponse({
    status: 200,
    description: 'Turno cerrado y descuadre calculado.',
  })
  @ApiResponse({ status: 404, description: 'Turno no encontrado.' })
  @ApiResponse({ status: 409, description: 'El turno ya estaba cerrado.' })
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @Body() closeCajaTurnoDto: CloseCajaTurnoDto,
  ) {
    return this.cajasTurnosService.cerrar(id, closeCajaTurnoDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar historial de todos los turnos' })
  findAll() {
    return this.cajasTurnosService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un turno por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cajasTurnosService.findOne(id);
  }

  @Get(':id/resumen')
  @ApiOperation({ summary: 'Obtener resumen total de caja (ventas, egresos, retiros y capital)' })
  getResumen(@Param('id', ParseIntPipe) id: number) {
    return this.cajasTurnosService.getResumen(id);
  }
}
