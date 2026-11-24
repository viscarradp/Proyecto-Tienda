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

interface ProductoResponseBody {
  id: number;
  presentaciones: WithId[];
  // cantidad_disponible es Decimal desde 1.B → JSON lo serializa como string.
  lotes_inventario: { cantidad_disponible: number | string }[];
  stock_total: string;
  pendiente_total: string;
}

interface VentaResponseBody {
  total: string | number;
  avisos: string[];
}

/**
 * Cubre el motor FIFO de ventas (ventas.service.ts) — en particular el
 * hallazgo H1 de la auditoría (sobreventa bajo concurrencia) y su fix de
 * Fase 0 (FOR UPDATE sobre los lotes candidatos). Antes de esto, esta
 * regresión solo se había verificado a mano con curl.
 */
describe('Ventas — motor FIFO (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let presentacionId: number;

  const STOCK_INICIAL = 10;

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const categoria = await request(app.getHttpServer())
      .post('/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Bebidas-E2E' });
    const categoriaId = (categoria.body as WithId).id;

    const producto = await request(app.getHttpServer())
      .post('/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Refresco-E2E', categoria_id: categoriaId });
    const productoId = (producto.body as WithId).id;

    const presentacion = await request(app.getHttpServer())
      .post('/presentaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        producto_id: productoId,
        descripcion: 'Unidad',
        factor_conversion: 1,
        precio_venta: 10,
      });
    presentacionId = (presentacion.body as WithId).id;

    await request(app.getHttpServer())
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedor: 'Proveedor-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 5,
            cantidad_inicial: STOCK_INICIAL,
          },
        ],
      });

    await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ fondo_inicial: 100 });
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  async function stockDisponible(): Promise<number> {
    const res = await request(app.getHttpServer())
      .get('/productos')
      .set('Authorization', `Bearer ${token}`);
    const productos = res.body as ProductoResponseBody[];
    const producto = productos.find((p) =>
      p.presentaciones.some((pres) => pres.id === presentacionId),
    );
    return (producto?.lotes_inventario ?? []).reduce(
      (sum, l) => sum + Number(l.cantidad_disponible),
      0,
    );
  }

  it('vende y descuenta stock correctamente (happy path)', async () => {
    const res = await request(app.getHttpServer())
      .post('/ventas')
      .set('Authorization', `Bearer ${token}`)
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 3 }] });

    expect(res.status).toBe(201);
    expect(Number((res.body as VentaResponseBody).total)).toBe(30);
    expect(await stockDisponible()).toBe(STOCK_INICIAL - 3);
  });

  // L5a · D-01: antes esta venta se rechazaba con 400; ahora se vende igual,
  // se anota la deuda de stock y se avisa a la cajera.
  it('vende igual aunque no haya stock suficiente y avisa (D-01)', async () => {
    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'SinStock-E2E' });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Galleta-E2E', categoria_id: (cat.body as WithId).id });
    const pres = await request(app.getHttpServer())
      .post('/presentaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        producto_id: (prod.body as WithId).id,
        descripcion: 'Unidad',
        factor_conversion: 1,
        precio_venta: 2,
      });
    const presId = (pres.body as WithId).id;
    await request(app.getHttpServer())
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedor: 'SinStock-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: (prod.body as WithId).id,
            costo_unitario_adquisicion: 1,
            cantidad_inicial: 2,
          },
        ],
      });

    const res = await request(app.getHttpServer())
      .post('/ventas')
      .set('Authorization', `Bearer ${token}`)
      .send({ detalles: [{ presentacion_id: presId, cantidad: 5 }] });

    expect(res.status).toBe(201);
    const body = res.body as VentaResponseBody;
    expect(Number(body.total)).toBe(10); // se cobra TODO lo vendido
    expect(body.avisos).toHaveLength(1);
    expect(body.avisos[0]).toContain('Vendiste 3 "Galleta-E2E (Unidad)"');

    const lista = await request(app.getHttpServer())
      .get('/productos')
      .set('Authorization', `Bearer ${token}`);
    const p = (lista.body as ProductoResponseBody[]).find(
      (x) => x.id === (prod.body as WithId).id,
    )!;
    expect(Number(p.stock_total)).toBe(0);
    expect(Number(p.pendiente_total)).toBe(3);
    // Solo se listan los lotes con stock (el agotado ya no viene).
    expect(p.lotes_inventario).toHaveLength(0);
  });

  it('bajo concurrencia, nunca queda stock negativo: lo que falta queda como pendiente (regresión H1 + D-01)', async () => {
    const antes = await stockDisponible(); // 7 en este punto
    const CANTIDAD_POR_VENTA = 2;
    const NUM_REQUESTS = 5; // 5 × 2 = 10, más que los 7 disponibles

    const respuestas = await Promise.all(
      Array.from({ length: NUM_REQUESTS }, () =>
        request(app.getHttpServer())
          .post('/ventas')
          .set('Authorization', `Bearer ${token}`)
          .send({
            detalles: [
              { presentacion_id: presentacionId, cantidad: CANTIDAD_POR_VENTA },
            ],
          }),
      ),
    );

    // Ya no se rechaza nada: todas se venden.
    expect(respuestas.every((r) => r.status === 201)).toBe(true);
    // Con 7 en stock: tres ventas completas (6), una con 1 + 1 pendiente y una
    // con 2 pendientes → exactamente dos llevan aviso.
    const conAviso = respuestas.filter(
      (r) => (r.body as VentaResponseBody).avisos.length > 0,
    );
    expect(conAviso).toHaveLength(2);

    // El stock nunca es negativo y es exacto: se agotó y lo demás es deuda.
    const despues = await stockDisponible();
    expect(despues).toBe(0);
    const lista = await request(app.getHttpServer())
      .get('/productos')
      .set('Authorization', `Bearer ${token}`);
    const p = (lista.body as ProductoResponseBody[]).find((x) =>
      x.presentaciones.some((pr) => pr.id === presentacionId),
    )!;
    expect(Number(p.pendiente_total)).toBe(
      NUM_REQUESTS * CANTIDAD_POR_VENTA - antes,
    );
  });

  it('vende cantidades fraccionadas (media libra) y descuenta el lote en decimales (1.B)', async () => {
    // Producto propio con stock fraccionable, independiente del de arriba.
    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Granel-E2E' });
    const catId = (cat.body as WithId).id;

    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Queso-E2E', categoria_id: catId });
    const prodId = (prod.body as WithId).id;

    const pres = await request(app.getHttpServer())
      .post('/presentaciones')
      .set('Authorization', `Bearer ${token}`)
      .send({
        producto_id: prodId,
        descripcion: 'Libra',
        factor_conversion: 1,
        precio_venta: 4,
      });
    const presId = (pres.body as WithId).id;

    await request(app.getHttpServer())
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedor: 'Granel-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: prodId,
            costo_unitario_adquisicion: 2,
            cantidad_inicial: 3,
          },
        ],
      });

    // Vende media libra (0.5).
    const venta = await request(app.getHttpServer())
      .post('/ventas')
      .set('Authorization', `Bearer ${token}`)
      .send({ detalles: [{ presentacion_id: presId, cantidad: 0.5 }] });
    expect(venta.status).toBe(201);
    expect(Number((venta.body as VentaResponseBody).total)).toBeCloseTo(2); // 0.5 × 4

    // El lote de 3 quedó en 2.5.
    const res = await request(app.getHttpServer())
      .get('/productos')
      .set('Authorization', `Bearer ${token}`);
    const productos = res.body as ProductoResponseBody[];
    const p = productos.find((x) => x.id === prodId);
    const stock = (p?.lotes_inventario ?? []).reduce(
      (sum, l) => sum + Number(l.cantidad_disponible),
      0,
    );
    expect(stock).toBeCloseTo(2.5);
  });
});
