import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  loginAsAdmin,
  ensureNoOpenShift,
} from './helpers/e2e-setup';

interface WithId {
  id: number;
}
interface EstadoBody {
  total_ventas_completadas: number;
  ingreso_bruto_ventas: string | number;
}
interface FlujoBody {
  ventas_efectivo: string | number;
}

/**
 * Los reportes agrupan por DÍA en la zona horaria del negocio (El Salvador,
 * UTC-6), no en UTC. Una venta de las 19:30 locales se guarda como 01:30Z del
 * día siguiente: debe contar en su día local y no en el siguiente.
 */
describe('Reportes — día calendario en la zona del negocio (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let diaLocal: string; // YYYY-MM-DD (hora de El Salvador)
  let diaSiguiente: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    // Un día local lejano (40 días atrás) para no mezclarse con ventas de
    // otros archivos de test. El Salvador es UTC-6 fijo, sin horario de verano.
    const MS_DIA = 24 * 60 * 60 * 1000;
    const hace40 = Date.now() - 40 * MS_DIA;
    diaLocal = new Date(hace40 - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
    diaSiguiente = new Date(hace40 + MS_DIA - 6 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set(auth())
      .send({ nombre: `ZonaHoraria-${Date.now()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({
        nombre: 'Pan-ZonaHoraria-E2E',
        categoria_id: (cat.body as WithId).id,
      });
    const prodId = (prod.body as WithId).id;
    const pres = await request(app.getHttpServer())
      .post('/presentaciones')
      .set(auth())
      .send({
        producto_id: prodId,
        descripcion: 'Unidad',
        factor_conversion: 1,
        precio_venta: 7,
      });
    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'ZonaHoraria-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: prodId,
            costo_unitario_adquisicion: 2,
            cantidad_inicial: 10,
          },
        ],
      });
    await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 0 });

    // Venta de contingencia a las 19:30 hora de El Salvador (= 01:30Z del día
    // siguiente en UTC).
    const venta = await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({
        fecha: `${diaLocal}T19:30:00-06:00`,
        detalles: [{ presentacion_id: (pres.body as WithId).id, cantidad: 3 }],
      });
    expect(venta.status).toBe(201);
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  async function get<T>(ruta: string, desde: string, hasta: string) {
    const res = await request(app.getHttpServer())
      .get(`/reportes/${ruta}?desde=${desde}&hasta=${hasta}`)
      .set(auth());
    expect(res.status).toBe(200);
    return res.body as T;
  }

  it('estado-resultados: la venta de las 19:30 cuenta en su día local', async () => {
    const r = await get<EstadoBody>('estado-resultados', diaLocal, diaLocal);
    expect(r.total_ventas_completadas).toBe(1);
    expect(Number(r.ingreso_bruto_ventas)).toBeCloseTo(21);
  });

  it('estado-resultados: NO cuenta en el día local siguiente', async () => {
    const r = await get<EstadoBody>(
      'estado-resultados',
      diaSiguiente,
      diaSiguiente,
    );
    expect(r.total_ventas_completadas).toBe(0);
  });

  it('flujo-efectivo: la venta de las 19:30 cuenta en su día local', async () => {
    const r = await get<FlujoBody>('flujo-efectivo', diaLocal, diaLocal);
    expect(Number(r.ventas_efectivo)).toBeCloseTo(21);
  });

  it('flujo-efectivo: NO cuenta en el día local siguiente', async () => {
    const r = await get<FlujoBody>(
      'flujo-efectivo',
      diaSiguiente,
      diaSiguiente,
    );
    expect(Number(r.ventas_efectivo)).toBeCloseTo(0);
  });

  it('rechaza fechas con formato inválido y rangos invertidos (400)', async () => {
    for (const q of [
      'desde=hoy&hasta=2026-01-01',
      'desde=2026-01-01&hasta=2026-02-30',
      `desde=${diaSiguiente}&hasta=${diaLocal}`,
    ]) {
      const res = await request(app.getHttpServer())
        .get(`/reportes/estado-resultados?${q}`)
        .set(auth());
      expect(res.status).toBe(400);
    }
  });
});
