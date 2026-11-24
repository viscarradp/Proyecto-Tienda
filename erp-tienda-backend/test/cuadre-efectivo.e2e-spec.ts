import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
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
interface VentaBody {
  id: number;
  total: string;
  avisos: string[];
  detalle_ventas: { id: number; cantidad: string }[];
}
interface TurnoBody {
  id: number;
  fondo_inicial: string;
  efectivo_esperado: string;
  avisos?: string[];
}
interface SaldoBody {
  saldo_actual: string | number;
}
interface PatrimonioBody {
  efectivo: { gaveta: string; boveda: string; total: string };
  patrimonio_neto: string;
}
interface ResultadosBody {
  utilidad_neta: string;
  faltantes: string;
}
interface UltimoCierreBody {
  fondo_siguiente: string;
}

const dinero = (v: Prisma.Decimal | string | number | null | undefined) =>
  Number(v ?? 0);

/**
 * ARQ-19 · Invariante de cuadre del efectivo (reconciliación). Recorre un día
 * realista y, en cada paso clave, verifica contra el libro de la base de datos:
 *
 *  1. efectivo_esperado = fondo + ventas completadas − devoluciones
 *                         + entradas a GAVETA − salidas de GAVETA (libro).
 *  2. saldo de bóveda   = Σ destino BOVEDA − Σ origen BOVEDA (libro completo).
 *  3. patrimonio        = base + aportes − retiros + Δ utilidad neta
 *                         (+ el costo de los pendientes de stock aún abiertos,
 *                         que el estado de resultados ya descontó pero el
 *                         inventario todavía no).
 *
 * No depende de otros archivos: crea sus productos/usuarios y mide todo contra
 * una foto tomada al empezar.
 */
