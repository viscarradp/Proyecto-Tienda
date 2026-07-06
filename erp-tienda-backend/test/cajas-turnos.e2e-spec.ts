import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  loginAsAdmin,
  ensureNoOpenShift,
} from './helpers/e2e-setup';

interface CajaTurnoResponseBody {
  id: number;
  estado: string;
  efectivo_esperado: string | number | null;
  diferencia?: string | number | null;
}

/**
 * Cubre las invariantes de turnos de caja (cajas_turnos.service.ts) — los
 * hallazgos H2/H7 de la auditoría (doble apertura, doble cierre) y sus fixes
 * de Fase 0 (advisory lock / FOR UPDATE). Antes de esto, estas regresiones
 * solo se habían verificado a mano con curl.
 */
describe('Cajas de turno — invariantes de apertura/cierre (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  it('bajo concurrencia, solo permite abrir un turno a la vez (regresión hallazgo H7)', async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/cajas-turnos/abrir')
          .set('Authorization', `Bearer ${token}`)
          .send({ fondo_inicial: 100 }),
      ),
    );

    const exitosas = respuestas.filter((r) => r.status === 201);
    const rechazadas = respuestas.filter((r) => r.status === 409);

    expect(exitosas.length).toBe(1);
    expect(rechazadas.length).toBe(4);
  });

  it('cierra el turno calculando la diferencia correctamente', async () => {
    const activa = await request(app.getHttpServer())
      .get('/cajas-turnos/activa')
      .set('Authorization', `Bearer ${token}`);
    expect(activa.status).toBe(200);
    const turnoActivo = activa.body as CajaTurnoResponseBody;

    const esperado = Number(turnoActivo.efectivo_esperado); // 100, sin movimientos en este turno
    const declarado = esperado + 15; // sobrante deliberado

    const cierre = await request(app.getHttpServer())
      .patch(`/cajas-turnos/${turnoActivo.id}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      // El descuadre de $15 (≥ umbral) exige justificación desde el Bloque 2.
      .send({
        efectivo_declarado: declarado,
        observaciones: 'Sobrante deliberado (prueba)',
      });

    const turnoCerrado = cierre.body as CajaTurnoResponseBody;
    expect(cierre.status).toBe(200);
    expect(turnoCerrado.estado).toBe('CERRADA');
    expect(Number(turnoCerrado.diferencia)).toBe(15);
  });

  it('bajo concurrencia, solo permite cerrar el turno una vez (sin duplicar el ajuste)', async () => {
    // Turno fresco para este caso (el anterior ya quedó CERRADA).
    const abrir = await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ fondo_inicial: 50 });
    const turnoId = (abrir.body as CajaTurnoResponseBody).id;

    const antesAgg = await request(app.getHttpServer())
      .get('/movimientos-financieros?tipo_movimiento=AJUSTE_FALTANTE')
      .set('Authorization', `Bearer ${token}`);
    const conteoAjustesAntes = (antesAgg.body as unknown[]).length;

    // Declara MENOS de lo esperado (50) para forzar un AJUSTE_FALTANTE y
    // así poder confirmar que la concurrencia no lo duplica.
    const respuestas = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .patch(`/cajas-turnos/${turnoId}/cerrar`)
          .set('Authorization', `Bearer ${token}`)
          .send({
            efectivo_declarado: 40,
            observaciones: 'Faltante deliberado (prueba)',
          }),
      ),
    );

    const exitosas = respuestas.filter((r) => r.status === 200);
    const rechazadas = respuestas.filter((r) => r.status === 409);
    expect(exitosas.length).toBe(1);
    expect(rechazadas.length).toBe(2);

    const despuesAgg = await request(app.getHttpServer())
      .get('/movimientos-financieros?tipo_movimiento=AJUSTE_FALTANTE')
      .set('Authorization', `Bearer ${token}`);
    const conteoAjustesDespues = (despuesAgg.body as unknown[]).length;
    expect(conteoAjustesDespues).toBe(conteoAjustesAntes + 1); // no triplicado
  });
});
