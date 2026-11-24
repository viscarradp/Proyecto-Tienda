import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { aplicarTrustProxy } from './../src/common/config-produccion';

describe('GET /salud (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 { estado: "ok" } sin token', async () => {
    const res = await request(app.getHttpServer()).get('/salud').expect(200);
    expect(res.body).toEqual({ estado: 'ok' });
  });
});

// Throttler real con un límite bajo (en NODE_ENV=test el de la app es de
// 100000), sobre un controller mínimo: aísla el comportamiento de
// `trust proxy` + ThrottlerGuard sin depender de la BD.
@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 2 }]),
  ],
  controllers: [PingController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
class ThrottleDemoModule {}

describe('TRUST_PROXY y rate-limit por IP (e2e)', () => {
  async function crearApp(trustProxy: string | undefined) {
    const moduleFixture = await Test.createTestingModule({
      imports: [ThrottleDemoModule],
    }).compile();
    const app = moduleFixture.createNestApplication<NestExpressApplication>();
    aplicarTrustProxy(app, trustProxy);
    await app.init();
    return app;
  }

  const ping = (app: NestExpressApplication, ip: string) =>
    request(app.getHttpServer()).get('/ping').set('X-Forwarded-For', ip);

  it('sin TRUST_PROXY todos los clientes comparten el cupo (IP del proxy)', async () => {
    const app = await crearApp(undefined);
    try {
      await ping(app, '203.0.113.1').expect(200);
      await ping(app, '203.0.113.1').expect(200);
      // Otra IP de cliente, pero el servidor solo ve al proxy: ya sin cupo.
      await ping(app, '203.0.113.2').expect(429);
    } finally {
      await app.close();
    }
  });

  it('con TRUST_PROXY=1 cada IP de X-Forwarded-For tiene su propio cupo', async () => {
    const app = await crearApp('1');
    try {
      await ping(app, '203.0.113.1').expect(200);
      await ping(app, '203.0.113.1').expect(200);
      await ping(app, '203.0.113.1').expect(429);
      // Otro cliente no se ve afectado.
      await ping(app, '203.0.113.2').expect(200);
    } finally {
      await app.close();
    }
  });
});
