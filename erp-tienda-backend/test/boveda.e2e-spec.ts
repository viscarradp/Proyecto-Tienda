import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  loginAsAdmin,
  ensureNoOpenShift,
} from './helpers/e2e-setup';

interface SaldoBody {
  saldo_actual: string | number;
  total_depositos: number;
}
interface WithId {
  id: number;
}
interface ErrorBody {
  message: string;
}

/**
 * Cubre el modelo origen→destino del Bloque 1.C: el saldo de bóveda se DERIVA
 * del libro (ya no hay tabla caja_general), la inyección de capital crea su
 * asiento (fuga C), y se puede pagar un gasto desde la bóveda sin turno abierto
 * (fuga A). El POST genérico a /caja-general (fuga D) se eliminó.
 */
describe('Bóveda — saldo derivado y gastos desde bóveda (e2e, 1.C)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);
  });

  afterAll(async () => {
    await app.close();
  });

  async function saldoBoveda(): Promise<number> {
    const res = await request(app.getHttpServer())
      .get('/caja-general/saldo')
      .set('Authorization', `Bearer ${token}`);
    return Number((res.body as SaldoBody).saldo_actual);
  }

  it('inyecta capital, deriva el saldo y paga un gasto desde bóveda sin turno', async () => {
    const inicial = await saldoBoveda();

    // 1. Inyección de capital → INGRESO_CAPITAL (DUEÑOS→BOVEDA) con asiento.
    const iny = await request(app.getHttpServer())
      .post('/caja-general/inyeccion')
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 100, descripcion: 'Capital E2E' });
    expect(iny.status).toBe(201);
    expect(await saldoBoveda()).toBeCloseTo(inicial + 100);

    // 2. Categoría de gasto.
    const cat = await request(app.getHttpServer())
      .post('/categorias-gastos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Servicios-E2E', tipo: 'FIJO' });
    const catId = (cat.body as WithId).id;

    // 3. Gasto desde bóveda SIN turno abierto (fuga A corregida).
    const gasto = await request(app.getHttpServer())
      .post('/movimientos-financieros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto: 30,
        descripcion: 'Luz desde bóveda',
        categoria_gasto_id: catId,
        origen_fondos: 'BOVEDA',
      });
    expect(gasto.status).toBe(201);
    expect(await saldoBoveda()).toBeCloseTo(inicial + 70);

    // 4. Un gasto que excede el saldo de bóveda se rechaza.
    const exceso = await request(app.getHttpServer())
      .post('/movimientos-financieros')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto: 999999,
        descripcion: 'Exceso',
        categoria_gasto_id: catId,
        origen_fondos: 'BOVEDA',
      });
    expect(exceso.status).toBe(400);
    expect((exceso.body as ErrorBody).message).toMatch(/bóveda/i);
  });
});
