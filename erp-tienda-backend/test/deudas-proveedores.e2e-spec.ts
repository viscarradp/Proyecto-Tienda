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
interface Avisos {
  avisos: string[];
}
interface CompraBody extends WithId {
  origen_fondos: string;
  usuario_id: number | null;
}
interface Abono {
  id: number;
  monto: string | number;
  movimiento_id: number | null;
  nota: string | null;
}
interface Deuda extends WithId {
  acreedor: string;
  compra_id: number;
  monto_compra: string | number;
  monto_deuda: string | number;
  saldo_pendiente: string | number;
  abonos: Abono[];
}
interface AbonoRespuesta extends Avisos {
  abono: Abono;
  saldo_pendiente: string | number;
}
interface PatrimonioBody {
  efectivo: { total: string | number };
  deudas: string | number;
  patrimonio_neto: string | number;
}
interface Movimiento {
  tipo_movimiento: string;
  cuenta_origen: string;
  cuenta_destino: string;
  monto: string | number;
  caja_turno_id: number | null;
}
interface Turno extends WithId {
  efectivo_esperado: string | number;
  movimientos_financieros: Movimiento[];
}

/**
 * L8 · Compras a crédito y deudas con proveedores (D-05): la compra al crédito
 * no lleva origen de fondos y la deuda se paga con abonos desde gaveta o bóveda.
 */
