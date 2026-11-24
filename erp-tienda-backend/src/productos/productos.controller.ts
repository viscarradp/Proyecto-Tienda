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
import { ProductosService } from './productos.service';
import { CreateProductoDto } from './dto/create-producto.dto';
import { UpdateProductoDto } from './dto/update-producto.dto';
import { CreateProductoRapidoDto } from './dto/create-producto-rapido.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Productos')
@Roles('ADMIN', 'CAJERO')
@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear un nuevo producto' })
  @ApiResponse({
    status: 201,
    description: 'El producto ha sido creado exitosamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Petición inválida o la categoría no existe.',
  })
  create(@Body() createProductoDto: CreateProductoDto) {
    return this.productosService.create(createProductoDto);
  }

  @Post('rapido')
  @Roles('ADMIN', 'CAJERO')
  @ApiOperation({
    summary:
      'Alta rápida (cajera): nombre + precio; queda "por revisar" en la categoría "Por revisar"',
  })
  @ApiResponse({
    status: 201,
    description: 'Producto creado con su presentación.',
  })
  @ApiResponse({ status: 409, description: 'El código de barras ya existe.' })
  createRapido(@Body() dto: CreateProductoRapidoDto) {
    return this.productosService.createRapido(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los productos' })
  findAll() {
    return this.productosService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un producto por ID' })
  @ApiResponse({ status: 200, description: 'Producto encontrado.' })
  @ApiResponse({ status: 404, description: 'Producto no encontrado.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Actualizar un producto por ID' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductoDto: UpdateProductoDto,
  ) {
    return this.productosService.update(id, updateProductoDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar un producto por ID' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productosService.remove(id);
  }
}
