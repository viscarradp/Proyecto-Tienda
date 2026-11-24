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
interface TurnoActivo {
  id: number;
  efectivo_esperado: string | number;
}
interface Resumen {
  total_ventas: string | number;
  count_ventas: number;
  count_ventas_anuladas: number;
  total_devoluciones: string | number;
  ventas_netas: string | number;
}

/**
 * NEG-09: el resumen de un turno solo cuenta ventas COMPLETADAS, informa las
 * anuladas aparte, y descuenta las devoluciones hechas EN ese turno (aunque la
 * venta original sea de otro turno).
 */
describe('Resumen de turno — ventas completadas y devoluciones (e2e, NEG-09)', () => {
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
      .send({ nombre: `Resumen-cat-${Date.now()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({
        nombre: 'Item-Resumen-E2E',
        categoria_id: (cat.body as WithId).id,
      });
    const productoId = (prod.body as WithId).id;

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
        proveedor: 'Resumen-E2E',
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
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function abrirTurno(): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 0 });
    expect(res.status).toBe(201);
    return (res.body as WithId).id;
  }

  async function cerrarTurno(): Promise<void> {
    const activa = await request(app.getHttpServer())
      .get('/cajas-turnos/activa')
      .set(auth());
    const t = activa.body as TurnoActivo;
    const res = await request(app.getHttpServer())
      .patch(`/cajas-turnos/${t.id}/cerrar`)
      .set(auth())
      .send({ efectivo_declarado: Number(t.efectivo_esperado ?? 0) });
    expect(res.status).toBe(200);
  }

  async function vender(cantidad: number): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad }] });
    expect(res.status).toBe(201);
    return (res.body as WithId).id;
  }

  async function devolver(ventaId: number, cantidad: number): Promise<void> {
    const v = await request(app.getHttpServer())
      .get(`/ventas/${ventaId}`)
      .set(auth());
    const dvId = (v.body as VentaDetalle).detalle_ventas[0].id;
    const res = await request(app.getHttpServer())
      .post(`/ventas/${ventaId}/devolucion`)
      .set(auth())
      .send({
        detalles: [{ detalle_venta_id: dvId, cantidad, destino: 'REINGRESO' }],
        justificacion: 'Prueba de resumen',
      });
    expect(res.status).toBe(201);
  }

  async function resumen(turnoId: number): Promise<Resumen> {
    const res = await request(app.getHttpServer())
      .get(`/cajas-turnos/${turnoId}/resumen`)
      .set(auth());
    expect(res.status).toBe(200);
    return res.body as Resumen;
  }

  it('excluye anuladas, informa devoluciones y las del turno B no tocan al A', async () => {
    const turnoA = await abrirTurno();
    const v1 = await vender(5); // 50
    const v2 = await vender(3); // 30
    const v3 = await vender(2); // 20 (se anulará)

    const anul = await request(app.getHttpServer())
      .patch(`/ventas/${v3}/anular`)
      .set(auth())
      .send({ justificacion_nula: 'Prueba de resumen' });
    expect(anul.status).toBe(200);

    await devolver(v2, 1); // reembolsa 10

    const a = await resumen(turnoA);
    expect(a.count_ventas).toBe(2);
    expect(Number(a.total_ventas)).toBeCloseTo(80);
    expect(a.count_ventas_anuladas).toBe(1);
    expect(Number(a.total_devoluciones)).toBeCloseTo(10);
    expect(Number(a.ventas_netas)).toBeCloseTo(70);

    await cerrarTurno();
    const turnoB = await abrirTurno();
    await devolver(v1, 2); // reembolsa 20, desde la gaveta de B

    const b = await resumen(turnoB);
    expect(b.count_ventas).toBe(0);
    expect(Number(b.total_ventas)).toBeCloseTo(0);
    expect(Number(b.total_devoluciones)).toBeCloseTo(20);
    expect(Number(b.ventas_netas)).toBeCloseTo(-20);

    const a2 = await resumen(turnoA);
    expect(a2).toMatchObject({
      count_ventas: 2,
      count_ventas_anuladas: 1,
    });
    expect(Number(a2.total_devoluciones)).toBeCloseTo(10);
    expect(Number(a2.ventas_netas)).toBeCloseTo(70);

    // El reembolso dejó la gaveta de B en negativo; una venta la normaliza para
    // que el turno pueda cerrarse (ensureNoOpenShift) y no contamine otras suites.
    await vender(5);
  });
});
