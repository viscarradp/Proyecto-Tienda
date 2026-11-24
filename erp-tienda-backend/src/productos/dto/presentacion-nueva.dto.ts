import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  IsDinero,
  MAX_FACTOR_CONVERSION,
  VaciarANull,
} from '../../common/validacion';

/** Presentación que viaja dentro de `POST /productos` (sin `producto_id`). */
export class PresentacionNuevaDto {
  @ApiPropertyOptional({ description: 'Código de barras', maxLength: 50 })
  @IsOptional()
  @VaciarANull()
  @IsString()
  @MaxLength(50, {
    message: 'El código de barras no puede pasar de 50 caracteres',
  })
  codigo_barras?: string | null;

  @ApiProperty({ description: 'Descripción (ej. Unidad, Fardo de 12)' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Falta la descripción de la presentación' })
  @MaxLength(100, {
    message: 'La descripción no puede pasar de 100 caracteres',
  })
  descripcion: string;

  @ApiProperty({ description: 'Factor de conversión', minimum: 0.001 })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001, { message: 'El factor de conversión debe ser mayor a 0' })
  @Max(MAX_FACTOR_CONVERSION, {
    message: `El factor de conversión no puede superar ${MAX_FACTOR_CONVERSION}`,
  })
  factor_conversion: number;

  @ApiProperty({ description: 'Precio de venta', minimum: 0 })
  @IsDinero({ mensajeMin: 'El precio de venta no puede ser negativo' })
  precio_venta: number;
}
