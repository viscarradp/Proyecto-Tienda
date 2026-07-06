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
  @IsIn([
    'INGRESO_CAPITAL',
    'RETIRO_BOVEDA',
    'EGRESO_OPERATIVO',
    'RETIRO_PERSONAL',
  ])
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

  // De qué cuenta de efectivo sale un egreso: GAVETA (default, exige turno) o
  // BOVEDA (no exige turno, valida saldo derivado). Bloque 1 §5.6.
  @IsOptional()
  @IsString()
  @IsIn(['GAVETA', 'BOVEDA'])
  origen_fondos?: string;
}
