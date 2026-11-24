import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  esFechaCalendarioValida,
  hoyEnZona,
  limitesDelDia,
  primerDiaDelMesEnZona,
  zonaHorariaNegocio,
} from '../common/zona-horaria';

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
   * GET /reportes/patrimonio
   * Foto de balance al instante: inventario + efectivo + activos − deudas.
   */
  @Get('patrimonio')
  async getPatrimonio() {
    return this.reportesService.getPatrimonio();
  }

  /**
   * GET /reportes/flujo-efectivo?desde=2026-04-01&hasta=2026-04-18
   * Entradas y salidas de efectivo por cuenta (gaveta, bóveda) en el período.
   */
  @Get('flujo-efectivo')
  async getFlujoEfectivo(
    @Query('desde') desdeStr?: string,
    @Query('hasta') hastaStr?: string,
  ) {
    const { desde, hasta } = this.parsePeriodo(desdeStr, hastaStr);
    return this.reportesService.getFlujoEfectivo(desde, hasta);
  }

  /**
   * Parsea los query params de fecha ("YYYY-MM-DD", día calendario en la zona
   * horaria del negocio) a límites UTC. Default: desde el 1ro del mes actual
   * hasta el final de hoy, también en la zona del negocio.
   */
  private parsePeriodo(
    desdeStr?: string,
    hastaStr?: string,
  ): { desde: Date; hasta: Date } {
    const zona = zonaHorariaNegocio();
    const ahora = new Date();
    const diaDesde =
      this.validarDia('desde', desdeStr) ?? primerDiaDelMesEnZona(ahora, zona);
    const diaHasta =
      this.validarDia('hasta', hastaStr) ?? hoyEnZona(ahora, zona);

    // "YYYY-MM-DD" se ordena igual como texto que como calendario.
    if (diaDesde > diaHasta) {
      throw new BadRequestException(
        `"desde" (${diaDesde}) no puede ser posterior a "hasta" (${diaHasta})`,
      );
    }

    return {
      desde: limitesDelDia(diaDesde, zona).inicio,
      hasta: limitesDelDia(diaHasta, zona).fin,
    };
  }

  private validarDia(nombre: string, valor?: string): string | undefined {
    if (valor === undefined || valor === '') return undefined;
    if (!esFechaCalendarioValida(valor)) {
      throw new BadRequestException(
        `"${nombre}" debe tener formato YYYY-MM-DD y ser una fecha válida`,
      );
    }
    return valor;
  }
}
