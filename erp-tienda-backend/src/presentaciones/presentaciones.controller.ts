import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PresentacionesService } from './presentaciones.service';
import { CreatePresentacionDto } from './dto/create-presentacion.dto';
import { UpdatePresentacionDto } from './dto/update-presentacion.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Presentaciones')
@Roles('ADMIN', 'CAJERO')
@Controller('presentaciones')
export class PresentacionesController {
  constructor(private readonly presentacionesService: PresentacionesService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear una nueva presentación' })
  @ApiResponse({
    status: 201,
    description: 'La presentación ha sido creada exitosamente.',
  })
  @ApiResponse({
    status: 400,
    description:
      'El producto especificado no existe o los datos son inválidos.',
  })
  @ApiResponse({ status: 409, description: 'El código de barras ya existe.' })
  create(@Body() createPresentacionDto: CreatePresentacionDto) {
    return this.presentacionesService.create(createPresentacionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todas las presentaciones' })
  findAll() {
    return this.presentacionesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una presentación por ID' })
  @ApiResponse({ status: 200, description: 'Presentación encontrada.' })
  @ApiResponse({ status: 404, description: 'Presentación no encontrada.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.presentacionesService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Actualizar una presentación por ID' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePresentacionDto: UpdatePresentacionDto,
  ) {
    return this.presentacionesService.update(id, updatePresentacionDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar una presentación por ID' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.presentacionesService.remove(id);
  }
}
