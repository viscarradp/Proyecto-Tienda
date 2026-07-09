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
interface HistorialRow {
  precio_anterior: string | number;
  precio_nuevo: string | number;
}
interface ProductoBody {
  id: number;
  lotes_inventario: {
    id: number;
    cantidad_disponible: string | number;
  }[];
}
interface UltimoCierre {
  fondo_siguiente: string | number;
}

/**
 * Cubre el Bloque 3.C (ítem 16, higiene):
 *  - historial de precios de presentaciones,
 *  - desempate FIFO determinista por id (lotes del mismo fecha_ingreso),
 *  - getUltimoCierre considera también CERRADA_FORZADA.
 */
describe('Higiene — historial de precios, FIFO por id, cierre forzado (e2e, 3.C)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function nuevoProducto(nombre: string): Promise<number> {
    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set(auth())
      .send({ nombre: `${nombre}-${Date.now()}-${Math.random()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({ nombre, categoria_id: (cat.body as WithId).id });
    return (prod.body as WithId).id;
  }

  it('registra el historial cuando cambia el precio de una presentación', async () => {
    const prodId = await nuevoProducto('Precio-E2E');
    const pres = await request(app.getHttpServer())
      .post('/presentaciones')
      .set(auth())
      .send({
        producto_id: prodId,
        descripcion: 'Unidad',
        factor_conversion: 1,
        precio_venta: 10,
      });
    const presId = (pres.body as WithId).id;

    // Subir el precio 10 → 15.
    await request(app.getHttpServer())
      .patch(`/presentaciones/${presId}`)
      .set(auth())
      .send({ precio_venta: 15 });

    let hist = await request(app.getHttpServer())
      .get(`/presentaciones/${presId}/historial-precios`)
      .set(auth());
    expect((hist.body as HistorialRow[]).length).toBe(1);
    expect(
      Number((hist.body as HistorialRow[])[0].precio_anterior),
    ).toBeCloseTo(10);
    expect(Number((hist.body as HistorialRow[])[0].precio_nuevo)).toBeCloseTo(
      15,
    );

    // Un update SIN cambio de precio no agrega fila.
    await request(app.getHttpServer())
      .patch(`/presentaciones/${presId}`)
      .set(auth())
      .send({ descripcion: 'Unidad grande' });
    hist = await request(app.getHttpServer())
      .get(`/presentaciones/${presId}/historial-precios`)
      .set(auth());
    expect((hist.body as HistorialRow[]).length).toBe(1);

    // Otro cambio de precio 15 → 12 agrega una segunda fila.
    await request(app.getHttpServer())
      .patch(`/presentaciones/${presId}`)
      .set(auth())
      .send({ precio_venta: 12 });
    hist = await request(app.getHttpServer())
      .get(`/presentaciones/${presId}/historial-precios`)
      .set(auth());
    expect((hist.body as HistorialRow[]).length).toBe(2);
  });

  it('el motor FIFO desempata por id cuando dos lotes tienen el mismo fecha_ingreso', async () => {
    await ensureNoOpenShift(app, token);
    const prodId = await nuevoProducto('FifoTie-E2E');
    const pres = await request(app.getHttpServer())
      .post('/presentaciones')
      .set(auth())
      .send({
        producto_id: prodId,
        descripcion: 'Unidad',
        factor_conversion: 1,
        precio_venta: 20,
      });
    const presId = (pres.body as WithId).id;

    // Dos lotes creados en la MISMA transacción → mismo fecha_ingreso (now() es
    // constante en la transacción). El lote de menor id (costo 3) debe salir primero.
    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'FifoTie-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: prodId,
            costo_unitario_adquisicion: 3,
            cantidad_inicial: 5,
          },
          {
            producto_id: prodId,
            costo_unitario_adquisicion: 9,
            cantidad_inicial: 5,
          },
        ],
      });

    await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 0 });

    // Vender 5 → debe consumir por completo el lote de MENOR id.
    await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presId, cantidad: 5 }] });

    const prods = await request(app.getHttpServer())
      .get('/productos')
      .set(auth());
    const p = (prods.body as ProductoBody[]).find((x) => x.id === prodId);
    const lotes = [...p!.lotes_inventario].sort((a, b) => a.id - b.id);
    expect(Number(lotes[0].cantidad_disponible)).toBeCloseTo(0); // menor id, consumido
    expect(Number(lotes[1].cantidad_disponible)).toBeCloseTo(5); // mayor id, intacto

    await ensureNoOpenShift(app, token);
  });

  it('getUltimoCierre considera un turno CERRADA_FORZADA', async () => {
    await ensureNoOpenShift(app, token);
    const abrir = await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 50 });
    const turnoId = (abrir.body as WithId).id;

    // Cierre forzado declarando 137 (sin traslado a bóveda).
    await request(app.getHttpServer())
      .patch(`/cajas-turnos/${turnoId}/cerrar-forzado`)
      .set(auth())
      .send({ efectivo_declarado: 137, observaciones: 'Cierre forzado E2E' });

    const uc = await request(app.getHttpServer())
      .get('/cajas-turnos/ultimo-cierre')
      .set(auth());
    // Antes del fix, un cierre forzado era invisible aquí. Ahora el fondo
    // siguiente se deriva de ÉL: 137 declarado − 0 trasladado = 137.
    expect(Number((uc.body as UltimoCierre).fondo_siguiente)).toBeCloseTo(137);
  });
});
