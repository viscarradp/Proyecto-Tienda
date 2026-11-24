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
interface VentaBody {
  id: number;
  avisos: string[];
}
interface CompraBody {
  id: number;
  monto_total: string;
  avisos?: string[];
  lotes_inventario?: unknown[];
}
interface ProductoBody {
  id: number;
  stock_total: string;
  pendiente_total: string;
}

/**
 * ARQ-19 · Caminos de compras que no tenían prueba: una compra con lotes de
 * varios productos (un solo pago por el total), una compra desde la bóveda sin
 * saldo (queda el asiento y el aviso) y una compra que cubre la deuda de stock
 * de DOS ventas, de la más vieja a la más nueva.
 *
 * (TRASLADO_DESDE_BOVEDA sin turno y el egreso sin categoría → "Otros" ya los
 * cubre politica-fondos.e2e-spec.ts.)
 */
describe('Compras y deuda de stock (e2e, ARQ-19)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  const sufijo = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${admin}` });

  async function crearProducto(nombre: string, precio: number) {
    const cat = await http()
      .post('/categorias')
      .set(auth())
      .send({ nombre: `ComprasMov-cat-${nombre}-${sufijo}` });
    const prod = await http()
      .post('/productos')
      .set(auth())
      .send({
        nombre: `ComprasMov-${nombre}-${sufijo}`,
        categoria_id: (cat.body as WithId).id,
      });
    const productoId = (prod.body as WithId).id;
    const pres = await http().post('/presentaciones').set(auth()).send({
      producto_id: productoId,
      descripcion: 'Unidad',
      factor_conversion: 1,
      precio_venta: precio,
    });
    expect(pres.status).toBe(201);
    return { productoId, presentacionId: (pres.body as WithId).id };
  }

  async function producto(productoId: number): Promise<ProductoBody> {
    const res = await http().get('/productos').set(auth());
    return (res.body as ProductoBody[]).find((p) => p.id === productoId)!;
  }

  async function saldoBoveda(): Promise<number> {
    const res = await http().get('/caja-general/saldo').set(auth());
    return Number((res.body as { saldo_actual: string }).saldo_actual);
  }

  async function abrirTurno(): Promise<number> {
    const ult = await http().get('/cajas-turnos/ultimo-cierre').set(auth());
    const remanente = Number(
      (ult.body as { fondo_siguiente: string }).fondo_siguiente,
    );
    const res = await http()
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: remanente + 50, origen_diferencia: 'APORTE' });
    expect(res.status).toBe(201);
    return (res.body as WithId).id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginAsAdmin(app);
    await ensureNoOpenShift(app, admin);
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, admin);
    await app.close();
  });

  it('una compra con lotes de varios productos crea un lote por línea y un solo pago por el total', async () => {
    const a = await crearProducto('Multi-A', 5);
    const b = await crearProducto('Multi-B', 5);
    const c = await crearProducto('Multi-C', 5);
    const turnoId = await abrirTurno();
    const antes = Number(
      (
        (await http().get('/cajas-turnos/activa').set(auth()))
          .body as ProductoBody & { efectivo_esperado: string }
      ).efectivo_esperado,
    );

    const res = await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: `Multi-${sufijo}`,
        estado_pago: 'PAGADO',
        origen_fondos: 'CAJA_POS',
        // El monto del cliente se ignora: el total sale de los lotes.
        monto_total: 999,
        detalles_lotes: [
          {
            producto_id: a.productoId,
            costo_unitario_adquisicion: 1.25,
            cantidad_inicial: 4,
          },
          {
            producto_id: b.productoId,
            costo_unitario_adquisicion: 2,
            cantidad_inicial: 3,
          },
          {
            producto_id: c.productoId,
            costo_unitario_adquisicion: 0.5,
            cantidad_inicial: 10,
            fecha_vencimiento: '2030-01-01',
          },
        ],
      });
    expect(res.status).toBe(201);
    const compra = res.body as CompraBody;
    // 4×1.25 + 3×2 + 10×0.5 = 5 + 6 + 5 = 16
    expect(Number(compra.monto_total)).toBe(16);

    // Un lote por producto, con su cantidad y costo.
    const lotes = await prisma.lotes_inventario.findMany({
      where: {
        producto_id: { in: [a.productoId, b.productoId, c.productoId] },
      },
      orderBy: { producto_id: 'asc' },
    });
    expect(lotes).toHaveLength(3);
    expect(lotes.map((l) => Number(l.cantidad_disponible))).toEqual([4, 3, 10]);
    expect(lotes.map((l) => Number(l.costo_unitario_adquisicion))).toEqual([
      1.25, 2, 0.5,
    ]);
    expect(
      await prisma.lotes_inventario.count({ where: { compra_id: compra.id } }),
    ).toBe(3);

    // Un solo PAGO_PROVEEDOR GAVETA→PROVEEDOR por el total, ligado al turno.
    const pagos = await prisma.movimientos_financieros.findMany({
      where: { caja_turno_id: turnoId, tipo_movimiento: 'PAGO_PROVEEDOR' },
    });
    expect(pagos).toHaveLength(1);
    expect(Number(pagos[0].monto)).toBe(16);
    expect(pagos[0].cuenta_origen).toBe('GAVETA');
    expect(pagos[0].cuenta_destino).toBe('PROVEEDOR');

    const turno = await http().get('/cajas-turnos/activa').set(auth());
    expect(
      Number((turno.body as { efectivo_esperado: string }).efectivo_esperado),
    ).toBeCloseTo(antes - 16, 2);

    await ensureNoOpenShift(app, admin);
  });

  it('compra desde la bóveda sin saldo suficiente: pasa con aviso y deja su asiento BOVEDA→PROVEEDOR', async () => {
    const { productoId } = await crearProducto('Boveda', 5);
    // Dejar la bóveda en un saldo conocido y chico.
    const saldo = await saldoBoveda();
    const objetivo = 5;
    if (saldo < objetivo) {
      await http()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: objetivo - saldo });
    } else if (saldo > objetivo) {
      await http()
        .post('/caja-general/arqueo')
        .set(auth())
        .send({ saldo_declarado: objetivo, justificacion: 'ajuste e2e' });
    }
    expect(await saldoBoveda()).toBeCloseTo(objetivo, 2);

    const res = await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: `Boveda-${sufijo}`,
        estado_pago: 'PAGADO',
        origen_fondos: 'CAJA_GENERAL',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 4,
            cantidad_inicial: 3,
          },
        ],
      });
    expect(res.status).toBe(201);
    const compra = res.body as CompraBody;
    expect(Number(compra.monto_total)).toBe(12);
    expect(compra.avisos).toHaveLength(1);
    expect(compra.avisos?.[0]).toMatch(/bóveda quedó en −\$7\.00/);

    // La bóveda quedó en −7 y el libro lo explica.
    expect(await saldoBoveda()).toBeCloseTo(-7, 2);
    const pago = await prisma.movimientos_financieros.findFirstOrThrow({
      where: {
        tipo_movimiento: 'PAGO_PROVEEDOR',
        cuenta_origen: 'BOVEDA',
        descripcion: { contains: `Boveda-${sufijo}` },
      },
    });
    expect(Number(pago.monto)).toBe(12);
    expect(pago.cuenta_destino).toBe('PROVEEDOR');
    // El stock sí entró.
    expect(Number((await producto(productoId)).stock_total)).toBe(3);

    // Reponer la bóveda para no dejar un saldo negativo a otros archivos.
    await http()
      .post('/caja-general/arqueo')
      .set(auth())
      .send({ saldo_declarado: 0, justificacion: 'reset e2e' });
  });

  it('una compra cubre la deuda de stock de dos ventas, de la más vieja a la más nueva', async () => {
    const { productoId, presentacionId } = await crearProducto('Deuda2', 6);
    // 1 unidad en stock para que el producto tenga costo conocido ($2).
    await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Deuda2-base',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 2,
            cantidad_inicial: 1,
          },
        ],
      });
    await abrirTurno();

    const vender = async (cantidad: number) => {
      const r = await http()
        .post('/ventas')
        .set(auth())
        .send({ detalles: [{ presentacion_id: presentacionId, cantidad }] });
      expect(r.status).toBe(201);
      return r.body as VentaBody;
    };
    // Venta 1: 1 del lote + 2 pendientes. Venta 2: 3 pendientes.
    const v1 = await vender(3);
    const v2 = await vender(3);
    expect(v1.avisos).toHaveLength(1);
    expect(v2.avisos).toHaveLength(1);

    const pendientes = () =>
      prisma.pendientes_stock.findMany({
        where: { producto_id: productoId },
        orderBy: { id: 'asc' },
      });
    let [p1, p2] = await pendientes();
    expect([
      Number(p1.cantidad_pendiente),
      Number(p2.cantidad_pendiente),
    ]).toEqual([2, 3]);
    let prod = await producto(productoId);
    expect(Number(prod.stock_total)).toBe(0);
    expect(Number(prod.pendiente_total)).toBe(5);

    // Compra de 4: cierra la más vieja (2) y deja la segunda en 1 pendiente.
    await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Deuda2-c1',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 3,
            cantidad_inicial: 4,
          },
        ],
      })
      .expect(201);
    [p1, p2] = await pendientes();
    expect(Number(p1.cantidad_pendiente)).toBe(0);
    expect(p1.resuelto_en).not.toBeNull();
    expect(Number(p2.cantidad_pendiente)).toBe(1);
    expect(p2.resuelto_en).toBeNull();
    prod = await producto(productoId);
    expect(Number(prod.stock_total)).toBe(0);
    expect(Number(prod.pendiente_total)).toBe(1);

    // Compra de 5: cierra la segunda y el lote queda con 4.
    await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Deuda2-c2',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 3,
            cantidad_inicial: 5,
          },
        ],
      })
      .expect(201);
    [p1, p2] = await pendientes();
    expect(Number(p2.cantidad_pendiente)).toBe(0);
    expect(p2.resuelto_en).not.toBeNull();
    prod = await producto(productoId);
    expect(Number(prod.stock_total)).toBe(4);
    expect(Number(prod.pendiente_total)).toBe(0);

    await ensureNoOpenShift(app, admin);
  });
});
