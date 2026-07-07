import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, IsOptional, IsString } from 'class-validator';

export class ArqueoBovedaDto {
  @ApiProperty({
    description: 'Efectivo físico contado en la bóveda',
    minimum: 0,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  saldo_declarado: number;

  @ApiProperty({
    description: 'Justificación (obligatoria si el descuadre ≥ umbral)',
    required: false,
  })
  @IsOptional()
  @IsString()
  justificacion?: string;
}
