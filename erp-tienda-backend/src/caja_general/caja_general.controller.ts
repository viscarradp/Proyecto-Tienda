import { Controller, Get, Post, Body } from '@nestjs/common';
import { CajaGeneralService } from './caja_general.service';
import { CreateCajaGeneralDto } from './dto/create-caja_general.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Caja General')
@Controller('caja-general')
export class CajaGeneralController {
  constructor(private readonly cajaGeneralService: CajaGeneralService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registrar un depósito manual en caja general' })
  create(@Body() createDto: CreateCajaGeneralDto) {
    return this.cajaGeneralService.create(createDto);
  }

  @Post('inyeccion')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Inyectar capital del dueño directamente a la caja general',
  })
  inyectarCapital(@Body() body: { monto: number; descripcion?: string }) {
    return this.cajaGeneralService.inyectarCapital(
      body.monto,
      body.descripcion,
    );
  }

  @Get('saldo')
  @Roles('ADMIN', 'CAJERO', 'VENDEDOR')
  @ApiOperation({
    summary: 'Obtener el saldo actual sumando todos los depósitos',
  })
  getSaldo() {
    return this.cajaGeneralService.getSaldo();
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Listar todos los movimientos de la caja general' })
  findAll() {
    return this.cajaGeneralService.findAll();
  }
}
