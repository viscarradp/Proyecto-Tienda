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
  detalle_ventas: { id: number; cantidad: string | number }[];
}
interface ProductoBody {
  id: number;
  lotes_inventario: { id: number; cantidad_disponible: string | number }[];
}
interface TurnoActivo {
  id: number;
  efectivo_esperado: string | number;
}
interface ReporteBody {
  devoluciones: string | number;
  utilidad_bruta: string | number;
}

/**
 * Cubre el Bloque 3.B (ítem 13): devolución de cliente ligada a la venta
 * original. Verifica la reversión FIFO exacta al lote (REINGRESO), la merma
 * (MERMA no reingresa stock), el reembolso desde el turno actual, el tope de
 * cantidad devuelta y el neteo en el P&L.
 */
describe('Devoluciones — post-turno ligadas a la venta (e2e, 3.B)', () => {
  let app: INestApplication;
  let token: string;
  let presentacionId: number;
  let productoId: number;

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set(auth())
      .send({ nombre: `Devol-cat-${Date.now()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({
        nombre: 'Leche-Devol-E2E',
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

    // Lote de 20 unidades a costo 4 (aporte del dueño, sin caja).
    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Devol-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 4,
            cantidad_inicial: 20,
          },
        ],
      });

    // Turno abierto: los reembolsos salen de aquí.
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

  async function stock(): Promise<{ loteId: number; disponible: number }> {
    const res = await request(app.getHttpServer())
      .get('/productos')
      .set(auth());
    const p = (res.body as ProductoBody[]).find((x) => x.id === productoId);
    const lote = p!.lotes_inventario[0];
    return { loteId: lote.id, disponible: Number(lote.cantidad_disponible) };
  }

  async function efectivoEsperado(): Promise<number> {
    const res = await request(app.getHttpServer())
      .get('/cajas-turnos/activa')
      .set(auth());
    return Number((res.body as TurnoActivo).efectivo_esperado ?? 0);
  }

  async function reporte(): Promise<ReporteBody> {
    const res = await request(app.getHttpServer())
      .get('/reportes/estado-resultados?desde=2020-01-01&hasta=2030-01-01')
      .set(auth());
    return res.body as ReporteBody;
  }

  async function vender(cantidad: number): Promise<number> {
    const venta = await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad }] });
    return (venta.body as WithId).id;
  }

  async function detalleVentaId(ventaId: number): Promise<number> {
    const res = await request(app.getHttpServer())
      .get(`/ventas/${ventaId}`)
      .set(auth());
    return (res.body as VentaDetalle).detalle_ventas[0].id;
  }

  it('REINGRESO devuelve la cantidad al lote exacto y reembolsa del turno', async () => {
    const stock0 = (await stock()).disponible; // 20
    const efectivo0 = await efectivoEsperado();

    const ventaId = await vender(5); // stock 20→15, efectivo +50
    const dvId = await detalleVentaId(ventaId);
    expect((await stock()).disponible).toBeCloseTo(stock0 - 5);
    expect(await efectivoEsperado()).toBeCloseTo(efectivo0 + 50);

    const devol = await request(app.getHttpServer())
      .post(`/ventas/${ventaId}/devolucion`)
      .set(auth())
      .send({
        detalles: [
          { detalle_venta_id: dvId, cantidad: 2, destino: 'REINGRESO' },
        ],
        justificacion: 'Producto en buen estado',
      });
    expect(devol.status).toBe(201);
    expect(
      Number((devol.body as { total_reembolsado: string }).total_reembolsado),
    ).toBeCloseTo(20);

    // Reingreso: lote 15→17. Reembolso: efectivo −20.
    expect((await stock()).disponible).toBeCloseTo(stock0 - 3);
    expect(await efectivoEsperado()).toBeCloseTo(efectivo0 + 30);
  });

  it('MERMA reembolsa pero NO reingresa stock', async () => {
    const stock0 = (await stock()).disponible; // 17
    const efectivo0 = await efectivoEsperado();

    const ventaId = await vender(4); // stock 17→13, efectivo +40
    const dvId = await detalleVentaId(ventaId);
    expect((await stock()).disponible).toBeCloseTo(stock0 - 4);

    const devol = await request(app.getHttpServer())
      .post(`/ventas/${ventaId}/devolucion`)
      .set(auth())
      .send({
        detalles: [{ detalle_venta_id: dvId, cantidad: 4, destino: 'MERMA' }],
        justificacion: 'Producto vencido, se descarta',
      });
    expect(devol.status).toBe(201);

    // MERMA: el stock queda en 13 (no reingresa); el efectivo vuelve a efectivo0.
    expect((await stock()).disponible).toBeCloseTo(stock0 - 4);
    expect(await efectivoEsperado()).toBeCloseTo(efectivo0);
  });

  it('rechaza devolver más de lo vendido en una línea (400)', async () => {
    const ventaId = await vender(1);
    const dvId = await detalleVentaId(ventaId);
    const devol = await request(app.getHttpServer())
      .post(`/ventas/${ventaId}/devolucion`)
      .set(auth())
      .send({
        detalles: [
          { detalle_venta_id: dvId, cantidad: 99, destino: 'REINGRESO' },
        ],
      });
    expect(devol.status).toBe(400);
  });

  it('el P&L refleja la devolución (ingreso y costo netos)', async () => {
    const r0 = await reporte();
    const ventaId = await vender(5); // ingreso +50, costo +20 → utilidad bruta +30
    const dvId = await detalleVentaId(ventaId);
    const rVenta = await reporte();
    expect(Number(rVenta.utilidad_bruta)).toBeCloseTo(
      Number(r0.utilidad_bruta) + 30,
    );

    // REINGRESO de 2: revierte ingreso 20 y costo 8 → utilidad bruta −12.
    await request(app.getHttpServer())
      .post(`/ventas/${ventaId}/devolucion`)
      .set(auth())
      .send({
        detalles: [
          { detalle_venta_id: dvId, cantidad: 2, destino: 'REINGRESO' },
        ],
      });
    const rDevol = await reporte();
    expect(Number(rDevol.devoluciones)).toBeCloseTo(
      Number(rVenta.devoluciones) + 20,
    );
    // Utilidad bruta: +30 (venta) −12 (devolución de 2 uds) = +18 sobre r0.
    expect(Number(rDevol.utilidad_bruta)).toBeCloseTo(
      Number(r0.utilidad_bruta) + 18,
    );
  });
});
