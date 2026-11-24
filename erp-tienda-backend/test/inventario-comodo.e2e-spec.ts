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
interface ProductoBody {
  id: number;
  activo: boolean;
  presentaciones: { id: number; descripcion: string }[];
  stock_total: string;
}
interface LoginBody {
  access_token: string;
}
interface BorradoBody {
  desactivado: boolean;
}

/**
 * Lote L11 · Inventario cómodo: alta atómica, desactivar en vez de borrar,
 * mermas de la cajera y sobrante de conteo sin lote con stock.
 */
describe('Inventario cómodo (e2e, lote L11)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let tokenCajero: string;
  let categoriaId: number;
  const sufijo = Date.now();

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());

  function mensaje(res: { body: unknown }): string {
    const m = (res.body as ErrorBody).message;
    return Array.isArray(m) ? m.join(' | ') : m;
  }

  async function crearProducto(nombre: string, precio = 2) {
    const res = await http()
      .post('/productos')
      .set(auth())
      .send({
        nombre,
        categoria_id: categoriaId,
        presentaciones: [
          { descripcion: 'Unidad', factor_conversion: 1, precio_venta: precio },
        ],
      });
    expect(res.status).toBe(201);
    const body = res.body as ProductoBody;
    return { productoId: body.id, presentacionId: body.presentaciones[0].id };
  }

  async function comprar(productoId: number, cantidad: number, costo: number) {
    const res = await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'L11-E2E',
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
  }

  async function catalogo(query = '', t = token): Promise<ProductoBody[]> {
    const res = await http().get(`/productos${query}`).set(auth(t));
    expect(res.status).toBe(200);
    return res.body as ProductoBody[];
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await http()
      .post('/categorias')
      .set(auth())
      .send({ nombre: `L11-cat-${sufijo}` });
    categoriaId = (cat.body as WithId).id;

    const nombre = `cajera-l11-${sufijo}`;
    const crear = await http()
      .post('/usuarios')
      .set(auth())
      .send({ nombre, rol: 'CAJERO', password: 'cajera-l11-123' });
    expect(crear.status).toBe(201);
    const login = await http()
      .post('/auth/login')
      .send({ nombre, password: 'cajera-l11-123' });
    tokenCajero = (login.body as LoginBody).access_token;
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  describe('Alta atómica de producto (UX-17 / COD-25)', () => {
    it('con todo bien crea el producto y sus presentaciones', async () => {
      const res = await http()
        .post('/productos')
        .set(auth())
        .send({
          nombre: `Atomico-ok-${sufijo}`,
          categoria_id: categoriaId,
          presentaciones: [
            {
              descripcion: 'Unidad',
              factor_conversion: 1,
              precio_venta: 1.25,
              codigo_barras: `L11-OK-${sufijo}`,
            },
            {
              descripcion: 'Fardo de 12',
              factor_conversion: 12,
              precio_venta: 13,
            },
          ],
        });
      expect(res.status).toBe(201);
      expect((res.body as ProductoBody).presentaciones).toHaveLength(2);
    });

    it('un código de barras repetido da 409 y no se crea nada', async () => {
      const codigo = `L11-DUP-${sufijo}`;
      await crearConCodigo(`Atomico-base-${sufijo}`, codigo);

      const nombre = `Atomico-dup-${sufijo}`;
      const res = await http()
        .post('/productos')
        .set(auth())
        .send({
          nombre,
          categoria_id: categoriaId,
          presentaciones: [
            { descripcion: 'Unidad', factor_conversion: 1, precio_venta: 1 },
            {
              descripcion: 'Caja',
              factor_conversion: 6,
              precio_venta: 5,
              codigo_barras: codigo,
            },
          ],
        });
      expect(res.status).toBe(409);
      expect(mensaje(res)).toMatch(/Ese código de barras ya es de/);
      expect(await prisma.productos.count({ where: { nombre } })).toBe(0);
    });

    it('el mismo código en dos presentaciones del cuerpo da 409', async () => {
      const nombre = `Atomico-dup2-${sufijo}`;
      const res = await http()
        .post('/productos')
        .set(auth())
        .send({
          nombre,
          categoria_id: categoriaId,
          presentaciones: [
            {
              descripcion: 'A',
              factor_conversion: 1,
              precio_venta: 1,
              codigo_barras: `L11-SAME-${sufijo}`,
            },
            {
              descripcion: 'B',
              factor_conversion: 2,
              precio_venta: 2,
              codigo_barras: `L11-SAME-${sufijo}`,
            },
          ],
        });
      expect(res.status).toBe(409);
      expect(await prisma.productos.count({ where: { nombre } })).toBe(0);
    });

    it('una presentación inválida da 400 y no se crea nada', async () => {
      const nombre = `Atomico-malo-${sufijo}`;
      const res = await http()
        .post('/productos')
        .set(auth())
        .send({
          nombre,
          categoria_id: categoriaId,
          presentaciones: [
            { descripcion: 'Unidad', factor_conversion: 1, precio_venta: 1 },
            { descripcion: 'Rota', factor_conversion: 0, precio_venta: 1 },
          ],
        });
      expect(res.status).toBe(400);
      expect(await prisma.productos.count({ where: { nombre } })).toBe(0);
    });

    async function crearConCodigo(nombre: string, codigo: string) {
      const res = await http()
        .post('/productos')
        .set(auth())
        .send({
          nombre,
          categoria_id: categoriaId,
          presentaciones: [
            {
              descripcion: 'Unidad',
              factor_conversion: 1,
              precio_venta: 1,
              codigo_barras: codigo,
            },
          ],
        });
      expect(res.status).toBe(201);
    }
  });

  describe('Desactivar en vez de borrar (ARQ-16)', () => {
    it('un producto con ventas se desactiva, sale de GET /productos y se reactiva', async () => {
      const { productoId, presentacionId } = await crearProducto(
        `Con-ventas-${sufijo}`,
      );
      await comprar(productoId, 5, 1);
      const turno = await http()
        .post('/cajas-turnos/abrir')
        .set(auth())
        .send({ fondo_inicial: 100 });
      expect(turno.status).toBe(201);
      const venta = await http()
        .post('/ventas')
        .set(auth())
        .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 1 }] });
      expect(venta.status).toBe(201);
      await ensureNoOpenShift(app, token);

      const del = await http().delete(`/productos/${productoId}`).set(auth());
      expect(del.status).toBe(200);
      expect((del.body as BorradoBody).desactivado).toBe(true);
      expect(await prisma.productos.count({ where: { id: productoId } })).toBe(
        1,
      );

      expect((await catalogo()).some((p) => p.id === productoId)).toBe(false);
      const todos = await catalogo('?incluir_inactivos=true');
      expect(todos.find((p) => p.id === productoId)?.activo).toBe(false);
      // La cajera no ve inactivos aunque lo pida.
      expect(
        (await catalogo('?incluir_inactivos=true', tokenCajero)).some(
          (p) => p.id === productoId,
        ),
      ).toBe(false);

      const react = await http()
        .patch(`/productos/${productoId}/reactivar`)
        .set(auth());
      expect(react.status).toBe(200);
      expect((await catalogo()).some((p) => p.id === productoId)).toBe(true);

      const reactCajera = await http()
        .patch(`/productos/${productoId}/reactivar`)
        .set(auth(tokenCajero));
      expect(reactCajera.status).toBe(403);
    });

    it('un producto sin historial se borra de verdad (con sus presentaciones)', async () => {
      const { productoId } = await crearProducto(`Sin-historial-${sufijo}`);
      const del = await http().delete(`/productos/${productoId}`).set(auth());
      expect(del.status).toBe(200);
      expect((del.body as BorradoBody).desactivado).toBe(false);
      expect(await prisma.productos.count({ where: { id: productoId } })).toBe(
        0,
      );
      expect(
        await prisma.presentaciones.count({
          where: { producto_id: productoId },
        }),
      ).toBe(0);
    });

    it('la cajera no puede borrar ni desactivar (403)', async () => {
      const { productoId } = await crearProducto(`Cajera-no-${sufijo}`);
      const del = await http()
        .delete(`/productos/${productoId}`)
        .set(auth(tokenCajero));
      expect(del.status).toBe(403);
    });
  });

  describe('Uso de la presentación (NEG-17)', () => {
    it('cuenta las líneas de venta de la presentación', async () => {
      const { productoId, presentacionId } = await crearProducto(
        `Uso-pres-${sufijo}`,
      );
      const antes = await http()
        .get(`/presentaciones/${presentacionId}/uso`)
        .set(auth());
      expect(antes.body).toEqual({
        presentacion_id: presentacionId,
        ventas: 0,
      });

      await comprar(productoId, 3, 1);
      await http()
        .post('/cajas-turnos/abrir')
        .set(auth())
        .send({ fondo_inicial: 50 });
      await http()
        .post('/ventas')
        .set(auth())
        .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 1 }] });
      await ensureNoOpenShift(app, token);

      const despues = await http()
        .get(`/presentaciones/${presentacionId}/uso`)
        .set(auth());
      expect(despues.body).toEqual({
        presentacion_id: presentacionId,
        ventas: 1,
      });
    });
  });

  describe('Mermas de la cajera (NEG-16 / UX-20)', () => {
    it('merma con motivo → 201; sin motivo → 400; conteo → 403', async () => {
      const { productoId } = await crearProducto(`Merma-cajera-${sufijo}`);
      await comprar(productoId, 10, 1);
      const lote = await prisma.lotes_inventario.findFirstOrThrow({
        where: { producto_id: productoId },
      });

      const ok = await http()
        .post('/ajustes-inventario')
        .set(auth(tokenCajero))
        .send({
          lote_id: lote.id,
          cantidad_ajustada: 2,
          tipo_ajuste: 'QUEBRADO',
          justificacion: 'Se cayó al piso',
        });
      expect(ok.status).toBe(201);

      const sinMotivo = await http()
        .post('/ajustes-inventario')
        .set(auth(tokenCajero))
        .send({
          lote_id: lote.id,
          cantidad_ajustada: 1,
          tipo_ajuste: 'VENCIDO',
        });
      expect(sinMotivo.status).toBe(400);
      expect(mensaje(sinMotivo)).toMatch(/motivo/i);

      const soloEspacios = await http()
        .post('/ajustes-inventario')
        .set(auth(tokenCajero))
        .send({
          lote_id: lote.id,
          cantidad_ajustada: 1,
          tipo_ajuste: 'ROBO',
          justificacion: '   ',
        });
      expect(soloEspacios.status).toBe(400);

      for (const tipo of ['CONTEO', 'CONTEO_SOBRANTE']) {
        const conteo = await http()
          .post('/ajustes-inventario')
          .set(auth(tokenCajero))
          .send({
            lote_id: lote.id,
            cantidad_ajustada: 1,
            tipo_ajuste: tipo,
            justificacion: 'conteo',
          });
        expect(conteo.status).toBe(403);
        expect(mensaje(conteo)).toBe('Esto lo hace la dueña (administradora).');
      }

      const quedan = await prisma.lotes_inventario.findUniqueOrThrow({
        where: { id: lote.id },
      });
      expect(Number(quedan.cantidad_disponible)).toBe(8);
      // La merma queda con autor.
      const ajuste = await prisma.ajustes_inventario.findFirstOrThrow({
        where: { lote_id: lote.id },
        include: { usuarios: true },
      });
      expect(ajuste.usuarios?.nombre).toContain('cajera-l11');
    });

    it('la cajera no puede leer la lista de ajustes (solo ADMIN)', async () => {
      const res = await http()
        .get('/ajustes-inventario')
        .set(auth(tokenCajero));
      expect(res.status).toBe(403);
    });
  });

  describe('Conteo sobrante por producto (NEG-16)', () => {
    it('suma al lote más reciente aunque esté en 0 y cubre pendientes abiertos', async () => {
      const { productoId, presentacionId } = await crearProducto(
        `Sobrante-prod-${sufijo}`,
        4,
      );
      await comprar(productoId, 2, 1); // lote viejo
      await comprar(productoId, 2, 1.5); // lote reciente
      await http()
        .post('/cajas-turnos/abrir')
        .set(auth())
        .send({ fondo_inicial: 100 });
      // Agota todo y deja 3 pendientes (vende 7 de 4).
      const venta = await http()
        .post('/ventas')
        .set(auth())
        .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 7 }] });
      expect(venta.status).toBe(201);
      await ensureNoOpenShift(app, token);

      const lotes = await prisma.lotes_inventario.findMany({
        where: { producto_id: productoId },
        orderBy: [{ fecha_ingreso: 'desc' }, { id: 'desc' }],
      });
      expect(lotes.every((l) => Number(l.cantidad_disponible) === 0)).toBe(
        true,
      );
      const masReciente = lotes[0];

      const res = await http().post('/ajustes-inventario').set(auth()).send({
        producto_id: productoId,
        cantidad_ajustada: 5,
        tipo_ajuste: 'CONTEO_SOBRANTE',
        justificacion: 'Apareció en la bodega',
      });
      expect(res.status).toBe(201);
      expect((res.body as { lote_id: number }).lote_id).toBe(masReciente.id);

      // 5 sumados: 3 cubren los pendientes y quedan 2.
      const lote = await prisma.lotes_inventario.findUniqueOrThrow({
        where: { id: masReciente.id },
      });
      expect(Number(lote.cantidad_disponible)).toBe(2);
      const pendientes = await prisma.pendientes_stock.findMany({
        where: { producto_id: productoId },
      });
      expect(pendientes).toHaveLength(1);
      expect(Number(pendientes[0].cantidad_pendiente)).toBe(0);
      expect(pendientes[0].resuelto_en).not.toBeNull();
    });

    it('un producto que nunca tuvo lotes → 400 claro', async () => {
      const { productoId } = await crearProducto(`Sin-lotes-${sufijo}`);
      const res = await http().post('/ajustes-inventario').set(auth()).send({
        producto_id: productoId,
        cantidad_ajustada: 1,
        tipo_ajuste: 'CONTEO_SOBRANTE',
      });
      expect(res.status).toBe(400);
      expect(mensaje(res)).toBe(
        'Registra una compra o el inventario inicial de este producto',
      );
    });

    it('producto_id con una merma, o sin lote ni producto → 400', async () => {
      const { productoId } = await crearProducto(`Merma-prod-${sufijo}`);
      const merma = await http().post('/ajustes-inventario').set(auth()).send({
        producto_id: productoId,
        cantidad_ajustada: 1,
        tipo_ajuste: 'QUEBRADO',
      });
      expect(merma.status).toBe(400);
      const nada = await http().post('/ajustes-inventario').set(auth()).send({
        cantidad_ajustada: 1,
        tipo_ajuste: 'CONTEO_SOBRANTE',
      });
      expect(nada.status).toBe(400);
    });
  });
});
