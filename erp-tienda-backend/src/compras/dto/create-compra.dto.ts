import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  IsIn,
} from 'class-validator';

export class CreateLoteDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsInt()
  @IsNotEmpty()
  producto_id: number;

  @ApiProperty({ description: 'Costo unitario de adquisición', minimum: 0 })
  @IsNumber()
  @Min(0)
  costo_unitario_adquisicion: number;

  @ApiProperty({ description: 'Cantidad inicial comprada', minimum: 1 })
  @IsInt()
  @Min(1)
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
  proveedor: string;

  // monto_total se acepta por compatibilidad con el frontend, pero el backend
  // SIEMPRE lo ignora y recalcula desde los lotes: Σ(cantidad × costo_unitario).
  @ApiPropertyOptional({
    description: 'Ignorado por el backend, se calcula desde los lotes',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
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
