import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, IsOptional, IsString } from 'class-validator';

export class CloseCajaTurnoDto {
  @ApiProperty({
    description: 'Monto de efectivo total contado al final del turno',
    minimum: 0,
  })
  @IsNumber()
  @Min(0, { message: 'El efectivo declarado no puede ser negativo' })
  efectivo_declarado: number;

  @ApiProperty({
    description: 'Observaciones o justificación en caso de descuadre',
    required: false,
  })
  @IsOptional()
  @IsString()
  observaciones?: string;
}
