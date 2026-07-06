import { Controller, Get, Post, Body } from '@nestjs/common';
import { CajaGeneralService } from './caja_general.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Caja General (Bóveda)')
@Controller('caja-general')
export class CajaGeneralController {
  constructor(private readonly cajaGeneralService: CajaGeneralService) {}

  // El POST genérico a /caja-general se eliminó en 1.C (fuga D: puerta trasera
  // de ajuste manual sin asiento). Todo movimiento de bóveda entra por el libro.

  @Post('inyeccion')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Inyectar capital del dueño a la bóveda (DUEÑOS→BOVEDA)',
  })
  inyectarCapital(
    @Body() body: { monto: number; descripcion?: string },
    @CurrentUser('userId') userId: number,
  ) {
    return this.cajaGeneralService.inyectarCapital(
      body.monto,
      body.descripcion,
      userId,
    );
  }

  @Get('saldo')
  @Roles('ADMIN', 'CAJERO', 'VENDEDOR')
  @ApiOperation({ summary: 'Saldo actual de la bóveda (derivado del libro)' })
  getSaldo() {
    return this.cajaGeneralService.getSaldo();
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Libro de bóveda (movimientos que la afectan)' })
  findAll() {
    return this.cajaGeneralService.findAll();
  }
}
