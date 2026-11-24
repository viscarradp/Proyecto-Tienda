import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PresentacionNuevaDto } from './presentacion-nueva.dto';

export class CreateProductoDto {
  @ApiProperty({ description: 'Nombre del producto', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @ApiProperty({ description: 'ID de la categoría a la que pertenece' })
  @IsInt()
  @IsNotEmpty()
  categoria_id: number;

  @ApiPropertyOptional({
    description:
      'Presentaciones del producto. Se crean junto con el producto en una ' +
      'sola transacción: si una falla, no se crea nada.',
    type: [PresentacionNuevaDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'Máximo 20 presentaciones por producto' })
  @ValidateNested({ each: true })
  @Type(() => PresentacionNuevaDto)
  presentaciones?: PresentacionNuevaDto[];
}
