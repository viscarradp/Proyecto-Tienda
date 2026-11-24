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
interface TurnoItem extends WithId {
  _count: { ventas: number };
}
interface PaginaTurnos {
  items: TurnoItem[];
  hay_mas: boolean;
}
interface VentaListada extends WithId {
  caja_turno_id: number;
  _count: { devoluciones: number };
  devoluciones: unknown[];
  detalle_ventas: {
    presentaciones: { productos: { nombre: string } };
  }[];
}

/**
 * Paginación de Movimientos (L4): turnos por cursor, ventas por turno y
 * listado de ventas acotado.
 */
describe('Paginación de turnos y ventas (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let presentacionId: number;
  const turnosCreados: number[] = [];
  const ventaPorTurno = new Map<number, number>();

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const get = (url: string) =>
    request(app.getHttpServer()).get(url).set(auth());

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set(auth())
      .send({ nombre: `Pag-cat-${Date.now()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({
        nombre: 'Leche-Pag-E2E',
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
        precio_venta: 5,
      });
    presentacionId = (pres.body as WithId).id;
    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Pag-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 2,
            cantidad_inicial: 100,
          },
        ],
      });

    // 9 turnos abiertos y cerrados; cada uno con una venta.
    for (let i = 0; i < 9; i++) {
      const abierto = await request(app.getHttpServer())
        .post('/cajas-turnos/abrir')
        .set(auth())
        .send({ fondo_inicial: 0 });
      const turnoId = (abierto.body as WithId).id;
      turnosCreados.push(turnoId);
      const venta = await request(app.getHttpServer())
        .post('/ventas')
        .set(auth())
        .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 1 }] });
      ventaPorTurno.set(turnoId, (venta.body as WithId).id);
      await request(app.getHttpServer())
        .patch(`/cajas-turnos/${turnoId}/cerrar`)
        .set(auth())
        .send({ efectivo_declarado: 5 });
    }
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  it('turnos: la primera página trae 7 e indica que hay más; la siguiente sigue sin repetir', async () => {
    const p1 = await get('/cajas-turnos');
    expect(p1.status).toBe(200);
    const pagina1 = p1.body as PaginaTurnos;
    expect(pagina1.items).toHaveLength(7);
    expect(pagina1.hay_mas).toBe(true);
    // Más recientes primero, con el conteo de ventas que usa la cabecera.
    const ids1 = pagina1.items.map((t) => t.id);
    expect(ids1[0]).toBe(turnosCreados[8]);
    expect(ids1).toEqual([...ids1].sort((a, b) => b - a));
    expect(pagina1.items[0]._count.ventas).toBe(1);

    const todos = [...ids1];
    let cursor = ids1[ids1.length - 1];
    let hayMas = true;
    while (hayMas) {
      const r = await get(`/cajas-turnos?antes_de=${cursor}`);
      expect(r.status).toBe(200);
      const pag = r.body as PaginaTurnos;
      expect(pag.items.length).toBeGreaterThan(0);
      for (const t of pag.items) expect(t.id).toBeLessThan(cursor);
      todos.push(...pag.items.map((t) => t.id));
      cursor = pag.items[pag.items.length - 1].id;
      hayMas = pag.hay_mas;
    }
    expect(new Set(todos).size).toBe(todos.length);
    for (const id of turnosCreados) expect(todos).toContain(id);
  });

  it('turnos: limit respeta el tope y la última página dice que no hay más', async () => {
    const r = await get(`/cajas-turnos?limit=50`);
    expect(r.status).toBe(200);
    expect((r.body as PaginaTurnos).items.length).toBeLessThanOrEqual(50);

    const primero = turnosCreados[0];
    const ultima = await get(`/cajas-turnos?antes_de=${primero + 1}&limit=1`);
    const pag = ultima.body as PaginaTurnos;
    expect(pag.items[0].id).toBe(primero);
  });

  it('ventas: caja_turno_id (uno o varios) trae solo las de esos turnos, con lo que usa la pantalla', async () => {
    const [a, b, c] = turnosCreados;
    const uno = await get(`/ventas?caja_turno_id=${a}`);
    expect(uno.status).toBe(200);
    const ventasUno = uno.body as VentaListada[];
    expect(ventasUno.map((v) => v.id)).toEqual([ventaPorTurno.get(a)]);
    expect(ventasUno[0]._count.devoluciones).toBe(0);
    expect(ventasUno[0].devoluciones).toEqual([]);
    expect(ventasUno[0].detalle_ventas[0].presentaciones.productos.nombre).toBe(
      'Leche-Pag-E2E',
    );

    const varios = await get(`/ventas?caja_turno_id=${a},${b},${c}`);
    expect(varios.status).toBe(200);
    expect(
      (varios.body as VentaListada[]).map((v) => v.caja_turno_id).sort(),
    ).toEqual([a, b, c].sort());
  });

  it('ventas: sin parámetros usa el límite por defecto, y limit/antes_de acotan', async () => {
    const todas = await get('/ventas');
    expect(todas.status).toBe(200);
    expect((todas.body as VentaListada[]).length).toBeLessThanOrEqual(50);

    const ultimaVenta = ventaPorTurno.get(turnosCreados[8])!;
    const pagina = await get(`/ventas?limit=2&antes_de=${ultimaVenta}`);
    const lista = pagina.body as VentaListada[];
    expect(lista).toHaveLength(2);
    expect(lista[0].id).toBeLessThan(ultimaVenta);
    expect(lista[0].id).toBeGreaterThan(lista[1].id);
  });

  it('ventas: GET /ventas/:id trae devoluciones y nombre de producto; inexistente -> 404', async () => {
    const id = ventaPorTurno.get(turnosCreados[0])!;
    const ok = await get(`/ventas/${id}`);
    expect(ok.status).toBe(200);
    const venta = ok.body as VentaListada;
    expect(venta._count.devoluciones).toBe(0);
    expect(venta.detalle_ventas[0].presentaciones.productos.nombre).toBe(
      'Leche-Pag-E2E',
    );

    const no = await get('/ventas/99999999');
    expect(no.status).toBe(404);
  });

  it.each([
    '/ventas?limit=0',
    '/ventas?limit=201',
    '/ventas?limit=abc',
    '/ventas?antes_de=abc',
    '/ventas?antes_de=0',
    '/ventas?caja_turno_id=abc',
    '/ventas?caja_turno_id=1,,2',
    '/cajas-turnos?limit=0',
    '/cajas-turnos?limit=51',
    '/cajas-turnos?limit=x',
    '/cajas-turnos?antes_de=-3',
    '/movimientos-financieros?limit=501',
    '/movimientos-financieros?limit=abc',
  ])('parámetros inválidos -> 400: %s', async (url) => {
    const r = await get(url);
    expect(r.status).toBe(400);
  });

  it('movimientos-financieros: sin limit responde (acotado a 100)', async () => {
    const r = await get('/movimientos-financieros');
    expect(r.status).toBe(200);
    expect((r.body as unknown[]).length).toBeLessThanOrEqual(100);
  });
});
