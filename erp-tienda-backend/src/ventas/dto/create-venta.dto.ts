import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, Min, ValidateNested } from 'class-validator';

export class DetalleVentaInputDto {
  @IsInt()
  presentacion_id: number;

  @IsInt()
  @Min(1)
  cantidad: number;
}

export class CreateVentaDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'El carrito debe tener al menos un artículo' })
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaInputDto)
  detalles: DetalleVentaInputDto[];
}
