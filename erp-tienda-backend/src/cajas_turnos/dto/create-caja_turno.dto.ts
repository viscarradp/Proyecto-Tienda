import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, IsOptional } from 'class-validator';

export class CreateCajaTurnoDto {
  @ApiProperty({
    description: 'Monto de efectivo con el que se inicia el turno',
    minimum: 0,
  })
  @IsNumber()
  @Min(0, { message: 'El fondo inicial no puede ser negativo' })
  fondo_inicial: number;

  @ApiProperty({
    description:
      'Cuánto del fondo inicial se saca de la bóveda al abrir (traslado bóveda→gaveta)',
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  desde_boveda?: number;
}
