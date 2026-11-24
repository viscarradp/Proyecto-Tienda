import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Max,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IsDinero,
  MAX_FACTOR_CONVERSION,
  VaciarANull,
} from '../../common/validacion';

export class CreatePresentacionDto {
  @ApiProperty({ description: 'ID del producto' })
  @IsInt()
  @IsNotEmpty()
  producto_id: number;

  @ApiPropertyOptional({ description: 'Código de barras', maxLength: 50 })
  // Se recorta; si queda vacío se guarda como null (un '' chocaría con el
  // índice único del código de barras).
  @IsOptional()
  @VaciarANull()
  @IsString()
  @MaxLength(50)
  codigo_barras?: string | null;

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
    minimum: 0.001,
  })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'El factor de conversión debe ser mayor a 0' })
  @Max(MAX_FACTOR_CONVERSION, {
    message: `El factor de conversión no puede superar ${MAX_FACTOR_CONVERSION}`,
  })
  @IsNotEmpty()
  factor_conversion: number;

  @ApiProperty({ description: 'Precio de venta', minimum: 0 })
  @IsDinero({ mensajeMin: 'El precio de venta no puede ser negativo' })
  @IsNotEmpty()
  precio_venta: number;
}
