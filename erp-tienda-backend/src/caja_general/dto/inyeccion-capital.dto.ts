import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDinero } from '../../common/validacion';

/** Cuerpo de POST /caja-general/inyeccion (aporte del dueño a la bóveda). */
export class InyeccionCapitalDto {
  @IsDinero({ min: 0.01, mensajeMin: 'El monto debe ser mayor a 0' })
  monto: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, {
    message: 'La descripción no puede pasar de 500 caracteres',
  })
  descripcion?: string;
}
