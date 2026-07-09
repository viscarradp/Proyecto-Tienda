import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class DetalleDevolucionInputDto {
  @IsInt()
  detalle_venta_id: number;

  // Cantidad a devolver, en unidades de la presentación (fraccionable, §5.3).
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  cantidad: number;

  // REINGRESO: el producto vuelve al lote (revendible). MERMA: se descarta.
  @IsString()
  @IsIn(['REINGRESO', 'MERMA'])
  destino: string;
}

export class CreateDevolucionDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'La devolución debe tener al menos una línea' })
  @ValidateNested({ each: true })
  @Type(() => DetalleDevolucionInputDto)
  detalles: DetalleDevolucionInputDto[];

  @IsOptional()
  @IsString()
  justificacion?: string;
}
