import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDinero } from '../../common/validacion';

/**
 * De dónde salió (o a dónde fue) la diferencia entre el fondo con el que se
 * abre y lo que quedó en la gaveta al último cierre (D-15).
 *  - BOVEDA: sobra → se trajo de la bóveda; falta → se guardó en la bóveda.
 *  - APORTE: sobra → aporte de la dueña.
 *  - RETIRO: falta → retiro de la dueña.
 *  - NO_SE (o ausente): sin explicar; se registra igual como ajuste.
 */
export const ORIGENES_DIFERENCIA = [
  'BOVEDA',
  'APORTE',
  'RETIRO',
  'NO_SE',
] as const;
export type OrigenDiferencia = (typeof ORIGENES_DIFERENCIA)[number];

export class CreateCajaTurnoDto {
  @ApiProperty({
    description: 'Monto de efectivo con el que se inicia el turno',
    minimum: 0,
  })
  @IsDinero({ mensajeMin: 'El fondo inicial no puede ser negativo' })
  fondo_inicial: number;

  @ApiProperty({
    description:
      'Si el fondo difiere de lo que quedó en la gaveta al último cierre: ' +
      'de dónde salió o a dónde fue la diferencia. La diferencia se registra ' +
      'siempre; sin este campo (o con NO_SE) queda como ajuste sin explicar.',
    required: false,
    enum: ORIGENES_DIFERENCIA,
  })
  @IsOptional()
  @IsIn(ORIGENES_DIFERENCIA)
  origen_diferencia?: OrigenDiferencia;

  @ApiProperty({
    description: 'Nota opcional sobre la diferencia de apertura',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La nota no puede pasar de 200 caracteres' })
  nota?: string;
}
