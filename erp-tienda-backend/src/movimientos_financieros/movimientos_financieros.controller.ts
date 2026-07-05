import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { MovimientosFinancierosService } from './movimientos_financieros.service';
import { CreateMovimientosFinancieroDto } from './dto/create-movimientos_financiero.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Roles('ADMIN', 'CAJERO', 'VENDEDOR')
@Controller('movimientos-financieros')
export class MovimientosFinancierosController {
  constructor(
    private readonly movimientosFinancierosService: MovimientosFinancierosService,
  ) {}

  @Post()
  create(
    @Body() createMovimientosFinancieroDto: CreateMovimientosFinancieroDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.movimientosFinancierosService.create(
      createMovimientosFinancieroDto,
      userId,
    );
  }

  @Get()
  findAll(
    @Query('tipo_movimiento') tipo_movimiento?: string,
    @Query('limit') limit?: string,
  ) {
    return this.movimientosFinancierosService.findAll(
      tipo_movimiento,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.movimientosFinancierosService.findOne(+id);
  }
}
