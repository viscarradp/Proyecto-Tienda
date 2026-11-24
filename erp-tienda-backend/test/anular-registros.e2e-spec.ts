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
interface LoginBody {
  access_token: string;
}
interface Lote {
  id: number;
  cantidad_inicial: string;
  cantidad_disponible: string;
}
interface CompraBody extends WithId {
  anulado: boolean;
  motivo_anulacion: string | null;
  anulado_por?: { nombre: string } | null;
  lotes_inventario: Lote[];
}
interface MovimientoBody extends WithId {
  anulado: boolean;
  motivo_anulacion: string | null;
  anulado_por?: { nombre: string } | null;
  tipo_movimiento: string;
  compra_id?: number | null;
}
interface AjusteBody extends WithId {
  anulado: boolean;
  lotes_inventario: { id: number };
}
interface TurnoBody extends WithId {
  efectivo_esperado: string;
  movimientos_financieros: MovimientoBody[];
}
interface Deuda extends WithId {
  compra_id: number;
  saldo_pendiente: string;
  compra_anulada: boolean;
}
interface ErrorBody {
  message: string | string[];
}
interface ResultadosBody {
  gastos_operativos: string;
  mermas_inventario: string;
  retiros_duenos: string;
}
interface FlujoBody {
  gaveta: { entradas: string; salidas: string };
  boveda: { entradas: string; salidas: string };
}

/**
 * L12 · Anular sin borrar (ARQ-08, ADR 0012): gastos/retiros/aportes, compras
 * sin usar y mermas se marcan anulados con quién, cuándo y por qué, y revierten
 * su efecto exacto. Lo anulado no cuenta en reportes ni saldos.
 */
