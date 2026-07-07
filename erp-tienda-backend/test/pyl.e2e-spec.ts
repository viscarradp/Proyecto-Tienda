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
interface ProductoBody {
  id: number;
  lotes_inventario: { id: number }[];
}
interface ReporteBody {
  mermas_inventario: string | number;
  faltantes: string | number;
  sobrantes: string | number;
}

/**
 * Cubre el Bloque 2.A: la merma se registra aunque no haya turno abierto (§4) y
 * el estado de resultados expone/afecta faltantes y sobrantes.
 */
describe('P&L — faltantes y merma sin turno (e2e, 2.A)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);
  });

  afterAll(async () => {
    await app.close();
  });

  async function reporte(): Promise<ReporteBody> {
    const res = await request(app.getHttpServer())
      .get('/reportes/estado-resultados?desde=2020-01-01&hasta=2030-01-01')
      .set('Authorization', `Bearer ${token}`);
    return res.body as ReporteBody;
  }

  it('registra una merma SIN turno abierto y la refleja en el P&L', async () => {
    // Producto + lote como aporte del dueño (sin turno ni caja).
    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Merma-E2E' });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Pan-E2E', categoria_id: (cat.body as WithId).id });
    const prodId = (prod.body as WithId).id;
    await request(app.getHttpServer())
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedor: 'Merma-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: prodId,
            costo_unitario_adquisicion: 2,
            cantidad_inicial: 10,
          },
        ],
      });

    const detalle = await request(app.getHttpServer())
      .get('/productos')
      .set('Authorization', `Bearer ${token}`);
    const p = (detalle.body as ProductoBody[]).find((x) => x.id === prodId);
    const loteId = p!.lotes_inventario[0].id;

    const mermasAntes = Number((await reporte()).mermas_inventario);

    // Aseguramos que NO hay turno abierto y aun así la merma se asienta.
    await ensureNoOpenShift(app, token);
    const ajuste = await request(app.getHttpServer())
      .post('/ajustes-inventario')
      .set('Authorization', `Bearer ${token}`)
      .send({ lote_id: loteId, cantidad_ajustada: 3, tipo_ajuste: 'QUEBRADO' });
    expect(ajuste.status).toBe(201);

    // La merma (3 × 2 = 6) llegó al P&L aunque no había turno.
    expect(Number((await reporte()).mermas_inventario)).toBeCloseTo(
      mermasAntes + 6,
    );
  });

  it('un faltante de caja baja la utilidad y se reporta como faltante', async () => {
    const faltantesAntes = Number((await reporte()).faltantes);

    // Abrir con 100 y cerrar declarando 98 (faltante de 2) con justificación.
    const abrir = await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ fondo_inicial: 100 });
    const turnoId = (abrir.body as WithId).id;

    const cerrar = await request(app.getHttpServer())
      .patch(`/cajas-turnos/${turnoId}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivo_declarado: 98, observaciones: 'Prueba de faltante' });
    expect(cerrar.status).toBe(200);

    // El faltante de 2 llegó al reporte.
    expect(Number((await reporte()).faltantes)).toBeCloseTo(faltantesAntes + 2);
  });

  it('rechaza el cierre con descuadre ≥ umbral sin justificación (§7)', async () => {
    const abrir = await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ fondo_inicial: 100 });
    const turnoId = (abrir.body as WithId).id;

    // Descuadre de 10 (>= $1.00) sin observaciones → 400.
    const sinJustif = await request(app.getHttpServer())
      .patch(`/cajas-turnos/${turnoId}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivo_declarado: 90 });
    expect(sinJustif.status).toBe(400);

    // Con justificación sí cierra.
    const conJustif = await request(app.getHttpServer())
      .patch(`/cajas-turnos/${turnoId}/cerrar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ efectivo_declarado: 90, observaciones: 'Faltaron $10' });
    expect(conJustif.status).toBe(200);
  });

  it('cierre forzado (ADMIN) marca el turno como CERRADA_FORZADA', async () => {
    const abrir = await request(app.getHttpServer())
      .post('/cajas-turnos/abrir')
      .set('Authorization', `Bearer ${token}`)
      .send({ fondo_inicial: 50 });
    const turnoId = (abrir.body as WithId).id;

    const forzar = await request(app.getHttpServer())
      .patch(`/cajas-turnos/${turnoId}/cerrar-forzado`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        efectivo_declarado: 50,
        observaciones: 'La cajera se retiró sin cerrar',
      });
    expect(forzar.status).toBe(200);

    const detalle = await request(app.getHttpServer())
      .get(`/cajas-turnos/${turnoId}`)
      .set('Authorization', `Bearer ${token}`);
    expect((detalle.body as { estado: string }).estado).toBe('CERRADA_FORZADA');
  });

  it('un ajuste positivo (conteo) incrementa el stock del lote (2.D)', async () => {
    const cat = await request(app.getHttpServer())
      .post('/categorias')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Conteo-E2E' });
    const prod = await request(app.getHttpServer())
      .post('/productos')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Arroz-E2E', categoria_id: (cat.body as WithId).id });
    const prodId = (prod.body as WithId).id;
    await request(app.getHttpServer())
      .post('/compras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        proveedor: 'Conteo-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: prodId,
            costo_unitario_adquisicion: 1,
            cantidad_inicial: 10,
          },
        ],
      });

    const productos = await request(app.getHttpServer())
      .get('/productos')
      .set('Authorization', `Bearer ${token}`);
    const p = (productos.body as ProductoBody[]).find((x) => x.id === prodId);
    const loteId = p!.lotes_inventario[0].id;

    // Ajuste positivo de +5 (encontrar stock).
    const aj = await request(app.getHttpServer())
      .post('/ajustes-inventario')
      .set('Authorization', `Bearer ${token}`)
      .send({
        lote_id: loteId,
        cantidad_ajustada: 5,
        tipo_ajuste: 'CONTEO_SOBRANTE',
      });
    expect(aj.status).toBe(201);

    // El lote quedó en 15.
    const despues = await request(app.getHttpServer())
      .get('/productos')
      .set('Authorization', `Bearer ${token}`);
    const p2 = (
      despues.body as {
        id: number;
        lotes_inventario: {
          id: number;
          cantidad_disponible: string | number;
        }[];
      }[]
    ).find((x) => x.id === prodId);
    const lote = p2!.lotes_inventario.find((l) => l.id === loteId);
    expect(Number(lote!.cantidad_disponible)).toBeCloseTo(15);
  });
});
