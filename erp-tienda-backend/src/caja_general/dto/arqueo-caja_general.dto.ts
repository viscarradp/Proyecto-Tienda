import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDinero } from '../../common/validacion';

export class ArqueoBovedaDto {
  @ApiProperty({
    description: 'Efectivo físico contado en la bóveda',
    minimum: 0,
  })
  @IsDinero()
  saldo_declarado: number;

  @ApiProperty({
    description: 'Justificación (obligatoria si el descuadre ≥ umbral)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'La justificación no puede pasar de 500 caracteres',
  })
  justificacion?: string;
}
