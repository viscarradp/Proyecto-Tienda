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
interface PatrimonioBody {
  inventario: string | number;
  efectivo: {
    gaveta: string | number;
    boveda: string | number;
    total: string | number;
  };
  activos_fijos: string | number;
  deudas: string | number;
  patrimonio_neto: string | number;
}
interface FlujoBody {
  ventas_efectivo: string | number;
  gaveta: { entradas: string | number; salidas: string | number; neto: string | number };
  boveda: { entradas: string | number; salidas: string | number; neto: string | number };
}

/**
 * Cubre el Bloque 3.A (ítem 15): endpoint de patrimonio (foto de balance) y de
 * flujo de efectivo por cuenta. Verifica las invariantes contables clave:
 * inyectar capital sube el patrimonio, comprar a crédito NO lo cambia (activo =
 * pasivo), y el neto de bóveda del flujo == saldo derivado del libro.
 */
describe('Reportes — patrimonio y flujo de efectivo (e2e, 3.A)', () => {
  let app: INestApplication;
  let token: string;

  const RANGO = 'desde=2020-01-01&hasta=2030-01-01';

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

  async function patrimonio(): Promise<PatrimonioBody> {
    const res = await request(app.getHttpServer())
      .get('/reportes/patrimonio')
      .set(auth());
    return res.body as PatrimonioBody;
  }

  async function flujo(): Promise<FlujoBody> {
    const res = await request(app.getHttpServer())
      .get(`/reportes/flujo-efectivo?${RANGO}`)
      .set(auth());
    return res.body as FlujoBody;
  }

  async function nuevoProducto(nombre: string): Promise<number> {
    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set(auth())
      .send({ nombre: `${nombre}-cat-${Date.now()}` });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set(auth())
      .send({ nombre, categoria_id: (cat.body as WithId).id });
    return (prod.body as WithId).id;
  }

  it('inyectar capital, aporte en especie y compra a crédito mueven el patrimonio correctamente', async () => {
    const p0 = await patrimonio();

    // 1) Inyección de capital a bóveda: +100 efectivo → +100 patrimonio.
    await request(app.getHttpServer())
      .post('/caja-general/inyeccion')
      .set(auth())
      .send({ monto: 100, descripcion: 'Patrimonio-E2E' });

    // 2) Aporte en especie (compra PAGADO/CAPITAL_DUEÑOS): +20 inventario, sin caja.
    const prodId = await nuevoProducto('Patrimonio-E2E');
    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Patrimonio-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          { producto_id: prodId, costo_unitario_adquisicion: 2, cantidad_inicial: 10 },
        ],
      });

    // 3) Compra a crédito: +30 inventario y +30 deuda → patrimonio neto sin cambio.
    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'Patrimonio-E2E',
        estado_pago: 'AL_CREDITO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          { producto_id: prodId, costo_unitario_adquisicion: 3, cantidad_inicial: 10 },
        ],
      });

    const p1 = await patrimonio();

    // Bóveda subió 100 (la inyección).
    expect(Number(p1.efectivo.boveda)).toBeCloseTo(Number(p0.efectivo.boveda) + 100);
    // Inventario subió 50 (20 en especie + 30 a crédito).
    expect(Number(p1.inventario)).toBeCloseTo(Number(p0.inventario) + 50);
    // Deudas subieron 30 (la compra a crédito).
    expect(Number(p1.deudas)).toBeCloseTo(Number(p0.deudas) + 30);
    // Patrimonio neto: +100 (capital) +20 (especie) +0 (crédito: activo = pasivo) = +120.
    expect(Number(p1.patrimonio_neto)).toBeCloseTo(
      Number(p0.patrimonio_neto) + 120,
    );
  });

  it('el neto de bóveda del flujo de efectivo coincide con el saldo derivado', async () => {
    const f = await flujo();
    const saldoRes = await request(app.getHttpServer())
      .get('/caja-general/saldo')
      .set(auth());
    const saldo = Number(
      (saldoRes.body as { saldo_actual: string | number }).saldo_actual,
    );
    expect(Number(f.boveda.neto)).toBeCloseTo(saldo);
  });

  it('una venta aparece como entrada de efectivo a la gaveta', async () => {
    const prodId = await nuevoProducto('FlujoVenta-E2E');
    const pres = await request(app.getHttpServer())
      .post('/presentaciones')
      .set(auth())
      .send({
        producto_id: prodId,
        descripcion: 'Unidad',
        factor_conversion: 1,
        precio_venta: 10,
      });
    const presentacionId = (pres.body as WithId).id;
    await request(app.getHttpServer())
      .post('/compras')
      .set(auth())
      .send({
        proveedor: 'FlujoVenta-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          { producto_id: prodId, costo_unitario_adquisicion: 5, cantidad_inicial: 10 },
        ],
      });

    await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: 50 });

    const f0 = await flujo();
    await request(app.getHttpServer())
      .post('/ventas')
      .set(auth())
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 3 }] });
    const f1 = await flujo();

    // La venta de 30 entra a la gaveta y a ventas_efectivo.
    expect(Number(f1.ventas_efectivo)).toBeCloseTo(Number(f0.ventas_efectivo) + 30);
    expect(Number(f1.gaveta.entradas)).toBeCloseTo(Number(f0.gaveta.entradas) + 30);
  });
});
