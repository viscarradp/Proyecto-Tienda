import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class CreateCajaTurnoDto {
  @ApiProperty({
    description: 'Monto de efectivo con el que se inicia el turno',
    minimum: 0,
  })
  @IsNumber()
  @Min(0, { message: 'El fondo inicial no puede ser negativo' })
  fondo_inicial: number;
}
