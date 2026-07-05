import {
  IsInt,
  IsNumber,
  IsString,
  Min,
  IsIn,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

export class CreateAjusteInventarioDto {
  @IsInt()
  @IsNotEmpty()
  lote_id: number;

  // Decimal: se puede mermar fracción (media libra dañada) — Bloque 1 §5.3.
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsNotEmpty()
  @Min(0.001)
  cantidad_ajustada: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['QUEBRADO', 'VENCIDO', 'ROBO', 'CONTEO'])
  tipo_ajuste: string;

  @IsString()
  @IsOptional()
  justificacion?: string;
}
