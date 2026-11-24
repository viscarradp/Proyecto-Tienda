import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
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
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    if (limit !== undefined && (limit < 1 || limit > 500)) {
      throw new BadRequestException('limit debe ser un entero entre 1 y 500');
    }
    return this.movimientosFinancierosService.findAll(tipo_movimiento, limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.movimientosFinancierosService.findOne(id);
  }
}
