import { IsString, MaxLength, IsIn, IsNotEmpty } from 'class-validator';

export class CreateCategoriasGastoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['FIJO', 'VARIABLE'])
  tipo: string;
}
