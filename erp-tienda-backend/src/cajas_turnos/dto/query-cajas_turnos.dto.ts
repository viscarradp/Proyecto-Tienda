import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query de `GET /cajas-turnos`. Paginación simple por cursor: `antes_de=<id>`
 * trae los turnos anteriores a ese id (más recientes primero).
 */
export class QueryCajasTurnosDto {
  /** Por defecto 7; máximo 50. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(50, { message: 'limit no puede pasar de 50' })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'antes_de debe ser un entero' })
  @Min(1, { message: 'antes_de debe ser positivo' })
  antes_de?: number;
}
