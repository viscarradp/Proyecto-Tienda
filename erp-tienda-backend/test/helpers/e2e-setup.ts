import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

interface LoginResponseBody {
  access_token: string;
}

interface CajaTurnoResponseBody {
  id: number;
  estado: string;
  efectivo_esperado: string | number | null;
}

/**
 * Arranca una instancia real de Nest (mismos guards/filtros globales que en
 * producción, vía los providers de AppModule) para pruebas e2e. Solo el
 * ValidationPipe se re-aplica a mano, porque en main.ts se registra
 * imperativamente (app.useGlobalPipes) y no como provider — por eso no se
 * hereda automáticamente al crear el TestingModule.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return app;
}

/** Login contra el admin sembrado por INITIAL_ADMIN_PASSWORD (ver usuarios.service.ts). */
export async function loginAsAdmin(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ nombre: 'admin', password: process.env.INITIAL_ADMIN_PASSWORD });

  if (res.status !== 200) {
    throw new Error(
      `Login de prueba falló: HTTP ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return (res.body as LoginResponseBody).access_token;
}

/**
 * Cierra cualquier turno que haya quedado abierto de un archivo de test
 * anterior. Jest no garantiza el orden entre archivos aunque corran con
 * --runInBand contra la misma BD; esto hace que cada archivo sea
 * independiente del orden real de ejecución.
 */
export async function ensureNoOpenShift(
  app: INestApplication,
  token: string,
): Promise<void> {
  const activa = await request(app.getHttpServer())
    .get('/cajas-turnos/activa')
    .set('Authorization', `Bearer ${token}`);

  if (activa.status === 200) {
    const turno = activa.body as CajaTurnoResponseBody;
    // efectivo_esperado llega como string (Prisma serializa Decimal así) —
    // el DTO exige un number real (@IsNumber, sin @Type de conversión).
    const cierre = await request(app.getHttpServer())
      .patch(`/cajas-turnos/${turno.id}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivo_declarado: Number(turno.efectivo_esperado ?? 0) });

    if (cierre.status !== 200) {
      throw new Error(
        `ensureNoOpenShift: no se pudo cerrar el turno ${turno.id} — ` +
          `HTTP ${cierre.status} ${JSON.stringify(cierre.body)}`,
      );
    }
  }
}
