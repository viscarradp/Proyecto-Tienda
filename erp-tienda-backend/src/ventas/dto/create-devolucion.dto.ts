import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsCantidad } from '../../common/validacion';

export class DetalleDevolucionInputDto {
  @IsInt()
  detalle_venta_id: number;

  // Cantidad a devolver, en unidades de la presentación (fraccionable, §5.3).
  @IsCantidad()
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
  @MaxLength(500, {
    message: 'La justificación no puede pasar de 500 caracteres',
  })
  justificacion?: string;
}
