import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { zonaHorariaNegocio } from './common/zona-horaria';
import {
  aplicarTrustProxy,
  validarConfigProduccion,
} from './common/config-produccion';

async function bootstrap() {
  // Falla rápido si ZONA_HORARIA_NEGOCIO es inválida (los reportes dependen de ella).
  zonaHorariaNegocio();
  // En producción exige CORS_ORIGINS y un JWT_SECRET fuerte (ADR 0010).
  validarConfigProduccion();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Detrás de un balanceador (Cloud Run, etc.) req.ip sería la del proxy y el
  // rate-limit contaría a toda la tienda como un solo cliente. Desactivado por
  // defecto; ver TRUST_PROXY en docs/operations/configuration.md.
  aplicarTrustProxy(app, process.env.TRUST_PROXY);

  // Swagger es opt-in: solo en desarrollo o con ENABLE_SWAGGER=true. Si falta
  // NODE_ENV queda apagado (default seguro; ver docs/decisions/0010).
  const swaggerEnabled =
    process.env.NODE_ENV === 'development' ||
    process.env.ENABLE_SWAGGER === 'true';

  // Helmet: cuando Swagger UI está activo relajamos la CSP por defecto (sus
  // assets inline la necesitan); en producción con Swagger apagado se aplica
  // la CSP estricta por defecto de Helmet.
  app.use(
    helmet(swaggerEnabled ? { contentSecurityPolicy: false } : undefined),
  );

  // CORS: en desarrollo permitimos cualquier origen (Cloudflare Tunnel, móvil, etc.).
  // En producción requiere allowlist explícita (CORS_ORIGINS).
  // El JWT viaja por header Authorization, no como cookie, así que no se necesita credentials.
  const corsOptions =
    process.env.NODE_ENV === 'development'
      ? { origin: '*', credentials: false }
      : {
          origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3001')
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
          credentials: false,
        };
  app.enableCors(corsOptions);

  // Configuración de validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuración de Swagger
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('ERP Tienda de Colonia API')
      .setDescription(
        'Documentación de la API para el sistema ERP de la tienda',
      )
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Aplicación corriendo en: ${await app.getUrl()}`);
}
bootstrap().catch((err) => {
  console.error('Error durante el inicio de la aplicación:', err);
  process.exit(1);
});
