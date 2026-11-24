import {
  BadRequestException,
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { MovimientosFinancierosService } from './movimientos_financieros.service';
import { CreateMovimientosFinancieroDto } from './dto/create-movimientos_financiero.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator';
import { exigirPermisoMovimiento } from '../common/permisos';
import { AnularDto } from '../common/anular.dto';

@Roles('ADMIN', 'CAJERO')
@Controller('movimientos-financieros')
export class MovimientosFinancierosController {
  constructor(
    private readonly movimientosFinancierosService: MovimientosFinancierosService,
  ) {}

  @Post()
  create(
    @Body() createMovimientosFinancieroDto: CreateMovimientosFinancieroDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    exigirPermisoMovimiento(
      user.rol,
      createMovimientosFinancieroDto.tipo_movimiento,
      createMovimientosFinancieroDto.origen_fondos,
    );
    return this.movimientosFinancierosService.create(
      createMovimientosFinancieroDto,
      user.userId,
    );
  }

  @Get()
  findAll(
    @Query('tipo_movimiento') tipo_movimiento?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    if (limit !== undefined && (limit < 1 || limit > 500)) {
      throw new BadRequestException('limit debe ser un entero entre 1 y 500');
    }
    return this.movimientosFinancierosService.findAll(tipo_movimiento, limit);
  }

  // Anular (ADR 0012): solo la dueña, siempre con motivo.
  @Patch(':id/anular')
  @Roles('ADMIN')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.movimientosFinancierosService.anular(
      id,
      dto.motivo,
      user.userId,
    );
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.movimientosFinancierosService.findOne(id);
  }
}
