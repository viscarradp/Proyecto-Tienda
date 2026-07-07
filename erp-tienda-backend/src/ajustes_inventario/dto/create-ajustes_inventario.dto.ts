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

  // CONTEO_SOBRANTE es un ajuste POSITIVO (encontrar stock / conteo hacia
  // arriba); el resto son mermas (ajustes negativos). Ver §6, Bloque 2.D.
  @IsString()
  @IsNotEmpty()
  @IsIn(['QUEBRADO', 'VENCIDO', 'ROBO', 'CONTEO', 'CONTEO_SOBRANTE'])
  tipo_ajuste: string;

  @IsString()
  @IsOptional()
  justificacion?: string;
}