describe('Cuadre del efectivo — un día completo (e2e, ARQ-19)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let cajero: string;
  const sufijo = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // Productos
  let prodA = 0; // costo 2, precio 5
  let prodB = 0; // costo 1, precio 3.50
  let prodC = 0; // costo 1.50, precio 4 (con 1 sola unidad en stock)
  let presA = 0;
  let presB = 0;
  let presC = 0;

  // Estado del escenario
  let turnoId = 0;
  let fondoInicial = 0;
  let aporteApertura = 0;
  let base: { patrimonio: number; utilidad: number; boveda: number };
  /** Aportes (+) y retiros (−) de la dueña acumulados desde la foto inicial. */
  let capitalNeto = 0;
  /** Saldo esperado de la bóveda según nuestras propias cuentas. */
  let bovedaEsperada = 0;

  async function crearProducto(
    nombre: string,
    precio: number,
  ): Promise<{ productoId: number; presentacionId: number }> {
    const cat = await http()
      .post('/categorias')
      .set(auth(admin))
      .send({ nombre: `Cuadre-cat-${nombre}-${sufijo}` });
    const prod = await http()
      .post('/productos')
      .set(auth(admin))
      .send({
        nombre: `Cuadre-${nombre}-${sufijo}`,
        categoria_id: (cat.body as WithId).id,
      });
    const productoId = (prod.body as WithId).id;
    const pres = await http().post('/presentaciones').set(auth(admin)).send({
      producto_id: productoId,
      descripcion: 'Unidad',
      factor_conversion: 1,
      precio_venta: precio,
    });
    expect(pres.status).toBe(201);
    return { productoId, presentacionId: (pres.body as WithId).id };
  }

  const comprarCapital = (
    productoId: number,
    cantidad: number,
    costo: number,
  ) =>
    http()
      .post('/compras')
      .set(auth(admin))
      .send({
        proveedor: 'Cuadre-E2E',
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

  async function vender(
    detalles: { presentacion_id: number; cantidad?: number; monto?: number }[],
  ): Promise<VentaBody> {
    const res = await http()
      .post('/ventas')
      .set(auth(cajero))
      .send({ detalles });
    expect(res.status).toBe(201);
    return res.body as VentaBody;
  }

  async function turnoActivo(): Promise<TurnoBody> {
    const res = await http().get('/cajas-turnos/activa').set(auth(cajero));
    expect(res.status).toBe(200);
    return res.body as TurnoBody;
  }

  async function saldoBovedaEndpoint(): Promise<number> {
    const res = await http().get('/caja-general/saldo').set(auth(cajero));
    return dinero((res.body as SaldoBody).saldo_actual);
  }

  async function saldoBovedaLibro(): Promise<number> {
    const [entra, sale] = await Promise.all([
      prisma.movimientos_financieros.aggregate({
        where: { cuenta_destino: 'BOVEDA', anulado: false },
        _sum: { monto: true },
      }),
      prisma.movimientos_financieros.aggregate({
        where: { cuenta_origen: 'BOVEDA', anulado: false },
        _sum: { monto: true },
      }),
    ]);
    return dinero(entra._sum.monto) - dinero(sale._sum.monto);
  }

  async function patrimonio(): Promise<PatrimonioBody> {
    const res = await http().get('/reportes/patrimonio').set(auth(admin));
    expect(res.status).toBe(200);
    return res.body as PatrimonioBody;
  }

  async function resultados(): Promise<ResultadosBody> {
    const res = await http()
      .get('/reportes/estado-resultados?desde=2020-01-01&hasta=2030-12-31')
      .set(auth(admin));
    expect(res.status).toBe(200);
    return res.body as ResultadosBody;
  }

  /** Costo estimado de los pendientes de stock aún abiertos de nuestros productos. */
  async function costoPendientesAbiertos(): Promise<number> {
    const filas = await prisma.pendientes_stock.findMany({
      where: {
        producto_id: { in: [prodA, prodB, prodC] },
        cantidad_pendiente: { gt: 0 },
      },
    });
    return filas.reduce(
      (acc, p) =>
        acc + dinero(p.cantidad_pendiente) * dinero(p.costo_unitario_estimado),
      0,
    );
  }

  /** Efectivo del turno según el libro, sin mirar efectivo_esperado. */
  async function esperadoSegunLibro(): Promise<number> {
    const [ventas, devol, movs] = await Promise.all([
      prisma.ventas.aggregate({
        where: { caja_turno_id: turnoId, estado: 'COMPLETADA' },
        _sum: { total: true },
      }),
      prisma.devoluciones.aggregate({
        where: { caja_turno_id: turnoId },
        _sum: { total_reembolsado: true },
      }),
      prisma.movimientos_financieros.findMany({
        where: { caja_turno_id: turnoId, anulado: false },
      }),
    ]);
    // El asiento de la apertura ya está dentro del fondo (D-15): no se vuelve a sumar.
    const delLibro = movs.filter((m) => !m.es_apertura);
    const entradas = delLibro
      .filter((m) => m.cuenta_destino === 'GAVETA')
      .reduce((a, m) => a + dinero(m.monto), 0);
    const salidas = delLibro
      .filter((m) => m.cuenta_origen === 'GAVETA')
      .reduce((a, m) => a + dinero(m.monto), 0);
    return (
      fondoInicial +
      dinero(ventas._sum.total) -
      dinero(devol._sum.total_reembolsado) +
      entradas -
      salidas
    );
  }

  /** Las tres invariantes, en cualquier punto con el turno abierto. */
  async function verificarCuadre(paso: string, esperadoReal?: number) {
    const turno = await turnoActivo();
    const esperado = dinero(turno.efectivo_esperado);
    const segunLibro = await esperadoSegunLibro();
    expect({ paso, esperado }).toEqual({
      paso,
      esperado: expect.closeTo(segunLibro, 2) as number,
    });
    if (esperadoReal !== undefined) {
      expect(esperado).toBeCloseTo(esperadoReal, 2);
    }

    // Bóveda: endpoint = libro = nuestras cuentas.
    const libro = await saldoBovedaLibro();
    expect(await saldoBovedaEndpoint()).toBeCloseTo(libro, 2);
    expect(libro).toBeCloseTo(bovedaEsperada, 2);

    // Patrimonio: gaveta y bóveda del reporte son las mismas; el neto solo se
    // mueve por aportes, retiros y utilidad.
    const pat = await patrimonio();
    expect(dinero(pat.efectivo.gaveta)).toBeCloseTo(esperado, 2);
    expect(dinero(pat.efectivo.boveda)).toBeCloseTo(libro, 2);
    const util = dinero((await resultados()).utilidad_neta);
    const esperadoNeto =
      base.patrimonio +
      capitalNeto +
      (util - base.utilidad) +
      (await costoPendientesAbiertos());
    expect({ paso, neto: dinero(pat.patrimonio_neto) }).toEqual({
      paso,
      neto: expect.closeTo(esperadoNeto, 1) as number,
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginAsAdmin(app);
    await ensureNoOpenShift(app, admin);

    const nombre = `cajera-cuadre-${sufijo}`;
    const u = await http()
      .post('/usuarios')
      .set(auth(admin))
      .send({ nombre, rol: 'CAJERO', password: 'clave-cuadre-123' });
    expect(u.status).toBe(201);
    const login = await http()
      .post('/auth/login')
      .send({ nombre, password: 'clave-cuadre-123' });
    cajero = (login.body as LoginBody).access_token;

    ({ productoId: prodA, presentacionId: presA } = await crearProducto(
      'A',
      5,
    ));
    ({ productoId: prodB, presentacionId: presB } = await crearProducto(
      'B',
      3.5,
    ));
    ({ productoId: prodC, presentacionId: presC } = await crearProducto(
      'C',
      4,
    ));
    await comprarCapital(prodA, 10, 2);
    await comprarCapital(prodB, 20, 1);
    await comprarCapital(prodC, 1, 1.5);

    // Una deuda con proveedor para el abono del día (compra al crédito: no mueve efectivo).
    const credito = await http()
      .post('/compras')
      .set(auth(admin))
      .send({
        proveedor: 'Cuadre-Proveedor',
        estado_pago: 'AL_CREDITO',
        detalles_lotes: [
          {
            producto_id: prodB,
            costo_unitario_adquisicion: 1,
            cantidad_inicial: 10,
          },
        ],
      });
    expect(credito.status).toBe(201);

    // Aporte a la bóveda para que haya de dónde traer (la dueña inyecta $50).
    const iny = await http()
      .post('/caja-general/inyeccion')
      .set(auth(admin))
      .send({ monto: 50, descripcion: 'Aporte cuadre' });
    expect(iny.status).toBe(201);

    // Foto inicial (con todo lo del setup ya hecho y sin turno abierto).
    base = {
      patrimonio: dinero((await patrimonio()).patrimonio_neto),
      utilidad: dinero((await resultados()).utilidad_neta),
      boveda: await saldoBovedaLibro(),
    };
    bovedaEsperada = base.boveda;
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, admin);
    await app.close();
  });

  it('1. abre con fondo: el asiento de la diferencia explica el salto y no duplica el esperado', async () => {
    const ult = await http()
      .get('/cajas-turnos/ultimo-cierre')
      .set(auth(cajero));
    const remanente = dinero((ult.body as UltimoCierreBody).fondo_siguiente);
    aporteApertura = 100;
    fondoInicial = Math.round((remanente + aporteApertura) * 100) / 100;

    const res = await http()
      .post('/cajas-turnos/abrir')
      .set(auth(cajero))
      .send({ fondo_inicial: fondoInicial, origen_diferencia: 'APORTE' });
    expect(res.status).toBe(201);
    const turno = res.body as TurnoBody;
    turnoId = turno.id;
    expect(dinero(turno.efectivo_esperado)).toBeCloseTo(fondoInicial, 2);
    capitalNeto += aporteApertura; // aporte de la dueña: patrimonio sube $100

    const asiento = await prisma.movimientos_financieros.findMany({
      where: { caja_turno_id: turnoId, anulado: false },
    });
    expect(asiento).toHaveLength(1);
    expect(asiento[0].tipo_movimiento).toBe('INGRESO_CAPITAL');
    expect(dinero(asiento[0].monto)).toBe(aporteApertura);

    await verificarCuadre('apertura', fondoInicial);
  });

  it('2. venta por cantidad (varios productos) suma al esperado', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const v = await vender([
      { presentacion_id: presA, cantidad: 2 },
      { presentacion_id: presB, cantidad: 1 },
    ]);
    expect(dinero(v.total)).toBe(13.5);
    await verificarCuadre('venta por cantidad', antes + 13.5);
  });

  it('3. venta por monto ($1.00 de B) suma exactamente el monto', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const v = await vender([{ presentacion_id: presB, monto: 1 }]);
    expect(dinero(v.total)).toBe(1);
    expect(Number(v.detalle_ventas[0].cantidad)).toBeCloseTo(0.286, 3);
    await verificarCuadre('venta por monto', antes + 1);
  });

  it('4. venta sin stock: el efectivo sube igual y el pendiente cuenta como costo, no como inventario', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    // C tiene 1 unidad: 1 sale del lote y 2 quedan pendientes (costo 1.50).
    const v = await vender([{ presentacion_id: presC, cantidad: 3 }]);
    expect(dinero(v.total)).toBe(12);
    expect(v.avisos).toHaveLength(1);
    expect(await costoPendientesAbiertos()).toBeCloseTo(3, 2);
    await verificarCuadre('venta sin stock', antes + 12);
  });

  it('5. anulación: el efectivo vuelve a donde estaba y el stock regresa', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const v = await vender([{ presentacion_id: presA, cantidad: 1 }]);
    await verificarCuadre('antes de anular', antes + 5);

    const res = await http()
      .patch(`/ventas/${v.id}/anular`)
      .set(auth(cajero))
      .send({ justificacion_nula: 'Error de cobro (cuadre e2e)' });
    expect(res.status).toBe(200);
    await verificarCuadre('anulación', antes);
  });

  it('6. devolución con reingreso resta el reembolso del esperado', async () => {
    const venta = await vender([{ presentacion_id: presA, cantidad: 2 }]);
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const res = await http()
      .post(`/ventas/${venta.id}/devolucion`)
      .set(auth(cajero))
      .send({
        detalles: [
          {
            detalle_venta_id: venta.detalle_ventas[0].id,
            cantidad: 1,
            destino: 'REINGRESO',
          },
        ],
        justificacion: 'Cliente se arrepintió',
      });
    expect(res.status).toBe(201);
    await verificarCuadre('devolución', antes - 5);
  });

  it('7. gasto de gaveta (cajera) resta del esperado', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const res = await http()
      .post('/movimientos-financieros')
      .set(auth(cajero))
      .send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto: 7.25,
        descripcion: 'Bolsas y cinta (cuadre e2e)',
      });
    expect(res.status).toBe(201);
    await verificarCuadre('gasto de gaveta', antes - 7.25);
  });

  it('8. guardar en bóveda baja la gaveta y sube la bóveda en lo mismo', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const res = await http()
      .post('/movimientos-financieros')
      .set(auth(cajero))
      .send({
        tipo_movimiento: 'RETIRO_BOVEDA',
        monto: 30,
        descripcion: 'Guardar en bóveda (cuadre e2e)',
      });
    expect(res.status).toBe(201);
    bovedaEsperada += 30;
    await verificarCuadre('guardar en bóveda', antes - 30);
  });

  it('9. traer de la bóveda sube la gaveta y baja la bóveda en lo mismo', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const res = await http()
      .post('/movimientos-financieros')
      .set(auth(admin))
      .send({
        tipo_movimiento: 'TRASLADO_DESDE_BOVEDA',
        monto: 10,
        descripcion: 'Traer de la bóveda (cuadre e2e)',
      });
    expect(res.status).toBe(201);
    bovedaEsperada -= 10;
    await verificarCuadre('traer de la bóveda', antes + 10);
  });

  it('10. retiro personal de la dueña resta de la gaveta y del patrimonio', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const res = await http()
      .post('/movimientos-financieros')
      .set(auth(admin))
      .send({
        tipo_movimiento: 'RETIRO_PERSONAL',
        monto: 15,
        descripcion: 'Retiro personal (cuadre e2e)',
      });
    expect(res.status).toBe(201);
    capitalNeto -= 15;
    await verificarCuadre('retiro personal', antes - 15);
  });

  it('11. compra pagada desde la gaveta (varios productos) resta lo calculado y cubre el pendiente', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const res = await http()
      .post('/compras')
      .set(auth(admin))
      .send({
        proveedor: 'Cuadre-Compra',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAJA_POS',
        detalles_lotes: [
          // Mismo costo que el estimado del pendiente (1.50): el patrimonio
          // y el estado de resultados quedan alineados.
          {
            producto_id: prodC,
            costo_unitario_adquisicion: 1.5,
            cantidad_inicial: 5,
          },
          {
            producto_id: prodB,
            costo_unitario_adquisicion: 1,
            cantidad_inicial: 4,
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(await costoPendientesAbiertos()).toBe(0);
    await verificarCuadre('compra desde la gaveta', antes - 11.5);
  });

  it('12. abono a una deuda desde la gaveta resta del esperado y baja la deuda', async () => {
    const antes = dinero((await turnoActivo()).efectivo_esperado);
    const deudas = await http().get('/cuentas-por-pagar').set(auth(admin));
    const deuda = (
      deudas.body as { id: number; acreedor: string; saldo_pendiente: string }[]
    ).find((d) => d.acreedor === 'Cuadre-Proveedor');
    expect(deuda).toBeDefined();
    const res = await http()
      .post(`/cuentas-por-pagar/${deuda?.id}/abonos`)
      .set(auth(admin))
      .send({ monto: 4, origen: 'GAVETA' });
    expect(res.status).toBe(201);
    expect(
      Number((res.body as { saldo_pendiente: string }).saldo_pendiente),
    ).toBe(Number(deuda?.saldo_pendiente) - 4);
    await verificarCuadre('abono a deuda', antes - 4);
  });

  it('13. cierre con faltante y traslado a bóveda: todo sigue cuadrando', async () => {
    const turno = await turnoActivo();
    const esperado = dinero(turno.efectivo_esperado);
    const declarado = Math.round((esperado - 3) * 100) / 100;
    const aBoveda = 40;

    const res = await http()
      .patch(`/cajas-turnos/${turnoId}/cerrar`)
      .set(auth(cajero))
      .send({
        efectivo_declarado: declarado,
        monto_a_boveda: aBoveda,
        observaciones: 'Faltaron $3 (cuadre e2e)',
      });
    expect(res.status).toBe(200);
    bovedaEsperada += aBoveda;

    // El faltante quedó en el libro: GAVETA → GASTO por $3.
    const faltante = await prisma.movimientos_financieros.findMany({
      where: { caja_turno_id: turnoId, tipo_movimiento: 'AJUSTE_FALTANTE' },
    });
    expect(faltante).toHaveLength(1);
    expect(dinero(faltante[0].monto)).toBeCloseTo(3, 2);
    expect(faltante[0].cuenta_origen).toBe('GAVETA');
    expect(faltante[0].cuenta_destino).toBe('GASTO');

    // Sin turno: la gaveta es el remanente = declarado − traslado.
    const ult = await http()
      .get('/cajas-turnos/ultimo-cierre')
      .set(auth(cajero));
    const remanente = dinero((ult.body as UltimoCierreBody).fondo_siguiente);
    expect(remanente).toBeCloseTo(declarado - aBoveda, 2);

    const pat = await patrimonio();
    expect(dinero(pat.efectivo.gaveta)).toBeCloseTo(remanente, 2);

    // Bóveda: endpoint = libro = cuentas propias.
    const libro = await saldoBovedaLibro();
    expect(await saldoBovedaEndpoint()).toBeCloseTo(libro, 2);
    expect(libro).toBeCloseTo(bovedaEsperada, 2);
    expect(dinero(pat.efectivo.boveda)).toBeCloseTo(libro, 2);

    // Patrimonio: solo cambió por aportes, retiros y la utilidad (que ya
    // incluye el faltante de $3 como pérdida). Sin pendientes abiertos.
    const resultadosFinal = await resultados();
    const esperadoNeto =
      base.patrimonio +
      capitalNeto +
      (dinero(resultadosFinal.utilidad_neta) - base.utilidad);
    expect(dinero(pat.patrimonio_neto)).toBeCloseTo(esperadoNeto, 1);

    // El faltante se nota en el estado de resultados.
    expect(dinero(resultadosFinal.faltantes)).toBeGreaterThanOrEqual(3);
  });

  it('14. al reabrir con el remanente no hay diferencia ni asiento nuevo', async () => {
    const ult = await http()
      .get('/cajas-turnos/ultimo-cierre')
      .set(auth(cajero));
    const remanente = dinero((ult.body as UltimoCierreBody).fondo_siguiente);
    const patAntes = dinero((await patrimonio()).patrimonio_neto);

    const res = await http()
      .post('/cajas-turnos/abrir')
      .set(auth(cajero))
      .send({ fondo_inicial: remanente });
    expect(res.status).toBe(201);
    const turno = res.body as TurnoBody;
    expect(turno.avisos ?? []).toEqual([]);
    expect(
      await prisma.movimientos_financieros.count({
        where: { caja_turno_id: turno.id },
      }),
    ).toBe(0);
    expect(dinero((await patrimonio()).patrimonio_neto)).toBeCloseTo(
      patAntes,
      2,
    );
  });
});
