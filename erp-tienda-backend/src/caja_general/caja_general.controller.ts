import { Controller, Get, Post, Body } from '@nestjs/common';
import { CajaGeneralService } from './caja_general.service';
import { CreateCajaGeneralDto } from './dto/create-caja_general.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Caja General')
@Roles('ADMIN')
@Controller('caja-general')
export class CajaGeneralController {
  constructor(private readonly cajaGeneralService: CajaGeneralService) {}

  @Post()
  @ApiOperation({ summary: 'Registrar un depósito manual en caja general' })
  create(@Body() createDto: CreateCajaGeneralDto) {
    return this.cajaGeneralService.create(createDto);
  }

  @Get('saldo')
  @ApiOperation({ summary: 'Obtener el saldo actual sumando todos los depósitos' })
  getSaldo() {
    return this.cajaGeneralService.getSaldo();
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los movimientos de la caja general' })
  findAll() {
    return this.cajaGeneralService.findAll();
  }
}
