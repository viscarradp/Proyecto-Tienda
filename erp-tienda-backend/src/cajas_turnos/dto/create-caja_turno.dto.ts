import { ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsDinero } from '../../common/validacion';

export class CreateCajaTurnoDto {
  @ApiProperty({
    description: 'Monto de efectivo con el que se inicia el turno',
    minimum: 0,
  })
  @IsDinero({ mensajeMin: 'El fondo inicial no puede ser negativo' })
  fondo_inicial: number;

  @ApiProperty({
    description:
      'Cuánto del fondo inicial se saca de la bóveda al abrir (traslado bóveda→gaveta)',
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @IsDinero()
  desde_boveda?: number;
}
