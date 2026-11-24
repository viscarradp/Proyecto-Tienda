import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateProductoDto } from './create-producto.dto';

// Las presentaciones se editan por su propio endpoint (PATCH /presentaciones).
export class UpdateProductoDto extends PartialType(
  OmitType(CreateProductoDto, ['presentaciones'] as const),
) {
  @ApiPropertyOptional({
    description:
      'Marca de producto dado de alta a las prisas (por revisar). ' +
      'Ponla en false cuando ya lo revisaste.',
  })
  @IsOptional()
  @IsBoolean()
  por_revisar?: boolean;
}
