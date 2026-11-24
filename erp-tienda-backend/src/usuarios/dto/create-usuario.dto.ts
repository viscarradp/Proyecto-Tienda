import {
  IsString,
  IsNotEmpty,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateUsuarioDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'El nombre no puede pasar de 100 caracteres' })
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['ADMIN', 'CAJERO'])
  rol: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password: string;
}
