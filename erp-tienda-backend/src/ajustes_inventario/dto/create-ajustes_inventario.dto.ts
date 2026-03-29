import {
  IsInt,
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

  @IsInt()
  @IsNotEmpty()
  @Min(1)
  cantidad_ajustada: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(['QUEBRADO', 'VENCIDO', 'ROBO', 'CONTEO'])
  tipo_ajuste: string;

  @IsString()
  @IsOptional()
  justificacion?: string;
}
