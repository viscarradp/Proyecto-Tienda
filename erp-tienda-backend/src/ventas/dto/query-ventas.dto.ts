import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query de `GET /ventas`. Paginación simple por cursor: `antes_de=<id>` trae
 * las ventas anteriores a ese id (más recientes primero).
 */
export class QueryVentasDto {
  /** Uno o varios ids de turno separados por coma: `?caja_turno_id=3,4,5`. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value.split(',').map((s) => (s.trim() === '' ? NaN : Number(s)))
      : value,
  )
  @IsInt({ each: true, message: 'caja_turno_id debe ser uno o más enteros' })
  @ArrayMaxSize(50, { message: 'caja_turno_id admite hasta 50 turnos' })
  caja_turno_id?: number[];

  /** Por defecto 50 (sin `caja_turno_id`); máximo 200. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  @Max(200, { message: 'limit no puede pasar de 200' })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'antes_de debe ser un entero' })
  @Min(1, { message: 'antes_de debe ser positivo' })
  antes_de?: number;
}
