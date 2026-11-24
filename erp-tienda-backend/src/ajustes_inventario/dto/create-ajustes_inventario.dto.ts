import {
  IsInt,
  IsString,
  IsIn,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { IsCantidad } from '../../common/validacion';

export class CreateAjusteInventarioDto {
  // Mermas: siempre sobre un lote. CONTEO_SOBRANTE: un lote o, en su lugar,
  // `producto_id` (se suma al lote más reciente del producto, aunque esté en 0).
  @IsInt()
  @IsOptional()
  lote_id?: number;

  @IsInt()
  @IsOptional()
  producto_id?: number;

  // Decimal: se puede mermar fracción (media libra dañada) — Bloque 1 §5.3.
  @IsCantidad()
  @IsNotEmpty()
  cantidad_ajustada: number;

  // CONTEO_SOBRANTE es un ajuste POSITIVO (encontrar stock / conteo hacia
  // arriba); el resto son mermas (ajustes negativos). Ver §6, Bloque 2.D.
  @IsString()
  @IsNotEmpty()
  @IsIn(['QUEBRADO', 'VENCIDO', 'ROBO', 'CONTEO', 'CONTEO_SOBRANTE'])
  tipo_ajuste: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, {
    message: 'La justificación no puede pasar de 500 caracteres',
  })
  justificacion?: string;
}
