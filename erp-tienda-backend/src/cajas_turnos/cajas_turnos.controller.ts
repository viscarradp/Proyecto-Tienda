import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CajasTurnosService } from './cajas_turnos.service';
import { CreateCajaTurnoDto } from './dto/create-caja_turno.dto';
import { CloseCajaTurnoDto } from './dto/close-caja_turno.dto';
import { QueryCajasTurnosDto } from './dto/query-cajas_turnos.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Control de Caja (Turnos)')
@Roles('ADMIN', 'CAJERO')
@Controller('cajas-turnos')
export class CajasTurnosController {
  constructor(private readonly cajasTurnosService: CajasTurnosService) {}

  @Post('abrir')
  @ApiOperation({ summary: 'Abrir un nuevo turno de caja' })
  @ApiResponse({ status: 201, description: 'Turno abierto exitosamente.' })
  @ApiResponse({ status: 409, description: 'Ya existe un turno abierto.' })
  abrir(
    @Body() createCajaTurnoDto: CreateCajaTurnoDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.cajasTurnosService.abrir(createCajaTurnoDto, userId);
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
    @CurrentUser('userId') userId: number,
  ) {
    return this.cajasTurnosService.cerrar(id, closeCajaTurnoDto, userId);
  }

  @Patch(':id/cerrar-forzado')
  @Roles('ADMIN')
  @ApiOperation({
    summary:
      'Cierre forzado (solo ADMIN) de un turno que la cajera dejó abierto; exige justificación',
  })
  cerrarForzado(
    @Param('id', ParseIntPipe) id: number,
    @Body() closeCajaTurnoDto: CloseCajaTurnoDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.cajasTurnosService.cerrar(id, closeCajaTurnoDto, userId, true);
  }

  @Get()
  @ApiOperation({
    summary:
      'Historial de turnos paginado (más recientes primero): { items, hay_mas }',
  })
  findAll(@Query() query: QueryCajasTurnosDto) {
    return this.cajasTurnosService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un turno por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.cajasTurnosService.findOne(id);
  }

  @Get(':id/resumen')
  @ApiOperation({
    summary:
      'Obtener resumen total de caja: ventas completadas (sin anuladas), devoluciones del turno, ventas netas, egresos, retiros y capital',
  })
  getResumen(@Param('id', ParseIntPipe) id: number) {
    return this.cajasTurnosService.getResumen(id);
  }
}
