import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDinero, VaciarANull } from '../../common/validacion';

/** Alta rápida de la cajera (L5a · D-02): solo lo mínimo para vender ya. */
export class CreateProductoRapidoDto {
  @ApiProperty({ description: 'Nombre del producto', maxLength: 150 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Escribe el nombre del producto' })
  @IsNotEmpty({ message: 'Escribe el nombre del producto' })
  @MaxLength(150, { message: 'El nombre no puede pasar de 150 caracteres' })
  nombre: string;

  @ApiProperty({ description: 'Precio de venta (mayor que 0)', minimum: 0.01 })
  @IsDinero({ min: 0.01, mensajeMin: 'El precio debe ser mayor que $0' })
  @IsNotEmpty({ message: 'Escribe el precio' })
  precio_venta: number;

  @ApiPropertyOptional({ description: 'Código de barras', maxLength: 50 })
  @IsOptional()
  @VaciarANull()
  @IsString()
  @MaxLength(50, {
    message: 'El código de barras no puede pasar de 50 caracteres',
  })
  codigo_barras?: string | null;
}
