import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsInt,
  MaxLength,
} from 'class-validator';
import { IsDinero } from '../../common/validacion';

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

  @IsDinero({ min: 0.01, mensajeMin: 'El monto debe ser mayor a 0' })
  @IsNotEmpty()
  monto: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500, {
    message: 'La descripción no puede pasar de 500 caracteres',
  })
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
