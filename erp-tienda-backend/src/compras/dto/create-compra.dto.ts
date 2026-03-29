import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
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

  @ApiProperty({ description: 'Monto total de la compra', minimum: 0 })
  @IsNumber()
  @Min(0)
  monto_total: number;

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
  @ValidateNested({ each: true })
  @Type(() => CreateLoteDto)
  detalles_lotes: CreateLoteDto[];
}
