import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePresentacionDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsInt()
  @IsNotEmpty()
  producto_id: number;

  @ApiPropertyOptional({ description: 'Código de barras', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigo_barras?: string;

  @ApiProperty({
    description: 'Descripción de la presentación (ej. Fardo de 12)',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  descripcion: string;

  @ApiProperty({
    description: 'Factor de conversión (no puede ser 0 ni negativo)',
    minimum: 1,
  })
  @IsInt()
  @Min(1, { message: 'El factor de conversión debe ser al menos 1' })
  @IsNotEmpty()
  factor_conversion: number;

  @ApiProperty({ description: 'Precio de venta', minimum: 0 })
  @IsNumber()
  @Min(0, { message: 'El precio de venta no puede ser negativo' })
  @IsNotEmpty()
  precio_venta: number;
}
