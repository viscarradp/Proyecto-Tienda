import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { AjustesInventarioService } from './ajustes_inventario.service';
import { CreateAjusteInventarioDto } from './dto/create-ajustes_inventario.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AnularDto } from '../common/anular.dto';

@Roles('ADMIN')
@Controller('ajustes-inventario')
export class AjustesInventarioController {
  constructor(
    private readonly ajustesInventarioService: AjustesInventarioService,
  ) {}

  // La cajera registra mermas (con motivo); los conteos los valida el servicio.
  @Post()
  @Roles('ADMIN', 'CAJERO')
  create(
    @Body() createAjusteInventarioDto: CreateAjusteInventarioDto,
    @CurrentUser('userId') userId: number,
    @CurrentUser('rol') rol: string,
  ) {
    return this.ajustesInventarioService.create(
      createAjusteInventarioDto,
      userId,
      rol,
    );
  }

  // Anular una merma (ADR 0012): solo la dueña, siempre con motivo.
  @Patch(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnularDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.ajustesInventarioService.anular(id, dto.motivo, userId);
  }

  @Get()
  findAll() {
    return this.ajustesInventarioService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ajustesInventarioService.findOne(id);
  }
}