describe('Anular registros (e2e, L12)', () => {
  let app: INestApplication;
  let admin: string;
  let cajero: string;
  let productoId: number;
  let categoriaId: number;
  const sufijo = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (t: string = admin) => ({ Authorization: `Bearer ${t}` });
  const MOTIVO = 'Me equivoqué al registrar';

  async function abrirTurno(fondo = 100): Promise<number> {
    const res = await http()
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: fondo });
    expect(res.status).toBe(201);
    return (res.body as WithId).id;
  }

  async function esperado(): Promise<number> {
    const res = await http().get('/cajas-turnos/activa').set(auth());
    return Number((res.body as TurnoBody).efectivo_esperado);
  }

  async function saldoBoveda(): Promise<number> {
    const res = await http().get('/caja-general/saldo').set(auth());
    return Number((res.body as { saldo_actual: string }).saldo_actual);
  }

  async function resultados(): Promise<ResultadosBody> {
    const res = await http()
      .get('/reportes/estado-resultados?desde=2020-01-01&hasta=2035-01-01')
      .set(auth());
    return res.body as ResultadosBody;
  }

  async function flujo(): Promise<FlujoBody> {
    const res = await http()
      .get('/reportes/flujo-efectivo?desde=2020-01-01&hasta=2035-01-01')
      .set(auth());
    return res.body as FlujoBody;
  }

  async function deudasPatrimonio(): Promise<number> {
    const res = await http().get('/reportes/patrimonio').set(auth());
    return Number((res.body as { deudas: string }).deudas);
  }

  async function gasto(
    monto: number,
    origen: 'GAVETA' | 'BOVEDA' = 'GAVETA',
  ): Promise<MovimientoBody> {
    const res = await http()
      .post('/movimientos-financieros')
      .set(auth())
      .send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto,
        descripcion: `Gasto L12 ${sufijo}`,
        origen_fondos: origen,
      });
    expect(res.status).toBe(201);
    return res.body as MovimientoBody;
  }

  const anularMov = (
    id: number,
    token = admin,
    body: object = { motivo: MOTIVO },
  ) =>
    http()
      .patch(`/movimientos-financieros/${id}/anular`)
      .set(auth(token))
      .send(body);
  const anularCompra = (
    id: number,
    token = admin,
    body: object = { motivo: MOTIVO },
  ) => http().patch(`/compras/${id}/anular`).set(auth(token)).send(body);
  const anularAjuste = (
    id: number,
    token = admin,
    body: object = { motivo: MOTIVO },
  ) =>
    http()
      .patch(`/ajustes-inventario/${id}/anular`)
      .set(auth(token))
      .send(body);

  async function comprar(
    extra: Record<string, unknown>,
    cantidad = 1,
    costo = 10,
  ): Promise<CompraBody> {
    const res = await http()
      .post('/compras')
      .set(auth())
      .send({
        proveedor: `Proveedor L12 ${sufijo}`,
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: costo,
            cantidad_inicial: cantidad,
          },
        ],
        ...extra,
      });
    expect(res.status).toBe(201);
    return res.body as CompraBody;
  }

  async function leerCompra(id: number): Promise<CompraBody> {
    const res = await http().get(`/compras/${id}`).set(auth());
    return res.body as CompraBody;
  }

  const mensaje = (body: unknown) =>
    [(body as ErrorBody).message].flat().join(' ');

  beforeAll(async () => {
    app = await createTestApp();
    admin = await loginAsAdmin(app);
    await ensureNoOpenShift(app, admin);

    const nombre = `cajera-l12-${sufijo}`;
    await http()
      .post('/usuarios')
      .set(auth())
      .send({ nombre, rol: 'CAJERO', password: 'clave-l12-123' });
    const login = await http()
      .post('/auth/login')
      .send({ nombre, password: 'clave-l12-123' });
    cajero = (login.body as LoginBody).access_token;

    const cat = await http()
      .post('/categorias')
      .set(auth())
      .send({ nombre: `L12-cat-${sufijo}` });
    const prod = await http()
      .post('/productos')
      .set(auth())
      .send({
        nombre: `L12-prod-${sufijo}`,
        categoria_id: (cat.body as WithId).id,
      });
    productoId = (prod.body as WithId).id;
    categoriaId = (cat.body as WithId).id;
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, admin);
    await app.close();
  });

  describe('Gastos y movimientos de dinero', () => {
    it('gasto de la gaveta en turno abierto: el esperado vuelve atrás y deja de contar en resultados y flujo', async () => {
      await abrirTurno(100);
      const antes = {
        res: await resultados(),
        flujo: await flujo(),
      };

      const g = await gasto(5);
      expect(await esperado()).toBe(95);
      expect(Number((await resultados()).gastos_operativos)).toBe(
        Number(antes.res.gastos_operativos) + 5,
      );

      const res = await anularMov(g.id);
      expect(res.status).toBe(200);
      const body = res.body as MovimientoBody;
      expect(body.anulado).toBe(true);
      expect(body.motivo_anulacion).toBe(MOTIVO);
      expect(body.anulado_por?.nombre).toBe('admin');

      expect(await esperado()).toBe(100);
      expect(Number((await resultados()).gastos_operativos)).toBe(
        Number(antes.res.gastos_operativos),
      );
      const despues = await flujo();
      expect(Number(despues.gaveta.salidas)).toBe(
        Number(antes.flujo.gaveta.salidas),
      );

      // La fila sigue en el libro (marcada, no borrada).
      const turnos = await http().get('/cajas-turnos?limit=3').set(auth());
      const mov = (turnos.body as { items: TurnoBody[] }).items
        .flatMap((t) => t.movimientos_financieros)
        .find((m) => m.id === g.id);
      expect(mov?.anulado).toBe(true);
    });

    it('doble anulación → 400; sin motivo → 400; CAJERO → 403', async () => {
      const g = await gasto(2);

      const sinMotivo = await anularMov(g.id, admin, {});
      expect(sinMotivo.status).toBe(400);
      const soloEspacios = await anularMov(g.id, admin, { motivo: '   ' });
      expect(soloEspacios.status).toBe(400);

      const cajera = await anularMov(g.id, cajero);
      expect(cajera.status).toBe(403);

      expect((await anularMov(g.id)).status).toBe(200);
      const doble = await anularMov(g.id);
      expect(doble.status).toBe(400);
      expect(mensaje(doble.body)).toContain('ya está anulado');
    });

    it('un retiro personal anulado devuelve el efectivo a la gaveta y no cuenta como retiro', async () => {
      const antes = await resultados();
      const base = await esperado();
      const ret = await http()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'RETIRO_PERSONAL',
          monto: 7,
          descripcion: 'Retiro L12',
        });
      expect(ret.status).toBe(201);
      expect(await esperado()).toBe(base - 7);
      expect(Number((await resultados()).retiros_duenos)).toBe(
        Number(antes.retiros_duenos) + 7,
      );

      expect((await anularMov((ret.body as WithId).id)).status).toBe(200);
      expect(await esperado()).toBe(base);
      expect(Number((await resultados()).retiros_duenos)).toBe(
        Number(antes.retiros_duenos),
      );
    });

    it('un aporte de capital a la gaveta anulado quita el efectivo', async () => {
      const base = await esperado();
      const ing = await http()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'INGRESO_CAPITAL',
          monto: 20,
          descripcion: 'Aporte L12',
        });
      expect(ing.status).toBe(201);
      expect(await esperado()).toBe(base + 20);
      expect((await anularMov((ing.body as WithId).id)).status).toBe(200);
      expect(await esperado()).toBe(base);
    });

    it('los movimientos del sistema no se anulan directamente', async () => {
      const guardar = await http()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'RETIRO_BOVEDA',
          monto: 1,
          descripcion: 'Guardar L12',
        });
      expect(guardar.status).toBe(201);
      const res = await anularMov((guardar.body as WithId).id);
      expect(res.status).toBe(400);

      const compra = await comprar({
        estado_pago: 'PAGADO',
        origen_fondos: 'CAJA_POS',
      });
      const lista = await http()
        .get('/movimientos-financieros?tipo_movimiento=PAGO_PROVEEDOR')
        .set(auth());
      const pagoCompra = (lista.body as MovimientoBody[]).find(
        (m) => m.compra_id === compra.id,
      );
      expect(pagoCompra).toBeDefined();
      const directo = await anularMov(pagoCompra!.id);
      expect(directo.status).toBe(400);
      expect(mensaje(directo.body)).toContain('anulando la compra');
      // Limpieza: la compra sí se anula.
      expect((await anularCompra(compra.id)).status).toBe(200);
    });

    it('gasto de la gaveta de un turno cerrado → 400 y nada cambia', async () => {
      const g = await gasto(3);
      await ensureNoOpenShift(app, admin); // cierra el turno
      const antes = await resultados();

      const res = await anularMov(g.id);
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toContain('turno que ya se cerró');
      expect(Number((await resultados()).gastos_operativos)).toBe(
        Number(antes.gastos_operativos),
      );
    });

    it('gasto de la bóveda: se anula en cualquier momento y el saldo vuelve', async () => {
      await ensureNoOpenShift(app, admin);
      const inyeccion = await http()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 50, descripcion: 'Aporte L12' });
      expect(inyeccion.status).toBe(201);

      const base = await saldoBoveda();
      const antes = await resultados();
      const flujoAntes = await flujo();
      const g = await gasto(8, 'BOVEDA');
      expect(await saldoBoveda()).toBe(base - 8);

      const res = await anularMov(g.id);
      expect(res.status).toBe(200);
      expect(await saldoBoveda()).toBe(base);
      expect(Number((await resultados()).gastos_operativos)).toBe(
        Number(antes.gastos_operativos),
      );
      expect(Number((await flujo()).boveda.salidas)).toBe(
        Number(flujoAntes.boveda.salidas),
      );

      // El libro de bóveda lo sigue mostrando, marcado.
      const libro = await http().get('/caja-general').set(auth());
      const fila = (libro.body as MovimientoBody[]).find((m) => m.id === g.id);
      expect(fila?.anulado).toBe(true);
    });
  });

  describe('Compras', () => {
    it('pagada desde la gaveta: lotes en 0, el dinero vuelve y el pago queda anulado', async () => {
      await abrirTurno(100);
      const compra = await comprar(
        { estado_pago: 'PAGADO', origen_fondos: 'CAJA_POS' },
        2,
        10,
      );
      expect(await esperado()).toBe(80);

      const res = await anularCompra(compra.id);
      expect(res.status).toBe(200);
      const body = res.body as CompraBody;
      expect(body.anulado).toBe(true);
      expect(body.motivo_anulacion).toBe(MOTIVO);
      expect(body.anulado_por?.nombre).toBe('admin');
      expect(
        body.lotes_inventario.map((l) => Number(l.cantidad_disponible)),
      ).toEqual([0]);

      expect(await esperado()).toBe(100);
      const lista = await http()
        .get('/movimientos-financieros?tipo_movimiento=PAGO_PROVEEDOR')
        .set(auth());
      const pago = (lista.body as MovimientoBody[]).find(
        (m) => m.compra_id === compra.id,
      );
      expect(pago?.anulado).toBe(true);

      const doble = await anularCompra(compra.id);
      expect(doble.status).toBe(400);
      expect(mensaje(doble.body)).toContain('ya está anulada');
    });

    it('pagada desde la bóveda: el saldo vuelve', async () => {
      await ensureNoOpenShift(app, admin);
      await http()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 40, descripcion: 'Aporte L12 compra' });
      const base = await saldoBoveda();
      const compra = await comprar({
        estado_pago: 'PAGADO',
        origen_fondos: 'CAJA_GENERAL',
      });
      expect(await saldoBoveda()).toBe(base - 10);

      expect((await anularCompra(compra.id)).status).toBe(200);
      expect(await saldoBoveda()).toBe(base);
      expect(
        (await leerCompra(compra.id)).lotes_inventario.map((l) =>
          Number(l.cantidad_disponible),
        ),
      ).toEqual([0]);
    });

    it('al crédito sin abonos: la deuda queda saldada', async () => {
      const deudasAntes = await deudasPatrimonio();
      const compra = await comprar({ estado_pago: 'AL_CREDITO' }, 1, 15);
      expect(await deudasPatrimonio()).toBe(deudasAntes + 15);

      expect((await anularCompra(compra.id)).status).toBe(200);
      expect(await deudasPatrimonio()).toBe(deudasAntes);

      const todas = await http()
        .get('/cuentas-por-pagar?estado=todas')
        .set(auth());
      const deuda = (todas.body as Deuda[]).find(
        (d) => d.compra_id === compra.id,
      );
      expect(Number(deuda?.saldo_pendiente)).toBe(0);
      expect(deuda?.compra_anulada).toBe(true);
    });

    it('al crédito con abonos → 400 claro', async () => {
      await abrirTurno(100);
      const compra = await comprar({ estado_pago: 'AL_CREDITO' }, 1, 15);
      const pend = await http()
        .get('/cuentas-por-pagar?estado=pendientes')
        .set(auth());
      const deuda = (pend.body as Deuda[]).find(
        (d) => d.compra_id === compra.id,
      )!;
      const abono = await http()
        .post(`/cuentas-por-pagar/${deuda.id}/abonos`)
        .set(auth())
        .send({ monto: 5, origen: 'GAVETA' });
      expect(abono.status).toBe(201);

      const res = await anularCompra(compra.id);
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toContain('ya tiene pagos');
      expect((await leerCompra(compra.id)).anulado).toBe(false);
    });

    it('con un lote ya vendido → 400 y no cambia nada', async () => {
      // Producto propio: el FIFO vende primero los lotes más viejos de un
      // mismo producto, y aquí la venta debe caer en el lote de esta compra.
      const prod = await http()
        .post('/productos')
        .set(auth())
        .send({ nombre: `L12-vendido-${sufijo}`, categoria_id: categoriaId });
      const pid = (prod.body as WithId).id;
      const pres = await http().post('/presentaciones').set(auth()).send({
        producto_id: pid,
        descripcion: 'Unidad',
        factor_conversion: 1,
        precio_venta: 20,
      });
      const compraRes = await http()
        .post('/compras')
        .set(auth())
        .send({
          proveedor: 'Proveedor L12',
          estado_pago: 'PAGADO',
          origen_fondos: 'CAPITAL_DUEÑOS',
          detalles_lotes: [
            {
              producto_id: pid,
              costo_unitario_adquisicion: 4,
              cantidad_inicial: 5,
            },
          ],
        });
      expect(compraRes.status).toBe(201);
      const compra = compraRes.body as CompraBody;
      const venta = await http()
        .post('/ventas')
        .set(auth())
        .send({
          detalles: [
            { presentacion_id: (pres.body as WithId).id, cantidad: 1 },
          ],
        });
      expect(venta.status).toBe(201);

      const res = await anularCompra(compra.id);
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toContain('Ya se vendió o se usó mercadería');
      const despues = await leerCompra(compra.id);
      expect(despues.anulado).toBe(false);
      expect(
        despues.lotes_inventario.map((l) => Number(l.cantidad_disponible)),
      ).toEqual([4]);
    });

    it('pagada desde la gaveta de un turno cerrado → 400', async () => {
      const compra = await comprar(
        { estado_pago: 'PAGADO', origen_fondos: 'CAJA_POS' },
        1,
        3,
      );
      await ensureNoOpenShift(app, admin);
      const res = await anularCompra(compra.id);
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toContain('turno que ya se cerró');
    });

    it('CAJERO → 403; sin motivo → 400', async () => {
      const compra = await comprar({
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
      });
      expect((await anularCompra(compra.id, cajero)).status).toBe(403);
      expect((await anularCompra(compra.id, admin, {})).status).toBe(400);
      expect((await anularCompra(compra.id)).status).toBe(200);
    });
  });

  describe('Mermas', () => {
    async function merma(loteId: number, cantidad: number, tipo = 'QUEBRADO') {
      const res = await http().post('/ajustes-inventario').set(auth()).send({
        lote_id: loteId,
        cantidad_ajustada: cantidad,
        tipo_ajuste: tipo,
        justificacion: 'Se cayó',
      });
      expect(res.status).toBe(201);
      return res.body as AjusteBody;
    }

    it('anular una merma devuelve la cantidad al lote y deja de contar como pérdida', async () => {
      const compra = await comprar(
        { estado_pago: 'PAGADO', origen_fondos: 'CAPITAL_DUEÑOS' },
        10,
        2,
      );
      const loteId = (await leerCompra(compra.id)).lotes_inventario[0].id;
      const antes = await resultados();

      const m = await merma(loteId, 3);
      expect(
        Number(
          (await leerCompra(compra.id)).lotes_inventario[0].cantidad_disponible,
        ),
      ).toBe(7);
      expect(Number((await resultados()).mermas_inventario)).toBe(
        Number(antes.mermas_inventario) + 6,
      );

      expect((await anularAjuste(m.id, cajero)).status).toBe(403);
      expect((await anularAjuste(m.id, admin, {})).status).toBe(400);

      const res = await anularAjuste(m.id);
      expect(res.status).toBe(200);
      expect((res.body as AjusteBody).anulado).toBe(true);
      expect(
        Number(
          (await leerCompra(compra.id)).lotes_inventario[0].cantidad_disponible,
        ),
      ).toBe(10);
      expect(Number((await resultados()).mermas_inventario)).toBe(
        Number(antes.mermas_inventario),
      );

      const doble = await anularAjuste(m.id);
      expect(doble.status).toBe(400);
      expect(mensaje(doble.body)).toContain('ya está anulada');
    });

    it('un conteo sobrante no se anula', async () => {
      const compra = await comprar(
        { estado_pago: 'PAGADO', origen_fondos: 'CAPITAL_DUEÑOS' },
        2,
        2,
      );
      const loteId = (await leerCompra(compra.id)).lotes_inventario[0].id;
      const sob = await merma(loteId, 1, 'CONTEO_SOBRANTE');
      const res = await anularAjuste(sob.id);
      expect(res.status).toBe(400);
      expect(mensaje(res.body)).toContain('conteo sobrante');
    });
  });
});
