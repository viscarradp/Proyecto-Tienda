import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CuentasPorPagarService } from './cuentas_por_pagar.service';
import { CreateAbonoDto } from './dto/create-abono.dto';

@ApiTags('cuentas-por-pagar')
@Roles('ADMIN')
@Controller('cuentas-por-pagar')
export class CuentasPorPagarController {
  constructor(private readonly service: CuentasPorPagarService) {}

  @Get()
  @ApiOperation({
    summary:
      'Deudas con proveedores (estado=pendientes|todas), lo más viejo primero',
  })
  findAll(@Query('estado') estado?: string) {
    return this.service.findAll(estado);
  }

  @Post(':id/abonos')
  @ApiOperation({ summary: 'Paga o abona una deuda con un proveedor' })
  abonar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAbonoDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.service.abonar(id, dto, userId);
  }
}
