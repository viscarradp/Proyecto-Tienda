import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductoDto } from './create-producto.dto';

export class UpdateProductoDto extends PartialType(CreateProductoDto) {
  @ApiPropertyOptional({
    description:
      'Marca de producto dado de alta a las prisas (por revisar). ' +
      'Ponla en false cuando ya lo revisaste.',
  })
  @IsOptional()
  @IsBoolean()
  por_revisar?: boolean;
}
