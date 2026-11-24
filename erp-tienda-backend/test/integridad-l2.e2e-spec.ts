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
interface ErrorBody {
  message: string | string[];
}
interface DetalleVenta {
  id: number;
  subtotal: string | number;
}
interface VentaBody {
  id: number;
  total: string | number;
  detalle_ventas: DetalleVenta[];
}
interface DevolucionBody {
  total_reembolsado: string | number;
  detalle_devoluciones: {
    subtotal_reembolsado: string | number;
    costo_revertido: string | number;
  }[];
}
interface ProductoBody {
  id: number;
  lotes_inventario: { id: number; cantidad_disponible: string | number }[];
}
interface CompraBody {
  id: number;
  lotes_inventario: { id: number }[];
}
interface TurnoActivo {
  efectivo_esperado: string | number;
}

/**
 * Lote L2 · Integridad de dinero y stock: idempotencia de POST /ventas,
 * redondeo por línea, devoluciones, ajustes concurrentes, límites de DTOs y
 * mensajes legibles. Cada bloque usa sus propios productos para no depender
 * del orden de ejecución.
 */
describe('Integridad de dinero y stock (e2e, lote L2)', () => {
  let app: INestApplication;
  let token: string;
  let categoriaId: number;

  // Producto "entero" (precio 10, costo 4, 100 uds) para idempotencia y stock.
  let productoEnteroId: number;
  let presEnteraId: number;
  // Producto "fraccionado" (precio 1.25, costo 0.3333, 100 uds).
  let presFracId: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  async function crearProducto(
    nombre: string,
    descripcion: string,
    precio: number,
    factor = 1,
  ) {
    const prod = await http()
      .post('/productos')
      .set(auth())
      .send({ nombre, categoria_id: categoriaId });
    const productoId = (prod.body as WithId).id;
    const pres = await http().post('/presentaciones').set(auth()).send({
      producto_id: productoId,
      descripcion,
      factor_conversion: factor,
      precio_venta: precio,
    });
    expect(pres.status).toBe(201);
    return { productoId, presentacionId: (pres.body as WithId).id };
  }

  async function comprar(
    productoId: number,
    cantidad: number,
    costo: number,
  ): Promise<number> {
    const res = await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'L2-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: costo,
            cantidad_inicial: cantidad,
          },
        ],
      });
    expect(res.status).toBe(201);
    const compra = await http()
      .get(`/compras/${(res.body as WithId).id}`)
      .set(auth());
    return (compra.body as CompraBody).lotes_inventario[0].id;
  }

  async function stockProducto(productoId: number): Promise<number> {
    const res = await http().get('/productos').set(auth());
    const p = (res.body as ProductoBody[]).find((x) => x.id === productoId);
    return (p?.lotes_inventario ?? []).reduce(
      (s, l) => s + Number(l.cantidad_disponible),
      0,
    );
  }

  async function efectivoEsperado(): Promise<number> {
    const res = await http().get('/cajas-turnos/activa').set(auth());
    return Number((res.body as TurnoActivo).efectivo_esperado ?? 0);
  }

  function mensaje(res: { body: unknown }): string {
    const m = (res.body as ErrorBody).message;
    return Array.isArray(m) ? m.join(' | ') : m;
  }

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await http()
      .post('/categorias')
      .set(auth())
      .send({ nombre: `L2-cat-${Date.now()}` });
    categoriaId = (cat.body as WithId).id;

    const entero = await crearProducto('Refresco-L2', 'Unidad', 10);
    productoEnteroId = entero.productoId;
    presEnteraId = entero.presentacionId;
    await comprar(productoEnteroId, 100, 4);

    const frac = await crearProducto('Granel-L2', 'Libra', 1.25);
    presFracId = frac.presentacionId;
    await comprar(frac.productoId, 100, 0.3333);

    await http()
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 0 });
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  // ───────────────────────── 1. Idempotencia ─────────────────────────
  describe('Idempotency-Key en POST /ventas', () => {
    const carrito = () => ({
      detalles: [{ presentacion_id: presEnteraId, cantidad: 2 }],
    });

    it('el mismo Idempotency-Key dos veces crea una sola venta', async () => {
      const stock0 = await stockProducto(productoEnteroId);
      const efectivo0 = await efectivoEsperado();
      const clave = 'clave-secuencial-0001';

      const r1 = await http()
        .post('/ventas')
        .set(auth())
        .set('Idempotency-Key', clave)
        .send(carrito());
      const r2 = await http()
        .post('/ventas')
        .set(auth())
        .set('Idempotency-Key', clave)
        .send(carrito());

      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      expect((r2.body as VentaBody).id).toBe((r1.body as VentaBody).id);
      expect((r2.body as VentaBody).detalle_ventas).toHaveLength(1);
      expect(await stockProducto(productoEnteroId)).toBe(stock0 - 2);
      expect(await efectivoEsperado()).toBeCloseTo(efectivo0 + 20);
    });

    it('el mismo Idempotency-Key en paralelo crea una sola venta', async () => {
      const stock0 = await stockProducto(productoEnteroId);
      const efectivo0 = await efectivoEsperado();
      const clave = 'clave-paralela-0002';

      const respuestas = await Promise.all(
        [1, 2, 3, 4].map(() =>
          http()
            .post('/ventas')
            .set(auth())
            .set('Idempotency-Key', clave)
            .send(carrito()),
        ),
      );

      respuestas.forEach((r) => expect(r.status).toBe(201));
      const ids = new Set(respuestas.map((r) => (r.body as VentaBody).id));
      expect(ids.size).toBe(1);
      expect(await stockProducto(productoEnteroId)).toBe(stock0 - 2);
      expect(await efectivoEsperado()).toBeCloseTo(efectivo0 + 20);
    });

    it('sin el header, dos envíos iguales crean dos ventas', async () => {
      const stock0 = await stockProducto(productoEnteroId);
      const r1 = await http().post('/ventas').set(auth()).send(carrito());
      const r2 = await http().post('/ventas').set(auth()).send(carrito());
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);
      expect((r2.body as VentaBody).id).not.toBe((r1.body as VentaBody).id);
      expect(await stockProducto(productoEnteroId)).toBe(stock0 - 4);
    });

    it('claves distintas crean ventas distintas', async () => {
      const r1 = await http()
        .post('/ventas')
        .set(auth())
        .set('Idempotency-Key', 'clave-distinta-A1')
        .send(carrito());
      const r2 = await http()
        .post('/ventas')
        .set(auth())
        .set('Idempotency-Key', 'clave-distinta-B2')
        .send(carrito());
      expect((r2.body as VentaBody).id).not.toBe((r1.body as VentaBody).id);
    });

    it('rechaza un Idempotency-Key demasiado corto o demasiado largo (400)', async () => {
      const corto = await http()
        .post('/ventas')
        .set(auth())
        .set('Idempotency-Key', 'abc')
        .send(carrito());
      expect(corto.status).toBe(400);
      expect(mensaje(corto)).toMatch(/Idempotency-Key/);

      const largo = await http()
        .post('/ventas')
        .set(auth())
        .set('Idempotency-Key', 'x'.repeat(65))
        .send(carrito());
      expect(largo.status).toBe(400);
    });
  });

  // ───────────────────────── 2. Redondeo ─────────────────────────
  describe('Redondeo por línea', () => {
    it('el total de la venta es la suma exacta de los subtotales guardados', async () => {
      const efectivo0 = await efectivoEsperado();
      const res = await http()
        .post('/ventas')
        .set(auth())
        .send({
          detalles: [
            { presentacion_id: presFracId, cantidad: 0.333 },
            { presentacion_id: presFracId, cantidad: 0.333 },
            { presentacion_id: presFracId, cantidad: 0.333 },
          ],
        });
      expect(res.status).toBe(201);
      const venta = res.body as VentaBody;
      // 0.333 × 1.25 = 0.41625 → 0.42 por línea (half-up) → total 1.26
      const subtotales = venta.detalle_ventas.map((d) => Number(d.subtotal));
      expect(subtotales).toEqual([0.42, 0.42, 0.42]);
      expect(Number(venta.total)).toBeCloseTo(1.26, 2);
      expect(await efectivoEsperado()).toBeCloseTo(efectivo0 + 1.26, 2);
    });

    it('devolver una línea en varias partes reembolsa exactamente su subtotal', async () => {
      // 0.333 × 1.25 → subtotal 0.42; se devuelve en 0.1 + 0.1 + 0.133.
      const venta = await http()
        .post('/ventas')
        .set(auth())
        .send({ detalles: [{ presentacion_id: presFracId, cantidad: 0.333 }] });
      const ventaId = (venta.body as VentaBody).id;
      const dvId = (venta.body as VentaBody).detalle_ventas[0].id;

      let reembolsado = 0;
      let costo = 0;
      for (const cantidad of [0.1, 0.1, 0.133]) {
        const dev = await http()
          .post(`/ventas/${ventaId}/devolucion`)
          .set(auth())
          .send({
            detalles: [
              { detalle_venta_id: dvId, cantidad, destino: 'REINGRESO' },
            ],
          });
        expect(dev.status).toBe(201);
        const body = dev.body as DevolucionBody;
        reembolsado += Number(
          body.detalle_devoluciones[0].subtotal_reembolsado,
        );
        costo += Number(body.detalle_devoluciones[0].costo_revertido);
      }
      expect(reembolsado).toBeCloseTo(0.42, 2);
      // Costo de la línea: 0.333 × 0.3333 = 0.1109889 → 0.11
      expect(costo).toBeCloseTo(0.11, 2);
    });

    it('devolver 1 de 3 y luego 2 de 3 suma el subtotal exacto', async () => {
      const venta = await http()
        .post('/ventas')
        .set(auth())
        .send({ detalles: [{ presentacion_id: presEnteraId, cantidad: 3 }] });
      const ventaId = (venta.body as VentaBody).id;
      const dvId = (venta.body as VentaBody).detalle_ventas[0].id;
      let total = 0;
      for (const cantidad of [1, 2]) {
        const dev = await http()
          .post(`/ventas/${ventaId}/devolucion`)
          .set(auth())
          .send({
            detalles: [
              { detalle_venta_id: dvId, cantidad, destino: 'REINGRESO' },
            ],
          });
        expect(dev.status).toBe(201);
        total += Number((dev.body as DevolucionBody).total_reembolsado);
      }
      expect(total).toBeCloseTo(30, 2);
    });
  });

  // ───────────────────────── 3. Línea repetida ─────────────────────────
  it('rechaza una devolución con la misma línea repetida (400)', async () => {
    const venta = await http()
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presEnteraId, cantidad: 3 }] });
    const ventaId = (venta.body as VentaBody).id;
    const dvId = (venta.body as VentaBody).detalle_ventas[0].id;
    const stock0 = await stockProducto(productoEnteroId);
    const efectivo0 = await efectivoEsperado();

    const dev = await http()
      .post(`/ventas/${ventaId}/devolucion`)
      .set(auth())
      .send({
        detalles: [
          { detalle_venta_id: dvId, cantidad: 2, destino: 'REINGRESO' },
          { detalle_venta_id: dvId, cantidad: 2, destino: 'REINGRESO' },
        ],
      });
    expect(dev.status).toBe(400);
    expect(mensaje(dev)).toMatch(/más de una vez|repet/i);
    expect(await stockProducto(productoEnteroId)).toBe(stock0);
    expect(await efectivoEsperado()).toBeCloseTo(efectivo0, 2);
  });

  // ───────────────────────── 5. Merma vs venta ─────────────────────────
  it('merma y venta concurrentes sobre el mismo lote: nunca queda negativo', async () => {
    const { productoId, presentacionId } = await crearProducto(
      'Concurrente-L2',
      'Unidad',
      3,
    );
    for (let i = 0; i < 6; i++) {
      const loteId = await comprar(productoId, 5, 1);
      const [venta, merma] = await Promise.all([
        http()
          .post('/ventas')
          .set(auth())
          .send({
            detalles: [{ presentacion_id: presentacionId, cantidad: 5 }],
          }),
        http().post('/ajustes-inventario').set(auth()).send({
          lote_id: loteId,
          cantidad_ajustada: 5,
          tipo_ajuste: 'QUEBRADO',
          justificacion: 'Prueba concurrente',
        }),
      ]);

      const exitos = [venta, merma].filter((r) => r.status === 201);
      const fallos = [venta, merma].filter((r) => r.status !== 201);
      expect(exitos).toHaveLength(1);
      expect(fallos).toHaveLength(1);
      expect(fallos[0].status).toBe(400);
      expect(mensaje(fallos[0])).toMatch(/No hay suficiente|supera/i);

      const res = await http().get('/productos').set(auth());
      const p = (res.body as ProductoBody[]).find((x) => x.id === productoId)!;
      const lote = p.lotes_inventario.find((l) => l.id === loteId)!;
      expect(Number(lote.cantidad_disponible)).toBe(0);
    }
  });

  // ───────────────────────── 6. Límites de DTOs ─────────────────────────
  describe('Límites en DTOs y parámetros', () => {
    it('un precio enorme da 400 y no 500', async () => {
      const res = await http().post('/presentaciones').set(auth()).send({
        producto_id: productoEnteroId,
        descripcion: 'Enorme',
        factor_conversion: 1,
        precio_venta: 99999999999,
      });
      expect(res.status).toBe(400);
    });

    it('un costo o cantidad enormes en una compra dan 400', async () => {
      const costo = await http()
        .post('/compras')
        .set(auth())
        .send({
          proveedor: 'L2',
          estado_pago: 'PAGADO',
          origen_fondos: 'CAPITAL_DUEÑOS',
          detalles_lotes: [
            {
              producto_id: productoEnteroId,
              costo_unitario_adquisicion: 1e12,
              cantidad_inicial: 1,
            },
          ],
        });
      expect(costo.status).toBe(400);

      const cantidad = await http()
        .post('/ventas')
        .set(auth())
        .send({
          detalles: [{ presentacion_id: presEnteraId, cantidad: 1e12 }],
        });
      expect(cantidad.status).toBe(400);
    });

    it('un monto con más de 2 decimales da 400', async () => {
      const res = await http()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'INGRESO_CAPITAL',
          monto: 1.234,
          descripcion: 'x',
        });
      expect(res.status).toBe(400);
    });

    it.each([
      '/ventas/abc',
      '/usuarios/abc',
      '/ajustes-inventario/abc',
      '/movimientos-financieros/abc',
      '/categorias-gastos/abc',
      '/productos/abc',
    ])('GET %s con id no numérico da 400', async (ruta) => {
      const res = await http().get(ruta).set(auth());
      expect(res.status).toBe(400);
    });

    it('PATCH /ventas/:id/anular exige justificación no vacía', async () => {
      const res = await http()
        .patch('/ventas/1/anular')
        .set(auth())
        .send({ justificacion_nula: '' });
      expect(res.status).toBe(400);
    });

    it('GET /movimientos-financieros valida limit (1–500)', async () => {
      expect(
        (await http().get('/movimientos-financieros?limit=0').set(auth()))
          .status,
      ).toBe(400);
      expect(
        (await http().get('/movimientos-financieros?limit=abc').set(auth()))
          .status,
      ).toBe(400);
      expect(
        (await http().get('/movimientos-financieros?limit=501').set(auth()))
          .status,
      ).toBe(400);
      expect(
        (await http().get('/movimientos-financieros?limit=5').set(auth()))
          .status,
      ).toBe(200);
    });

    it('rechaza una fecha de contingencia de hace más de 30 días', async () => {
      const vieja = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
      const res = await http()
        .post('/ventas')
        .set(auth())
        .send({
          fecha: vieja,
          detalles: [{ presentacion_id: presEnteraId, cantidad: 1 }],
        });
      expect(res.status).toBe(400);
      expect(mensaje(res)).toMatch(/30 días/);
    });

    it('un código de barras vacío se guarda como null (no choca con el índice único)', async () => {
      const p1 = await crearProducto('Barras-L2-a', 'Unidad', 1);
      const crear = (productoId: number) =>
        http().post('/presentaciones').set(auth()).send({
          producto_id: productoId,
          descripcion: 'Con barras vacío',
          factor_conversion: 1,
          precio_venta: 1,
          codigo_barras: '   ',
        });
      const a = await crear(p1.productoId);
      const b = await crear(p1.productoId);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect((a.body as { codigo_barras: string | null }).codigo_barras).toBe(
        null,
      );
    });
  });

  // ───────────────────────── 7. Mensaje de stock ─────────────────────────
  it('el mensaje de stock insuficiente nombra el producto y no muestra IDs', async () => {
    const { productoId, presentacionId } = await crearProducto(
      'Coca-Cola 355ml',
      'Six-pack',
      6,
      6,
    );
    await comprar(productoId, 42, 1); // 42 base = 7 six-packs

    const res = await http()
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 8 }] });
    expect(res.status).toBe(400);
    const msg = mensaje(res);
    expect(msg).toContain('Coca-Cola 355ml');
    expect(msg).toContain('Six-pack');
    expect(msg).toContain('quedan 7');
    expect(msg).toContain('vendiendo 8');
    expect(msg).not.toMatch(/ID/);
  });
});
