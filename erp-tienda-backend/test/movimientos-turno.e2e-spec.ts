import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  loginAsAdmin,
  ensureNoOpenShift,
} from './helpers/e2e-setup';

interface TurnoBody {
  id: number;
}
interface MovimientoListado {
  tipo_movimiento: string;
  descripcion: string;
  monto: string;
  usuarios: { nombre: string } | null;
  categorias_gastos: { nombre: string } | null;
}
interface TurnoListado {
  id: number;
  movimientos_financieros: MovimientoListado[];
}
interface PaginaTurnos {
  items: TurnoListado[];
}

/**
 * L10 · UX-12: el listado de turnos trae los movimientos de dinero de cada
 * turno con el nombre de quien los hizo (solo `{ nombre }`).
 */
describe('Movimientos de dinero por turno (e2e, L10)', () => {
  let app: INestApplication;
  let token: string;
  const descripcion = `Pago de agua L10 ${Date.now()}`;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  it('GET /cajas-turnos incluye el autor y la categoría de cada movimiento', async () => {
    const abrir = await http()
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 50 });
    expect(abrir.status).toBe(201);
    const turnoId = (abrir.body as TurnoBody).id;

    const gasto = await http()
      .post('/movimientos-financieros')
      .set(auth())
      .send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto: 5,
        descripcion,
        origen_fondos: 'GAVETA',
      });
    expect(gasto.status).toBe(201);

    const lista = await http().get('/cajas-turnos?limit=5').set(auth());
    expect(lista.status).toBe(200);
    const turno = (lista.body as PaginaTurnos).items.find(
      (t) => t.id === turnoId,
    );
    expect(turno).toBeDefined();
    const mov = turno!.movimientos_financieros.find(
      (m) => m.descripcion === descripcion,
    );
    expect(mov).toBeDefined();
    expect(mov!.tipo_movimiento).toBe('EGRESO_OPERATIVO');
    expect(Number(mov!.monto)).toBe(5);
    expect(mov!.usuarios).toEqual({ nombre: 'admin' });
    expect(mov!.categorias_gastos).toEqual({
      nombre: expect.any(String) as string,
    });
  });
});
