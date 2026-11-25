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
interface SinCosto {
  monto_vendido: string | number;
  lineas: number;
  productos: string[];
}
interface ResultadosBody {
  ventas_sin_costo: SinCosto;
}

/** DUE-27 · el estado de resultados avisa cuánto de lo vendido no tiene costo. */
describe('Ventas sin costo registrado (e2e, DUE-27)', () => {
  let app: INestApplication;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  async function sinCosto(): Promise<SinCosto> {
    const res = await http()
      .get('/reportes/estado-resultados?desde=2020-01-01&hasta=2030-01-01')
      .set(auth());
    return (res.body as ResultadosBody).ventas_sin_costo;
  }

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);
    const turno = await http()
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 100 });
    expect(turno.status).toBe(201);
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  it('vender un producto sin compras suma al monto sin costo; la compra que lo cubre lo vuelve a 0', async () => {
    const antes = await sinCosto();
    const nombre = `Gaseosa-sin-costo-${Date.now()}`;

    const cat = await http()
      .post('/categorias')
      .set(auth())
      .send({ nombre: `SinCosto-cat-${Date.now()}` });
    const prod = await http()
      .post('/productos')
      .set(auth())
      .send({ nombre, categoria_id: (cat.body as WithId).id });
    const productoId = (prod.body as WithId).id;
    const pres = await http().post('/presentaciones').set(auth()).send({
      producto_id: productoId,
      descripcion: 'Unidad',
      factor_conversion: 1,
      precio_venta: 2.5,
    });
    const presentacionId = (pres.body as WithId).id;

    const venta = await http()
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 4 }] });
    expect(venta.status).toBe(201);

    const durante = await sinCosto();
    expect(Number(durante.monto_vendido) - Number(antes.monto_vendido)).toBe(
      10,
    );
    expect(durante.lineas - antes.lineas).toBe(1);
    expect(durante.productos).toContain(nombre);

    const compra = await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'SinCosto-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 1,
            cantidad_inicial: 10,
          },
        ],
      });
    expect(compra.status).toBe(201);

    const despues = await sinCosto();
    expect(Number(despues.monto_vendido)).toBe(Number(antes.monto_vendido));
    expect(despues.lineas).toBe(antes.lineas);
    expect(despues.productos).not.toContain(nombre);
  });
});
