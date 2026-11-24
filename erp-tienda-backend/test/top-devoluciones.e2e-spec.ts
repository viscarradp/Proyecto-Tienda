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
  detalle_ventas: { id: number }[];
}
interface FilaTop {
  producto_id: number;
  unidades_vendidas: number;
  ingreso: string | number;
  costo_fifo: string | number;
  margen: string | number;
}
interface VentaListada {
  id: number;
  _count: { devoluciones: number };
  devoluciones: { total_reembolsado: string | number }[];
  detalle_ventas: {
    presentaciones: { productos: { nombre: string } };
  }[];
}

/**
 * Productos top / margen por producto deben ser NETOS de devoluciones
 * (L1b, COD-14), y el listado de ventas debe traer lo necesario para que la
 * pantalla de Movimientos descuente lo devuelto y nombre el producto.
 */
describe('Productos top neto de devoluciones (e2e, L1b)', () => {
  let app: INestApplication;
  let token: string;
  let productoId: number;
  let presentacionId: number;
  const NOMBRE = 'Frijol-Top-E2E';

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const RANGO = 'desde=2020-01-01&hasta=2030-01-01';

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set(auth())
      .send({ nombre: `Top-cat-${Date.now()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({ nombre: NOMBRE, categoria_id: (cat.body as WithId).id });
    productoId = (prod.body as WithId).id;
    const pres = await request(app.getHttpServer())
      .post('/presentaciones')
      .set(auth())
      .send({
        producto_id: productoId,
        descripcion: 'Libra',
        factor_conversion: 1,
        precio_venta: 10,
      });
    presentacionId = (pres.body as WithId).id;

    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Top-E2E',
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
    await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 0 });
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  async function fila(ruta: string): Promise<FilaTop | undefined> {
    const res = await request(app.getHttpServer())
      .get(`/reportes/${ruta}?${RANGO}`)
      .set(auth());
    return (res.body as FilaTop[]).find((f) => f.producto_id === productoId);
  }

  it('resta unidades, ingreso y costo (solo REINGRESO) de lo devuelto', async () => {
    // Venta de 5 libras: ingreso 50, costo 20.
    const venta = await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 5 }] });
    const ventaId = (venta.body as WithId).id;
    const det = await request(app.getHttpServer())
      .get(`/ventas/${ventaId}`)
      .set(auth());
    const dvId = (det.body as VentaDetalle).detalle_ventas[0].id;

    const bruto = await fila('productos-top');
    expect(bruto!.unidades_vendidas).toBeCloseTo(5);
    expect(Number(bruto!.ingreso)).toBeCloseTo(50);
    expect(Number(bruto!.costo_fifo)).toBeCloseTo(20);

    // Devolución parcial: 2 REINGRESO (revierte ingreso 20 y costo 8)
    // y 1 MERMA (revierte ingreso 10, el costo queda como pérdida).
    const devolver = (cantidad: number, destino: 'REINGRESO' | 'MERMA') =>
      request(app.getHttpServer())
        .post(`/ventas/${ventaId}/devolucion`)
        .set(auth())
        .send({
          detalles: [{ detalle_venta_id: dvId, cantidad, destino }],
        });
    expect((await devolver(2, 'REINGRESO')).status).toBe(201);
    expect((await devolver(1, 'MERMA')).status).toBe(201);

    const neto = await fila('productos-top');
    expect(neto!.unidades_vendidas).toBeCloseTo(2);
    expect(Number(neto!.ingreso)).toBeCloseTo(20);
    expect(Number(neto!.costo_fifo)).toBeCloseTo(12); // 20 − 8 (solo REINGRESO)
    expect(Number(neto!.margen)).toBeCloseTo(8);

    const margen = await fila('margen-por-producto');
    expect(margen!.unidades_vendidas).toBeCloseTo(2);
    expect(Number(margen!.ingreso)).toBeCloseTo(20);
  });

  it('GET /ventas trae el nombre del producto y los montos devueltos', async () => {
    const res = await request(app.getHttpServer()).get('/ventas').set(auth());
    const conDevol = (res.body as VentaListada[]).find(
      (v) =>
        v.detalle_ventas[0]?.presentaciones.productos.nombre === NOMBRE &&
        v._count.devoluciones > 0,
    );
    expect(conDevol).toBeDefined();
    expect(conDevol!.devoluciones.length).toBe(conDevol!._count.devoluciones);
    const devuelto = conDevol!.devoluciones.reduce(
      (a, d) => a + Number(d.total_reembolsado),
      0,
    );
    expect(devuelto).toBeCloseTo(30);
  });
});
