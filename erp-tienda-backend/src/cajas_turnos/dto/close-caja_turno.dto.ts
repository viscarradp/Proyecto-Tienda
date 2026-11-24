import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDinero } from '../../common/validacion';

export class CloseCajaTurnoDto {
  @ApiProperty({
    description: 'Monto de efectivo total contado al final del turno',
    minimum: 0,
  })
  @IsDinero({
    mensajeMin: 'El efectivo declarado no puede ser negativo',
  })
  efectivo_declarado: number;

  @ApiProperty({
    description:
      'Cuánto del efectivo contado se traslada a la bóveda al cerrar (el resto queda en la gaveta para mañana)',
    required: false,
    minimum: 0,
  })
  @IsOptional()
  @IsDinero()
  monto_a_boveda?: number;

  @ApiProperty({
    description: 'Observaciones o justificación en caso de descuadre',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'Las observaciones no pueden pasar de 500 caracteres',
  })
  observaciones?: string;
}
