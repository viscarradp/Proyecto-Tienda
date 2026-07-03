import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CategoriasModule } from './categorias/categorias.module';
import { ProductosModule } from './productos/productos.module';
import { PresentacionesModule } from './presentaciones/presentaciones.module';
import { PrismaModule } from './prisma/prisma.module';
import { CajasTurnosModule } from './cajas_turnos/cajas_turnos.module';
import { VentasModule } from './ventas/ventas.module';
import { ComprasModule } from './compras/compras.module';
import { CategoriasGastosModule } from './categorias_gastos/categorias_gastos.module';
import { MovimientosFinancierosModule } from './movimientos_financieros/movimientos_financieros.module';
import { AjustesInventarioModule } from './ajustes_inventario/ajustes_inventario.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { AuthModule } from './auth/auth.module';
import { CajaGeneralModule } from './caja_general/caja_general.module';
import { ReportesModule } from './reportes/reportes.module';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { GLOBAL_THROTTLE_LIMIT } from './common/throttler-limits';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite global por IP; /auth/login tiene un límite más estricto
    // (ver @Throttle en auth.controller.ts). Store en memoria: correcto para
    // una sola instancia; si se escala a varias instancias, migrar a un
    // store compartido (Redis) — ver docs/roadmap/hardening-backlog.md.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: GLOBAL_THROTTLE_LIMIT,
      },
    ]),
    PrismaModule,
    CategoriasModule,
    ProductosModule,
    PresentacionesModule,
    CajasTurnosModule,
    VentasModule,
    ComprasModule,
    CategoriasGastosModule,
    MovimientosFinancierosModule,
    AjustesInventarioModule,
    UsuariosModule,
    AuthModule,
    CajaGeneralModule,
    ReportesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Orden: Throttler primero (aplica incluso a rutas @Public, como login),
    // luego autenticación, luego autorización por rol.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Red de seguridad: traduce errores de Prisma no manejados localmente
    // (P2002/P2003/P2025) a respuestas HTTP claras en vez de un 500 genérico
    // (ver docs/decisions/0006-filtro-excepciones-prisma.md).
    {
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
    },
  ],
})
export class AppModule {}
