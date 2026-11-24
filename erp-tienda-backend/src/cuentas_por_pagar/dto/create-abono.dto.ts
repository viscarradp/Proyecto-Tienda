import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDinero, VaciarANull } from '../../common/validacion';

export const ORIGENES_ABONO = ['GAVETA', 'BOVEDA'] as const;
export type OrigenAbono = (typeof ORIGENES_ABONO)[number];

export class CreateAbonoDto {
  @ApiProperty({
    description: 'Monto a abonar (mayor a 0, no más que el saldo)',
  })
  @IsDinero({
    min: 0.01,
    mensajeMin: 'El abono debe ser mayor a cero',
  })
  monto: number;

  @ApiProperty({
    enum: ORIGENES_ABONO,
    description:
      'De dónde sale el dinero: la gaveta (turno abierto) o la bóveda',
  })
  @IsIn(ORIGENES_ABONO, { message: 'El origen debe ser GAVETA o BOVEDA' })
  origen: OrigenAbono;

  @ApiPropertyOptional({ description: 'Nota opcional del pago' })
  @VaciarANull()
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'La nota no puede pasar de 255 caracteres' })
  nota?: string | null;
}
