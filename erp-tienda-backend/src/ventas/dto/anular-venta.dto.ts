import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnularVentaDto {
  @IsString({ message: 'Debes escribir el motivo de la anulación' })
  @IsNotEmpty({ message: 'Debes escribir el motivo de la anulación' })
  @MaxLength(500, {
    message: 'El motivo de la anulación no puede pasar de 500 caracteres',
  })
  justificacion_nula: string;
}
