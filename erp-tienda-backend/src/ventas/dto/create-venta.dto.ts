import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { IsCantidad, IsDinero } from '../../common/validacion';

export class DetalleVentaInputDto {
  @IsInt()
  presentacion_id: number;

  // Decimal para ventas fraccionadas (media libra, granel) — Bloque 1 §5.3.
  // Exactamente UNO de `cantidad` o `monto` (lo valida VentasService antes de
  // tocar la base de datos, con un 400 claro).
  @IsOptional()
  @IsCantidad()
  cantidad?: number;

  // Venta por monto (L5a · D-03): "dame $1 de queso". El backend calcula la
  // cantidad = monto ÷ precio (3 decimales) y el subtotal queda en el monto.
  @IsOptional()
  @IsDinero({ min: 0.01, mensajeMin: 'El monto debe ser de al menos $0.01' })
  monto?: number;
}

export class CreateVentaDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'El carrito debe tener al menos un artículo' })
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaInputDto)
  detalles: DetalleVentaInputDto[];

  // Modo contingencia (Bloque 3.D, ítem 14): fecha/hora real de una venta hecha
  // durante un apagón, capturada al volver la conexión. Si se omite, es now().
  // La venta pertenece al turno abierto actual; el backend rechaza fechas
  // futuras y de más de 30 días atrás (ver ventas.service.ts).
  @IsOptional()
  @IsDateString()
  fecha?: string;
}
