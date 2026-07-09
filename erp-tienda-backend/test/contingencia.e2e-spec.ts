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
interface VentaBody {
  id: number;
  fecha: string;
  total: string | number;
  estado: string;
}
interface TurnoActivo {
  efectivo_esperado: string | number;
}

/**
 * Cubre el Bloque 3.D (ítem 14, modo contingencia): una venta puede registrarse
 * con su fecha/hora real (la de un apagón), contra el turno actual. El backend
 * rechaza fechas futuras.
 */
describe('Contingencia — venta con fecha manual (e2e, 3.D)', () => {
  let app: INestApplication;
  let token: string;
  let presentacionId: number;

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set(auth())
      .send({ nombre: `Conting-${Date.now()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({
        nombre: 'Pan-Conting-E2E',
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
        precio_venta: 5,
      });
    presentacionId = (pres.body as WithId).id;
    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Conting-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: prodId,
            costo_unitario_adquisicion: 2,
            cantidad_inicial: 20,
          },
        ],
      });
    await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 0 });
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function efectivoEsperado(): Promise<number> {
    const res = await request(app.getHttpServer())
      .get('/cajas-turnos/activa')
      .set(auth());
    return Number((res.body as TurnoActivo).efectivo_esperado ?? 0);
  }

  it('registra una venta con su fecha real (apagón) en el turno actual', async () => {
    const efectivo0 = await efectivoEsperado();
    // Fecha real: hace 2 días.
    const hace2dias = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const fechaISO = hace2dias.toISOString();

    const res = await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({
        fecha: fechaISO,
        detalles: [{ presentacion_id: presentacionId, cantidad: 4 }],
      });
    expect(res.status).toBe(201);
    const venta = res.body as VentaBody;
    expect(venta.estado).toBe('COMPLETADA');
    // La venta quedó con la fecha real (mismo día que la enviada).
    expect(venta.fecha.slice(0, 10)).toBe(fechaISO.slice(0, 10));
    // El efectivo entra AHORA al turno actual (4 × 5 = 20).
    expect(await efectivoEsperado()).toBeCloseTo(efectivo0 + 20);
  });

  it('rechaza una venta con fecha futura (400)', async () => {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({
        fecha: manana,
        detalles: [{ presentacion_id: presentacionId, cantidad: 1 }],
      });
    expect(res.status).toBe(400);
  });
});
