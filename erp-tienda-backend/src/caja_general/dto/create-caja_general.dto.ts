import { IsNumber, IsString, IsNotEmpty, NotEquals, IsOptional, IsInt } from 'class-validator';

export class CreateCajaGeneralDto {
  @IsNumber()
  @NotEquals(0)
  @IsNotEmpty()
  monto: number;

  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsInt()
  movimiento_origen_id?: number;
}
