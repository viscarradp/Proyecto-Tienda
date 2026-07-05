import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';

export class DetalleVentaInputDto {
  @IsInt()
  presentacion_id: number;

  // Decimal para ventas fraccionadas (media libra, granel) — Bloque 1 §5.3.
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  cantidad: number;
}

export class CreateVentaDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'El carrito debe tener al menos un artículo' })
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaInputDto)
  detalles: DetalleVentaInputDto[];
}
