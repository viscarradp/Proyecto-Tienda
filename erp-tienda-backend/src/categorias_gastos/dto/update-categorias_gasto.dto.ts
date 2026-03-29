import { PartialType } from '@nestjs/swagger';
import { CreateCategoriasGastoDto } from './create-categorias_gasto.dto';

export class UpdateCategoriasGastoDto extends PartialType(
  CreateCategoriasGastoDto,
) {}
