import { Controller, Get, Query } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { Roles } from '../auth/decorators/roles.decorator';

@Roles('ADMIN')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  /**
   * GET /reportes/estado-resultados?desde=2026-04-01&hasta=2026-04-18
   * Si no se pasan parámetros, usa el mes actual (1ro del mes hasta ahora).
   */
  @Get('estado-resultados')
  async getEstadoResultados(
    @Query('desde') desdeStr?: string,
    @Query('hasta') hastaStr?: string,
  ) {
    const { desde, hasta } = this.parsePeriodo(desdeStr, hastaStr);
    return this.reportesService.getEstadoResultados(desde, hasta);
  }

  /**
   * GET /reportes/productos-top?desde=2026-04-01&hasta=2026-04-18&limit=10
   */
  @Get('productos-top')
  async getProductosTop(
    @Query('desde') desdeStr?: string,
    @Query('hasta') hastaStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const { desde, hasta } = this.parsePeriodo(desdeStr, hastaStr);
    const limit = limitStr ? parseInt(limitStr, 10) : 10;
    return this.reportesService.getProductosTop(desde, hasta, limit);
  }

  /**
   * GET /reportes/margen-por-producto?desde=2026-04-01&hasta=2026-04-18
   */
  @Get('margen-por-producto')
  async getMargenPorProducto(
    @Query('desde') desdeStr?: string,
    @Query('hasta') hastaStr?: string,
  ) {
    const { desde, hasta } = this.parsePeriodo(desdeStr, hastaStr);
    return this.reportesService.getMargenPorProducto(desde, hasta);
  }

  /**
   * Parsea los query params de fecha.
   * Default: desde el 1ro del mes actual hasta el final de hoy.
   */
  private parsePeriodo(
    desdeStr?: string,
    hastaStr?: string,
  ): { desde: Date; hasta: Date } {
    const now = new Date();

    const desde = desdeStr
      ? new Date(desdeStr + 'T00:00:00.000Z')
      : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));

    const hasta = hastaStr
      ? new Date(hastaStr + 'T23:59:59.999Z')
      : new Date(
          Date.UTC(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999,
          ),
        );

    return { desde, hasta };
  }
}
