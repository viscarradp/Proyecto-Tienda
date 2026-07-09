import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
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

  // Modo contingencia (Bloque 3.D, ítem 14): fecha/hora real de una venta hecha
  // durante un apagón, capturada al volver la conexión. Si se omite, es now().
  // La venta pertenece al turno abierto actual; el backend rechaza fechas futuras.
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
