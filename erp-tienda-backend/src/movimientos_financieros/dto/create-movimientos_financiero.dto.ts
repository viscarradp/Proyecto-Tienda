import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsIn,
  Min,
  IsOptional,
  IsInt,
} from 'class-validator';

export class CreateMovimientosFinancieroDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['INGRESO_CAPITAL', 'RETIRO_BOVEDA', 'EGRESO_OPERATIVO'])
  tipo_movimiento: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(0.01)
  monto: number;

  @IsString()
  @IsNotEmpty()
  descripcion: string;

  @IsOptional()
  @IsInt()
  categoria_gasto_id?: number;
}
