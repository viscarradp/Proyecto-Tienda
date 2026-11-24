import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
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
interface DetalleVentaBody {
  id: number;
  cantidad: string;
  subtotal: string;
}
interface VentaBody {
  id: number;
  total: string;
  avisos: string[];
  detalle_ventas: DetalleVentaBody[];
}
interface DevolucionBody {
  detalle_devoluciones: { costo_revertido: string }[];
}
interface ProductoBody {
  id: number;
  por_revisar: boolean;
  categorias: { nombre: string };
  presentaciones: {
    id: number;
    descripcion: string;
    factor_conversion: string;
    precio_venta: string;
    codigo_barras: string | null;
  }[];
  lotes_inventario: { id: number; cantidad_disponible: string }[];
  stock_total: string;
  pendiente_total: string;
}
interface ResultadosBody {
  costo_de_ventas_fifo: string;
  ingreso_bruto_ventas: string;
}
interface LoginBody {
  access_token: string;
}

/**
 * Lote L5a · Mostrador flexible ("apoyar, no imponer"):
 *  - D-03 venta por monto,
 *  - D-01 vender sin stock registrado (deuda de stock) y su resolución,
 *  - D-02 alta rápida por la cajera.
 * Cada caso usa sus propios productos para no depender del orden.
 */
describe('Mostrador flexible (e2e, lote L5a)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let categoriaId: number;

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  function mensaje(res: { body: unknown }): string {
    const m = (res.body as ErrorBody).message;
    return Array.isArray(m) ? m.join(' | ') : m;
  }

  async function crearProducto(
    nombre: string,
    precio: number,
    descripcion = 'Unidad',
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
    origen: 'CAPITAL_DUEÑOS' | 'CAJA_POS' = 'CAPITAL_DUEÑOS',
  ) {
    const res = await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'L5a-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: origen,
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: costo,
            cantidad_inicial: cantidad,
          },
        ],
      });
    expect(res.status).toBe(201);
    return res;
  }

  async function vender(
    presentacionId: number,
    linea: { cantidad?: number; monto?: number },
    t = token,
  ) {
    return http()
      .post('/ventas')
      .set(auth(t))
      .send({ detalles: [{ presentacion_id: presentacionId, ...linea }] });
  }

  async function producto(productoId: number): Promise<ProductoBody> {
    const res = await http().get('/productos').set(auth());
    return (res.body as ProductoBody[]).find((p) => p.id === productoId)!;
  }

  async function resultados(): Promise<ResultadosBody> {
    const res = await http()
      .get('/reportes/estado-resultados?desde=2020-01-01&hasta=2030-01-01')
      .set(auth());
    return res.body as ResultadosBody;
  }

  const pendientesDe = (productoId: number) =>
    prisma.pendientes_stock.findMany({
      where: { producto_id: productoId },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await http()
      .post('/categorias')
      .set(auth())
      .send({ nombre: `L5a-cat-${Date.now()}` });
    categoriaId = (cat.body as WithId).id;

    const turno = await http()
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 1000 });
    expect(turno.status).toBe(201);
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  // ───────────────────────── D-03 · venta por monto ─────────────────────────
  describe('Venta por monto (D-03)', () => {
    it('$1.00 de un producto a $3.50 → cantidad 0.286 y subtotal exacto 1.00', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Queso-monto',
        3.5,
        'Libra',
      );
      await comprar(productoId, 10, 2);

      const res = await vender(presentacionId, { monto: 1 });
      expect(res.status).toBe(201);
      const venta = res.body as VentaBody;
      expect(Number(venta.detalle_ventas[0].cantidad)).toBe(0.286);
      expect(Number(venta.detalle_ventas[0].subtotal)).toBe(1);
      expect(Number(venta.total)).toBe(1);
      expect(venta.avisos).toEqual([]);
      expect(Number((await producto(productoId)).stock_total)).toBeCloseTo(
        9.714,
        3,
      );
    });

    it('cantidad y monto a la vez, o ninguno → 400 claro', async () => {
      const { presentacionId } = await crearProducto('Queso-ambos', 3.5);
      const ambos = await vender(presentacionId, { cantidad: 1, monto: 1 });
      expect(ambos.status).toBe(400);
      expect(mensaje(ambos)).toMatch(/cantidad o por monto/i);

      const ninguno = await vender(presentacionId, {});
      expect(ninguno.status).toBe(400);
      expect(mensaje(ninguno)).toMatch(/cantidad o el monto/i);
    });

    it('monto fuera de rango o con más de 2 decimales → 400', async () => {
      const { presentacionId } = await crearProducto('Queso-rango', 3.5);
      expect((await vender(presentacionId, { monto: 0 })).status).toBe(400);
      expect((await vender(presentacionId, { monto: 1000000 })).status).toBe(
        400,
      );
      expect((await vender(presentacionId, { monto: 1.005 })).status).toBe(400);
    });

    it('un producto con precio $0 no se vende por monto', async () => {
      const { presentacionId } = await crearProducto('Regalo-sin-precio', 0);
      const res = await vender(presentacionId, { monto: 1 });
      expect(res.status).toBe(400);
      expect(mensaje(res)).toMatch(/sin precio/i);
    });
  });

  // ───────────────────── D-01 · venta sin stock registrado ─────────────────────
  describe('Venta sin stock registrado (D-01)', () => {
    it('vende, avisa, y el pendiente congela el costo del último lote; el P&L lo incluye', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Queso duro',
        4,
        'Libra',
      );
      await comprar(productoId, 2, 1); // lote viejo, costo 1.00
      await comprar(productoId, 3, 1.5); // lote más reciente, costo 1.50

      const antes = await resultados();
      const res = await vender(presentacionId, { cantidad: 6 });
      expect(res.status).toBe(201);
      const venta = res.body as VentaBody;
      expect(Number(venta.total)).toBe(24);
      expect(venta.avisos).toEqual([
        'Vendiste 1 "Queso duro (Libra)" sin stock registrado. Registra la compra o un conteo en Inventario.',
      ]);

      const [p] = await pendientesDe(productoId);
      expect(Number(p.cantidad_base)).toBe(1);
      expect(Number(p.cantidad_pendiente)).toBe(1);
      expect(Number(p.costo_unitario_estimado)).toBe(1.5);
      expect(p.resuelto_en).toBeNull();

      const prod = await producto(productoId);
      expect(Number(prod.stock_total)).toBe(0);
      expect(Number(prod.pendiente_total)).toBe(1);

      // Costo: 2×1.00 + 3×1.50 (FIFO) + 1×1.50 (estimado) = 8.00
      const despues = await resultados();
      expect(
        Number(despues.costo_de_ventas_fifo) -
          Number(antes.costo_de_ventas_fifo),
      ).toBeCloseTo(8, 2);
      expect(
        Number(despues.ingreso_bruto_ventas) -
          Number(antes.ingreso_bruto_ventas),
      ).toBeCloseTo(24, 2);
    });

    it('un producto que nunca tuvo lotes queda con costo 0 y aviso de "sin costo"', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Queso fresco',
        3,
        'Libra',
      );
      const res = await vender(presentacionId, { cantidad: 2 });
      expect(res.status).toBe(201);
      const avisos = (res.body as VentaBody).avisos;
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toContain('"Queso fresco (Libra)"');
      expect(avisos[0]).toMatch(/no tiene costo registrado/);
      expect(avisos[0]).toMatch(/ganancia/);

      const [p] = await pendientesDe(productoId);
      expect(Number(p.costo_unitario_estimado)).toBe(0);
    });

    it('la compra posterior cubre los pendientes del más viejo al más nuevo, sin tocar el costo ya congelado', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Resolver-compra',
        5,
      );
      await comprar(productoId, 1, 2);
      const venta = (await vender(presentacionId, { cantidad: 4 }))
        .body as VentaBody; // 1 de lote + 3 pendientes a costo 2
      const lotesVentaAntes = await prisma.detalle_venta_lotes.count({
        where: { detalle_venta_id: venta.detalle_ventas[0].id },
      });
      const costoAntes = Number((await resultados()).costo_de_ventas_fifo);

      // Compra que NO alcanza (2 de 3): queda resuelto en parte.
      await comprar(productoId, 2, 3);
      let [p] = await pendientesDe(productoId);
      expect(Number(p.cantidad_pendiente)).toBe(1);
      expect(Number(p.cantidad_base)).toBe(3);
      expect(p.resuelto_en).toBeNull();
      expect(p.lote_resuelto_id).not.toBeNull();
      let prod = await producto(productoId);
      expect(Number(prod.stock_total)).toBe(0);
      expect(Number(prod.pendiente_total)).toBe(1);

      // Compra que sí alcanza: el pendiente se cierra y el lote queda con el resto.
      await comprar(productoId, 5, 3);
      [p] = await pendientesDe(productoId);
      expect(Number(p.cantidad_pendiente)).toBe(0);
      expect(p.resuelto_en).not.toBeNull();
      prod = await producto(productoId);
      expect(Number(prod.stock_total)).toBe(4); // 5 − 1
      expect(Number(prod.pendiente_total)).toBe(0);

      // No se crearon descargas de lote nuevas y el costo de la venta no se movió.
      expect(
        await prisma.detalle_venta_lotes.count({
          where: { detalle_venta_id: venta.detalle_ventas[0].id },
        }),
      ).toBe(lotesVentaAntes);
      // (las compras no son costo de ventas; el costo de esta venta sigue en 1×2 + 3×2 = 8)
      expect(Number((await resultados()).costo_de_ventas_fifo)).toBeCloseTo(
        costoAntes,
        2,
      );
    });

    it('un sobrante de conteo sobre un lote cubre los pendientes abiertos', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Resolver-conteo',
        5,
      );
      await comprar(productoId, 2, 1);
      const lote = (await producto(productoId)).lotes_inventario[0];
      await vender(presentacionId, { cantidad: 2 }); // agota el lote
      await vender(presentacionId, { cantidad: 3 }); // 3 pendientes

      const ajuste = await http().post('/ajustes-inventario').set(auth()).send({
        lote_id: lote.id,
        cantidad_ajustada: 2,
        tipo_ajuste: 'CONTEO_SOBRANTE',
        justificacion: 'Apareció stock',
      });
      expect(ajuste.status).toBe(201);

      const prod = await producto(productoId);
      expect(Number(prod.pendiente_total)).toBe(1);
      expect(Number(prod.stock_total)).toBe(0);
    });

    it('anular con pendiente abierto lo cancela', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Anular-abierto',
        2,
      );
      const venta = (await vender(presentacionId, { cantidad: 2 }))
        .body as VentaBody;

      const anular = await http()
        .patch(`/ventas/${venta.id}/anular`)
        .set(auth())
        .send({ justificacion_nula: 'Error de la cajera' });
      expect(anular.status).toBe(200);

      const [p] = await pendientesDe(productoId);
      expect(Number(p.cantidad_pendiente)).toBe(0);
      expect(p.resuelto_en).not.toBeNull();
      const prod = await producto(productoId);
      expect(Number(prod.pendiente_total)).toBe(0);
      expect(Number(prod.stock_total)).toBe(0);
    });

    it('anular con pendiente ya resuelto devuelve las unidades al lote que lo cubrió', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Anular-resuelto',
        2,
      );
      await comprar(productoId, 1, 1);
      const venta = (await vender(presentacionId, { cantidad: 3 }))
        .body as VentaBody; // 1 de lote + 2 pendientes
      await comprar(productoId, 5, 1); // cubre los 2 → lote nuevo en 3
      expect(Number((await producto(productoId)).stock_total)).toBe(3);

      const anular = await http()
        .patch(`/ventas/${venta.id}/anular`)
        .set(auth())
        .send({ justificacion_nula: 'Cliente se arrepintió' });
      expect(anular.status).toBe(200);

      const prod = await producto(productoId);
      // 1 vuelve al lote viejo y 2 al que cubrió el pendiente: 1 + 5.
      expect(Number(prod.stock_total)).toBe(6);
      expect(Number(prod.pendiente_total)).toBe(0);
    });

    it('devolución REINGRESO baja el pendiente abierto; MERMA no lo cambia', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Devolver-pendiente',
        4,
      );
      await comprar(productoId, 1, 2);
      const venta = (await vender(presentacionId, { cantidad: 5 }))
        .body as VentaBody; // 1 de lote + 4 pendientes a costo 2 → costo línea 10
      const dvId = venta.detalle_ventas[0].id;

      const merma = await http()
        .post(`/ventas/${venta.id}/devolucion`)
        .set(auth())
        .send({
          detalles: [{ detalle_venta_id: dvId, cantidad: 1, destino: 'MERMA' }],
        });
      expect(merma.status).toBe(201);
      let [p] = await pendientesDe(productoId);
      expect(Number(p.cantidad_pendiente)).toBe(4);
      // costo_revertido proporcional sobre TODO el costo de la línea (10 / 5).
      expect(
        Number(
          (merma.body as DevolucionBody).detalle_devoluciones[0]
            .costo_revertido,
        ),
      ).toBe(2);

      const reingreso = await http()
        .post(`/ventas/${venta.id}/devolucion`)
        .set(auth())
        .send({
          detalles: [
            { detalle_venta_id: dvId, cantidad: 2, destino: 'REINGRESO' },
          ],
        });
      expect(reingreso.status).toBe(201);
      // Proporcional a la línea (2 de 5 = 40 %) sobre lo que faltó (4): 1.6.
      [p] = await pendientesDe(productoId);
      expect(Number(p.cantidad_pendiente)).toBeCloseTo(2.4, 3);
      expect(
        Number(
          (reingreso.body as DevolucionBody).detalle_devoluciones[0]
            .costo_revertido,
        ),
      ).toBe(4);
    });

    it('devolución REINGRESO de un pendiente ya resuelto vuelve al lote que lo cubrió', async () => {
      const { productoId, presentacionId } = await crearProducto(
        'Devolver-resuelto',
        4,
      );
      const venta = (await vender(presentacionId, { cantidad: 3 }))
        .body as VentaBody; // 3 pendientes (nunca hubo lotes)
      await comprar(productoId, 10, 1); // cubre los 3 → lote en 7
      expect(Number((await producto(productoId)).stock_total)).toBe(7);

      const dev = await http()
        .post(`/ventas/${venta.id}/devolucion`)
        .set(auth())
        .send({
          detalles: [
            {
              detalle_venta_id: venta.detalle_ventas[0].id,
              cantidad: 3,
              destino: 'REINGRESO',
            },
          ],
        });
      expect(dev.status).toBe(201);
      expect(Number((await producto(productoId)).stock_total)).toBe(10);
    });

    it('una compra que resuelve pendientes y la anulación de esa venta en paralelo no se traban y dejan el stock coherente', async () => {
      for (let i = 0; i < 6; i++) {
        const { productoId, presentacionId } = await crearProducto(
          `Concurrente-L5a-${i}`,
          3,
        );
        const venta = (await vender(presentacionId, { cantidad: 3 }))
          .body as VentaBody; // 3 pendientes, nunca hubo lotes

        const [compra, anular] = await Promise.all([
          http()
            .post('/compras')
            .set(auth())
            .send({
              proveedor: 'L5a-concurrente',
              estado_pago: 'PAGADO',
              origen_fondos: 'CAJA_POS', // toma el lock del turno, como la anulación
              detalles_lotes: [
                {
                  producto_id: productoId,
                  costo_unitario_adquisicion: 1,
                  cantidad_inicial: 5,
                },
              ],
            }),
          http()
            .patch(`/ventas/${venta.id}/anular`)
            .set(auth())
            .send({ justificacion_nula: 'Prueba concurrente' }),
        ]);
        expect(compra.status).toBe(201);
        expect(anular.status).toBe(200);

        const prod = await producto(productoId);
        // Sea cual sea el orden, los 5 de la compra quedan íntegros.
        expect(Number(prod.stock_total)).toBe(5);
        expect(Number(prod.pendiente_total)).toBe(0);
        const filas = await pendientesDe(productoId);
        expect(filas.every((f) => Number(f.cantidad_pendiente) === 0)).toBe(
          true,
        );
      }
    });
  });

  // ───────────────────────── D-02 · alta rápida ─────────────────────────
  describe('Alta rápida por la cajera (D-02)', () => {
    let tokenCajero: string;

    beforeAll(async () => {
      const nombre = `cajera-l5a-${Date.now()}`;
      const crear = await http()
        .post('/usuarios')
        .set(auth())
        .send({ nombre, rol: 'CAJERO', password: 'cajera-l5a-123' });
      expect(crear.status).toBe(201);
      const login = await http()
        .post('/auth/login')
        .send({ nombre, password: 'cajera-l5a-123' });
      tokenCajero = (login.body as LoginBody).access_token;
    });

    it('una CAJERO da de alta un producto: queda por revisar y se vende de inmediato', async () => {
      const res = await http()
        .post('/productos/rapido')
        .set(auth(tokenCajero))
        .send({
          nombre: '  Galleta suelta  ',
          precio_venta: 0.25,
          codigo_barras: 'L5A-111',
        });
      expect(res.status).toBe(201);
      const prod = res.body as ProductoBody;
      expect(prod.por_revisar).toBe(true);
      expect(prod.categorias.nombre).toBe('Por revisar');
      expect(prod.presentaciones).toHaveLength(1);
      expect(prod.presentaciones[0].descripcion).toBe('Unidad');
      expect(Number(prod.presentaciones[0].factor_conversion)).toBe(1);
      expect(Number(prod.presentaciones[0].precio_venta)).toBe(0.25);
      expect(prod.presentaciones[0].codigo_barras).toBe('L5A-111');

      // Se vende enseguida (sin stock): pendiente con costo 0.
      const venta = await vender(
        prod.presentaciones[0].id,
        { cantidad: 4 },
        tokenCajero,
      );
      expect(venta.status).toBe(201);
      expect((venta.body as VentaBody).avisos[0]).toMatch(/no tiene costo/);
      const [p] = await pendientesDe(prod.id);
      expect(Number(p.costo_unitario_estimado)).toBe(0);

      // Aparece en el listado con la marca; la categoría se reutiliza.
      const listado = await producto(prod.id);
      expect(listado.por_revisar).toBe(true);
      const otro = await http()
        .post('/productos/rapido')
        .set(auth(tokenCajero))
        .send({ nombre: 'Chicle suelto', precio_venta: 0.1 });
      expect(otro.status).toBe(201);
      expect((otro.body as ProductoBody).presentaciones[0].codigo_barras).toBe(
        null,
      );
      const categorias = await prisma.categorias.count({
        where: { nombre: 'Por revisar' },
      });
      expect(categorias).toBe(1);
    });

    it('código de barras repetido → 409 con el nombre del producto; precio 0 → 400', async () => {
      const dup = await http()
        .post('/productos/rapido')
        .set(auth(tokenCajero))
        .send({
          nombre: 'Otra galleta',
          precio_venta: 1,
          codigo_barras: 'L5A-111',
        });
      expect(dup.status).toBe(409);
      expect(mensaje(dup)).toBe(
        'Ese código de barras ya es de «Galleta suelta»',
      );

      const cero = await http()
        .post('/productos/rapido')
        .set(auth(tokenCajero))
        .send({ nombre: 'Gratis', precio_venta: 0 });
      expect(cero.status).toBe(400);
    });

    it('solo ADMIN puede marcarlo como revisado (PATCH por_revisar:false)', async () => {
      const res = await http()
        .post('/productos/rapido')
        .set(auth(tokenCajero))
        .send({ nombre: 'Para revisar', precio_venta: 2 });
      const id = (res.body as ProductoBody).id;

      const cajera = await http()
        .patch(`/productos/${id}`)
        .set(auth(tokenCajero))
        .send({ por_revisar: false });
      expect(cajera.status).toBe(403);

      const admin = await http()
        .patch(`/productos/${id}`)
        .set(auth())
        .send({ por_revisar: false });
      expect(admin.status).toBe(200);
      expect((await producto(id)).por_revisar).toBe(false);
    });
  });
});
