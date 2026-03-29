import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
