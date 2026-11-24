import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { IsCantidad, IsDinero } from '../../common/validacion';

export class CreateLoteDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsInt()
  @IsNotEmpty()
  producto_id: number;

  @ApiProperty({ description: 'Costo unitario de adquisición', minimum: 0 })
  // La columna es Decimal(10,4): un costo unitario admite hasta 4 decimales.
  @IsDinero({ decimales: 4 })
  costo_unitario_adquisicion: number;

  @ApiProperty({ description: 'Cantidad inicial comprada', minimum: 0.001 })
  @IsCantidad()
  cantidad_inicial: number;

  @ApiPropertyOptional({ description: 'Fecha de vencimiento del lote' })
  @IsOptional()
  @IsDateString()
  fecha_vencimiento?: string;
}

export class CreateCompraDto {
  @ApiProperty({ description: 'Nombre del proveedor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150, {
    message: 'El nombre del proveedor no puede pasar de 150 caracteres',
  })
  proveedor: string;

  // monto_total se acepta por compatibilidad con el frontend, pero el backend
  // SIEMPRE lo ignora y recalcula desde los lotes: Σ(cantidad × costo_unitario).
  @ApiPropertyOptional({
    description: 'Ignorado por el backend, se calcula desde los lotes',
  })
  @IsOptional()
  @IsDinero()
  monto_total?: number;

  @ApiProperty({
    enum: ['PAGADO', 'AL_CREDITO'],
    description: 'Estado del pago',
  })
  @IsString()
  @IsIn(['PAGADO', 'AL_CREDITO'])
  estado_pago: string;

  @ApiProperty({
    enum: ['CAJA_POS', 'CAJA_GENERAL', 'CAPITAL_DUEÑOS'],
    description: 'Origen de los fondos',
  })
  @IsString()
  @IsIn(['CAJA_POS', 'CAJA_GENERAL', 'CAPITAL_DUEÑOS'])
  origen_fondos: string;

  @ApiProperty({
    type: [CreateLoteDto],
    description: 'Listado de lotes adquiridos',
  })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'La compra debe incluir al menos un lote de inventario',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateLoteDto)
  detalles_lotes: CreateLoteDto[];
}
