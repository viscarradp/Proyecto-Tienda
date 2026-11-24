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
interface VentaDetalle {
  id: number;
  detalle_ventas: { id: number }[];
}
interface ProductoBody {
  id: number;
  lotes_inventario: { id: number; cantidad_disponible: string | number }[];
}
interface TurnoActivo {
  id: number;
  efectivo_esperado: string | number;
}

/**
 * Anulación de ventas: reverso exacto al lote y a la caja, rechazo si la venta
 * ya tiene devoluciones, idempotencia bajo concurrencia (doble clic) y rechazo
 * en turnos cerrados.
 */
describe('Anulación de ventas (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let presentacionId: number;
  let productoId: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function abrirTurno() {
    await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 0 });
  }

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set(auth())
      .send({ nombre: `Anul-cat-${Date.now()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({
        nombre: 'Leche-Anul-E2E',
        categoria_id: (cat.body as WithId).id,
      });
    productoId = (prod.body as WithId).id;

    const pres = await request(app.getHttpServer())
      .post('/presentaciones')
      .set(auth())
      .send({
        producto_id: productoId,
        descripcion: 'Unidad',
        factor_conversion: 1,
        precio_venta: 10,
      });
    presentacionId = (pres.body as WithId).id;

    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Anul-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 4,
            cantidad_inicial: 50,
          },
        ],
      });

    await abrirTurno();
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  async function stock(): Promise<number> {
    const res = await request(app.getHttpServer())
      .get('/productos')
      .set(auth());
    const p = (res.body as ProductoBody[]).find((x) => x.id === productoId);
    return Number(p!.lotes_inventario[0].cantidad_disponible);
  }

  async function turnoActivo(): Promise<TurnoActivo> {
    const res = await request(app.getHttpServer())
      .get('/cajas-turnos/activa')
      .set(auth());
    return res.body as TurnoActivo;
  }

  async function efectivoEsperado(): Promise<number> {
    return Number((await turnoActivo()).efectivo_esperado ?? 0);
  }

  async function vender(cantidad: number): Promise<number> {
    const venta = await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad }] });
    return (venta.body as WithId).id;
  }

  const anular = (ventaId: number) =>
    request(app.getHttpServer())
      .patch(`/ventas/${ventaId}/anular`)
      .set(auth())
      .send({ justificacion_nula: 'Error de la cajera' });

  it('anular una venta simple devuelve el stock al lote y resta el total del efectivo', async () => {
    const stock0 = await stock();
    const efectivo0 = await efectivoEsperado();

    const ventaId = await vender(5);
    expect(await stock()).toBeCloseTo(stock0 - 5);
    expect(await efectivoEsperado()).toBeCloseTo(efectivo0 + 50);

    const res = await anular(ventaId);
    expect(res.status).toBe(200);
    expect((res.body as { estado: string }).estado).toBe('ANULADA');

    expect(await stock()).toBeCloseTo(stock0);
    expect(await efectivoEsperado()).toBeCloseTo(efectivo0);
  });

  it('rechaza (409) anular una venta que ya tiene devoluciones; stock y efectivo no cambian', async () => {
    const ventaId = await vender(5);
    const det = await request(app.getHttpServer())
      .get(`/ventas/${ventaId}`)
      .set(auth());
    const dvId = (det.body as VentaDetalle).detalle_ventas[0].id;

    const devol = await request(app.getHttpServer())
      .post(`/ventas/${ventaId}/devolucion`)
      .set(auth())
      .send({
        detalles: [
          { detalle_venta_id: dvId, cantidad: 2, destino: 'REINGRESO' },
        ],
      });
    expect(devol.status).toBe(201);

    const stock0 = await stock();
    const efectivo0 = await efectivoEsperado();

    const res = await anular(ventaId);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('devoluciones');

    expect(await stock()).toBeCloseTo(stock0);
    expect(await efectivoEsperado()).toBeCloseTo(efectivo0);

    // La venta sigue COMPLETADA.
    const despues = await request(app.getHttpServer())
      .get(`/ventas/${ventaId}`)
      .set(auth());
    expect((despues.body as { estado: string }).estado).toBe('COMPLETADA');
  });

  it('dos anulaciones concurrentes: solo una tiene éxito y el stock se restaura una vez', async () => {
    const ventaId = await vender(5);
    const stockVendida = await stock();
    const efectivoVendida = await efectivoEsperado();

    const [r1, r2] = await Promise.all([anular(ventaId), anular(ventaId)]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s >= 400 && s < 500)).toHaveLength(1);

    expect(await stock()).toBeCloseTo(stockVendida + 5);
    expect(await efectivoEsperado()).toBeCloseTo(efectivoVendida - 50);
  });

  it('rechaza anular una venta de un turno ya cerrado', async () => {
    const ventaId = await vender(3);
    await ensureNoOpenShift(app, token); // cierra el turno con la venta dentro
    const stock0 = await stock();

    const res = await anular(ventaId);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('turno');
    expect(await stock()).toBeCloseTo(stock0);

    await abrirTurno(); // deja un turno abierto para el afterAll
  });
});