describe('Deudas con proveedores (e2e, L8)', () => {
  let app: INestApplication;
  let token: string;
  let productoId: number;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);

    const cat = await api()
      .post('/categorias')
      .set(auth())
      .send({ nombre: `L8-cat-${Date.now()}` });
    const prod = await api()
      .post('/productos')
      .set(auth())
      .send({
        nombre: `L8-prod-${Date.now()}`,
        categoria_id: (cat.body as WithId).id,
      });
    productoId = (prod.body as WithId).id;
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, token);
    await app.close();
  });

  function compraBody(extra: Record<string, unknown>, monto = 10) {
    return {
      proveedor: 'Distribuidora L8',
      detalles_lotes: [
        {
          producto_id: productoId,
          costo_unitario_adquisicion: monto,
          cantidad_inicial: 1,
        },
      ],
      ...extra,
    };
  }

  /** Compra al crédito (sin origen) y devuelve su deuda. */
  async function crearDeuda(monto: number): Promise<Deuda> {
    const compra = await api()
      .post('/compras')
      .set(auth())
      .send(compraBody({ estado_pago: 'AL_CREDITO' }, monto));
    expect(compra.status).toBe(201);
    const lista = await api()
      .get('/cuentas-por-pagar?estado=pendientes')
      .set(auth());
    const deuda = (lista.body as Deuda[]).find(
      (d) => d.compra_id === (compra.body as WithId).id,
    );
    expect(deuda).toBeDefined();
    return deuda as Deuda;
  }

  async function saldoBoveda(): Promise<number> {
    const res = await api().get('/caja-general/saldo').set(auth());
    return Number((res.body as { saldo_actual: string }).saldo_actual);
  }

  async function patrimonio(): Promise<PatrimonioBody> {
    const res = await api().get('/reportes/patrimonio').set(auth());
    return res.body as PatrimonioBody;
  }

  async function resultados(): Promise<unknown> {
    const res = await api()
      .get('/reportes/estado-resultados?desde=2020-01-01&hasta=2030-01-01')
      .set(auth());
    return res.body;
  }

  async function turnoActivo(): Promise<Turno> {
    const activa = await api().get('/cajas-turnos/activa').set(auth());
    const res = await api()
      .get(`/cajas-turnos/${(activa.body as WithId).id}`)
      .set(auth());
    return res.body as Turno;
  }

  async function abrirTurno(): Promise<void> {
    const ultimo = await api().get('/cajas-turnos/ultimo-cierre').set(auth());
    const fondo = Number(
      (ultimo.body as { fondo_siguiente: string }).fondo_siguiente,
    );
    const res = await api()
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: fondo + 50, origen_diferencia: 'APORTE' });
    expect(res.status).toBe(201);
  }

  function abonar(id: number, body: Record<string, unknown>) {
    return api().post(`/cuentas-por-pagar/${id}/abonos`).set(auth()).send(body);
  }

  describe('compra al crédito', () => {
    it('sin origen_fondos → 201, deuda creada, ningún movimiento de efectivo', async () => {
      const prisma = app.get(PrismaService);
      const movsAntes = await prisma.movimientos_financieros.count();
      const bovedaAntes = await saldoBoveda();

      const res = await api()
        .post('/compras')
        .set(auth())
        .send(compraBody({ estado_pago: 'AL_CREDITO' }, 25));
      expect(res.status).toBe(201);
      const compra = res.body as CompraBody;
      expect(compra.origen_fondos).toBe('CREDITO');
      expect((res.body as Avisos).avisos).toEqual([]);

      const cuenta = await prisma.cuentas_por_pagar.findFirst({
        where: { compra_id: compra.id },
      });
      expect(Number(cuenta?.monto_deuda)).toBe(25);
      expect(Number(cuenta?.saldo_pendiente)).toBe(25);
      expect(await prisma.movimientos_financieros.count()).toBe(movsAntes);
      expect(await saldoBoveda()).toBe(bovedaAntes);
    });

    it('con origen_fondos de más se ignora y se guarda como CREDITO', async () => {
      const res = await api()
        .post('/compras')
        .set(auth())
        .send(
          compraBody({ estado_pago: 'AL_CREDITO', origen_fondos: 'CAJA_POS' }),
        );
      expect(res.status).toBe(201);
      expect((res.body as CompraBody).origen_fondos).toBe('CREDITO');
    });

    it('compra PAGADO sin origen_fondos → 400', async () => {
      const res = await api()
        .post('/compras')
        .set(auth())
        .send(compraBody({ estado_pago: 'PAGADO' }));
      expect(res.status).toBe(400);
    });

    it('la compra guarda el usuario que la registró', async () => {
      const res = await api()
        .post('/compras')
        .set(auth())
        .send(
          compraBody({
            estado_pago: 'PAGADO',
            origen_fondos: 'CAPITAL_DUEÑOS',
          }),
        );
      expect(res.status).toBe(201);
      const compra = res.body as CompraBody;
      const admin = await app
        .get(PrismaService)
        .usuarios.findUnique({ where: { nombre: 'admin' } });
      expect(compra.usuario_id).toBe(admin?.id);
    });
  });

  describe('abonos', () => {
    it('desde bóveda: PAGO_PROVEEDOR BOVEDA→PROVEEDOR y baja el saldo de bóveda', async () => {
      await api()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 500, descripcion: 'Fondos L8' });
      const deuda = await crearDeuda(40);
      const antes = await saldoBoveda();

      const res = await abonar(deuda.id, {
        monto: 15,
        origen: 'BOVEDA',
        nota: 'Primer abono',
      });
      expect(res.status).toBe(201);
      const cuerpo = res.body as AbonoRespuesta;
      expect(cuerpo.avisos).toEqual([]);
      expect(Number(cuerpo.saldo_pendiente)).toBe(25);
      expect(await saldoBoveda()).toBeCloseTo(antes - 15);

      const mov = await app
        .get(PrismaService)
        .movimientos_financieros.findUnique({
          where: { id: cuerpo.abono.movimiento_id as number },
        });
      expect(mov?.tipo_movimiento).toBe('PAGO_PROVEEDOR');
      expect(mov?.cuenta_origen).toBe('BOVEDA');
      expect(mov?.cuenta_destino).toBe('PROVEEDOR');
      expect(mov?.caja_turno_id).toBeNull();

      const lista = await api()
        .get('/cuentas-por-pagar?estado=todas')
        .set(auth());
      const fila = (lista.body as Deuda[]).find((d) => d.id === deuda.id);
      expect(Number(fila?.saldo_pendiente)).toBe(25);
      expect(Number(fila?.monto_deuda)).toBe(40);
      expect(fila?.abonos).toHaveLength(1);
      expect(fila?.abonos[0].nota).toBe('Primer abono');
    });

    it('desde gaveta sin turno abierto → 400 claro', async () => {
      const deuda = await crearDeuda(10);
      const res = await abonar(deuda.id, { monto: 5, origen: 'GAVETA' });
      expect(res.status).toBe(400);
      expect((res.body as { message: string }).message).toContain(
        'turno abierto',
      );
    });

    it('desde gaveta: GAVETA→PROVEEDOR ligado al turno y baja efectivo_esperado', async () => {
      const deuda = await crearDeuda(30);
      await abrirTurno();
      try {
        const antes = Number((await turnoActivo()).efectivo_esperado);

        const res = await abonar(deuda.id, { monto: 12, origen: 'GAVETA' });
        expect(res.status).toBe(201);
        expect(Number((res.body as AbonoRespuesta).saldo_pendiente)).toBe(18);

        const turno = await turnoActivo();
        expect(Number(turno.efectivo_esperado)).toBeCloseTo(antes - 12);
        const mov = turno.movimientos_financieros.find(
          (m) =>
            m.tipo_movimiento === 'PAGO_PROVEEDOR' &&
            m.cuenta_origen === 'GAVETA' &&
            m.cuenta_destino === 'PROVEEDOR' &&
            Number(m.monto) === 12,
        );
        expect(mov).toBeDefined();
      } finally {
        await ensureNoOpenShift(app, token);
      }
    });

    it('abono mayor al saldo → 400 y nada cambia', async () => {
      const deuda = await crearDeuda(20);
      const antes = await saldoBoveda();
      const res = await abonar(deuda.id, { monto: 20.01, origen: 'BOVEDA' });
      expect(res.status).toBe(400);
      expect(await saldoBoveda()).toBe(antes);
      const cero = await abonar(deuda.id, { monto: 0, origen: 'BOVEDA' });
      expect(cero.status).toBe(400);
    });

    it('con fondos insuficientes se registra igual y avisa (ADR 0011)', async () => {
      const grande = (await saldoBoveda()) + 1000;
      const deuda = await crearDeuda(grande);
      const res = await abonar(deuda.id, { monto: grande, origen: 'BOVEDA' });
      expect(res.status).toBe(201);
      const avisos = (res.body as AbonoRespuesta).avisos;
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toContain('bóveda');
      expect(Number((res.body as AbonoRespuesta).saldo_pendiente)).toBe(0);
      // Arreglar el saldo para no contaminar otros tests.
      await api()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 1000, descripcion: 'Repone L8' });
    });

    it('la deuda saldada sale de pendientes y un nuevo abono da 400', async () => {
      const deuda = await crearDeuda(5);
      expect(
        (await abonar(deuda.id, { monto: 5, origen: 'BOVEDA' })).status,
      ).toBe(201);
      const pend = await api()
        .get('/cuentas-por-pagar?estado=pendientes')
        .set(auth());
      expect((pend.body as Deuda[]).some((d) => d.id === deuda.id)).toBe(false);
      const de_nuevo = await abonar(deuda.id, { monto: 1, origen: 'BOVEDA' });
      expect(de_nuevo.status).toBe(400);
    });

    it('deuda inexistente → 404', async () => {
      const res = await abonar(999999, { monto: 1, origen: 'BOVEDA' });
      expect(res.status).toBe(404);
    });

    it('dos abonos concurrentes que superan el saldo: uno pasa, el otro 400', async () => {
      const deuda = await crearDeuda(10);
      const [a, b] = await Promise.all([
        abonar(deuda.id, { monto: 6, origen: 'BOVEDA' }),
        abonar(deuda.id, { monto: 6, origen: 'BOVEDA' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 400]);

      const fila = await app
        .get(PrismaService)
        .cuentas_por_pagar.findUnique({ where: { id: deuda.id } });
      expect(Number(fila?.saldo_pendiente)).toBe(4);
    });

    it('lista ordenada con lo más viejo pendiente primero', async () => {
      const lista = await api()
        .get('/cuentas-por-pagar?estado=pendientes')
        .set(auth());
      const ids = (lista.body as Deuda[]).map((d) => d.id);
      expect(ids).toEqual([...ids].sort((x, y) => x - y));
    });

    it('estado inválido → 400', async () => {
      const res = await api()
        .get('/cuentas-por-pagar?estado=cualquiera')
        .set(auth());
      expect(res.status).toBe(400);
    });
  });

  describe('contabilidad', () => {
    it('pagar baja deudas y efectivo por igual; patrimonio y resultados no cambian', async () => {
      const deuda = await crearDeuda(60);
      await api()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 100, descripcion: 'Patrimonio L8' });

      const p0 = await patrimonio();
      const r0 = await resultados();

      const res = await abonar(deuda.id, { monto: 45, origen: 'BOVEDA' });
      expect(res.status).toBe(201);

      const p1 = await patrimonio();
      const r1 = await resultados();

      expect(Number(p1.deudas)).toBeCloseTo(Number(p0.deudas) - 45);
      expect(Number(p1.efectivo.total)).toBeCloseTo(
        Number(p0.efectivo.total) - 45,
      );
      expect(Number(p1.patrimonio_neto)).toBeCloseTo(
        Number(p0.patrimonio_neto),
      );
      expect(r1).toEqual(r0);
    });
  });

  describe('permisos', () => {
    it('un CAJERO recibe 403 en los endpoints de deudas', async () => {
      const nombre = `cajera-l8-${Date.now()}`;
      const crear = await api()
        .post('/usuarios')
        .set(auth())
        .send({ nombre, rol: 'CAJERO', password: 'cajera-l8-123' });
      expect(crear.status).toBe(201);
      const login = await api()
        .post('/auth/login')
        .send({ nombre, password: 'cajera-l8-123' });
      const tokenCajero = (login.body as { access_token: string }).access_token;
      const h = { Authorization: `Bearer ${tokenCajero}` };

      const deuda = await crearDeuda(10);
      expect((await api().get('/cuentas-por-pagar').set(h)).status).toBe(403);
      expect(
        (
          await api()
            .post(`/cuentas-por-pagar/${deuda.id}/abonos`)
            .set(h)
            .send({ monto: 1, origen: 'BOVEDA' })
        ).status,
      ).toBe(403);
    });
  });
});
