import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Cuerpo de todo `PATCH .../anular` (L12 · ADR 0012): el motivo es obligatorio
 * y queda guardado con quién y cuándo anuló.
 */
export class AnularDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Debes escribir el motivo de la anulación' })
  @IsNotEmpty({ message: 'Debes escribir el motivo de la anulación' })
  @MaxLength(500, {
    message: 'El motivo de la anulación no puede pasar de 500 caracteres',
  })
  motivo: string;
}
