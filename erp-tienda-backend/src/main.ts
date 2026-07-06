import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger solo en entornos no productivos, salvo que se habilite a propósito
  // (ver docs/decisions/0004-hardening-http.md).
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
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
});
