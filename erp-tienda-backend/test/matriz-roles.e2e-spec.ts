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
interface ErrorBody {
  message: string | string[];
}
interface VentaBody extends WithId {
  detalle_ventas: { id: number }[];
}
interface ProductoBody extends WithId {
  presentaciones: { id: number }[];
}

type Rol = 'cajero' | 'admin';
type Metodo = 'get' | 'post' | 'patch' | 'delete';
interface Peticion {
  metodo: Metodo;
  url: string;
  body?: Record<string, unknown>;
}
interface Fila {
  /** Lo que se prueba, con la regla de la matriz D-06. */
  nombre: string;
  /** Qué debe pasar con la cajera: 403 o el status esperado. */
  cajero: number;
  /** Status esperado para la dueña. */
  admin: number;
  /** Petición (puede variar por rol para no chocar con datos únicos). */
  req: (rol: Rol) => Peticion | Promise<Peticion>;
}

const MENSAJE_DUENA = 'Esto lo hace la dueña (administradora).';

/**
 * ARQ-19 · Matriz de permisos D-06 (docs/domain/roles-y-permisos.md) recorrida
 * endpoint por endpoint con un usuario CAJERO y uno ADMIN: lo que debe dar 403
 * (con el mensaje único) y lo que debe pasar. Los 403 se evalúan en el guard,
 * antes de tocar datos; los éxitos usan datos propios de este archivo.
 */
describe('Matriz de roles D-06 (e2e, ARQ-19)', () => {
  let app: INestApplication;
  let admin: string;
  let cajero: string;
  const sufijo = Date.now();
  let n = 0;
  const uniq = (p: string) => `${p}-${sufijo}-${++n}`;

  const http = () => request(app.getHttpServer());
  const tokenDe = (rol: Rol) => (rol === 'admin' ? admin : cajero);
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // Datos propios
  let turnoId = 0;
  let categoriaId = 0;
  let categoriaTmp = 0;
  let categoriaGastoId = 0;
  let categoriaGastoTmp = 0;
  let productoId = 0;
  let presentacionId = 0;
  let loteId = 0;
  let productoTmp = 0; // sin historial → DELETE lo borra
  let presentacionTmp = 0;
  let productoDesactivar = 0; // con lote → DELETE lo desactiva
  let compraId = 0;
  let deudaId = 0;
  let ventaId = 0;
  let detalleVentaId = 0;
  let movimientoId = 0;
  let ajusteId = 0;
  let usuarioTmp = 0;

  async function enviar(rol: Rol, p: Peticion) {
    const r = http()
      [p.metodo](p.url)
      .set(auth(tokenDe(rol)));
    return p.body ? r.send(p.body) : r;
  }

  function mensaje(res: { body: unknown }): string {
    const m = (res.body as ErrorBody).message;
    return Array.isArray(m) ? m.join(' | ') : m;
  }

  async function comprar(
    prodId: number,
    extra: Record<string, unknown> = {},
  ): Promise<WithId> {
    const res = await http()
      .post('/compras')
      .set(auth(admin))
      .send({
        proveedor: uniq('Matriz'),
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: prodId,
            costo_unitario_adquisicion: 1,
            cantidad_inicial: 100,
          },
        ],
        ...extra,
      });
    expect(res.status).toBe(201);
    return res.body as WithId;
  }

  async function crearProducto(precio = 10) {
    const prod = await http()
      .post('/productos')
      .set(auth(admin))
      .send({ nombre: uniq('Matriz-prod'), categoria_id: categoriaId });
    expect(prod.status).toBe(201);
    const id = (prod.body as WithId).id;
    const pres = await http().post('/presentaciones').set(auth(admin)).send({
      producto_id: id,
      descripcion: 'Unidad',
      factor_conversion: 1,
      precio_venta: precio,
    });
    expect(pres.status).toBe(201);
    return { id, presentacionId: (pres.body as WithId).id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    admin = await loginAsAdmin(app);
    await ensureNoOpenShift(app, admin);

    const nombre = uniq('cajera-matriz');
    const u = await http()
      .post('/usuarios')
      .set(auth(admin))
      .send({ nombre, rol: 'CAJERO', password: 'clave-matriz-123' });
    expect(u.status).toBe(201);
    const login = await http()
      .post('/auth/login')
      .send({ nombre, password: 'clave-matriz-123' });
    cajero = (login.body as LoginBody).access_token;

    const tmpU = await http()
      .post('/usuarios')
      .set(auth(admin))
      .send({
        nombre: uniq('tmp-matriz'),
        rol: 'CAJERO',
        password: 'clave-123',
      });
    usuarioTmp = (tmpU.body as WithId).id;

    categoriaId = (
      (
        await http()
          .post('/categorias')
          .set(auth(admin))
          .send({ nombre: uniq('Matriz-cat') })
      ).body as WithId
    ).id;
    categoriaTmp = (
      (
        await http()
          .post('/categorias')
          .set(auth(admin))
          .send({ nombre: uniq('Matriz-cat-tmp') })
      ).body as WithId
    ).id;
    categoriaGastoId = (
      (
        await http()
          .post('/categorias-gastos')
          .set(auth(admin))
          .send({ nombre: uniq('Matriz-gasto'), tipo: 'FIJO' })
      ).body as WithId
    ).id;
    categoriaGastoTmp = (
      (
        await http()
          .post('/categorias-gastos')
          .set(auth(admin))
          .send({ nombre: uniq('Matriz-gasto-tmp'), tipo: 'FIJO' })
      ).body as WithId
    ).id;

    const principal = await crearProducto();
    productoId = principal.id;
    presentacionId = principal.presentacionId;
    compraId = (await comprar(productoId)).id;
    // El lote se lee a través de la compra.
    const compra = await http().get(`/compras/${compraId}`).set(auth(admin));
    loteId = ((compra.body as { lotes_inventario?: WithId[] })
      .lotes_inventario ?? [])[0]?.id;

    const tmp = await crearProducto();
    productoTmp = tmp.id;
    const tmp2 = await crearProducto();
    // Presentación extra de usar y tirar (sin ventas).
    const presExtra = await http()
      .post('/presentaciones')
      .set(auth(admin))
      .send({
        producto_id: tmp2.id,
        descripcion: 'Caja',
        factor_conversion: 12,
        precio_venta: 100,
      });
    presentacionTmp = (presExtra.body as WithId).id;
    productoDesactivar = (await crearProducto()).id;
    await comprar(productoDesactivar);

    // Deuda para los abonos.
    const credito = await http()
      .post('/compras')
      .set(auth(admin))
      .send({
        proveedor: uniq('Matriz-Acreedor'),
        estado_pago: 'AL_CREDITO',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 1,
            cantidad_inicial: 10,
          },
        ],
      });
    expect(credito.status).toBe(201);
    const deudas = await http().get('/cuentas-por-pagar').set(auth(admin));
    deudaId = (deudas.body as WithId[]).slice(-1)[0].id;
    const deudasTodas = (
      deudas.body as (WithId & { compra_id: number })[]
    ).find((d) => d.compra_id === (credito.body as WithId).id);
    deudaId = deudasTodas?.id ?? deudaId;

    // Turno abierto por la cajera (ambos roles lo comparten durante la matriz).
    const ult = await http()
      .get('/cajas-turnos/ultimo-cierre')
      .set(auth(cajero));
    const remanente = Number(
      (ult.body as { fondo_siguiente: string }).fondo_siguiente,
    );
    const abrir = await http()
      .post('/cajas-turnos/abrir')
      .set(auth(cajero))
      .send({ fondo_inicial: remanente + 500, origen_diferencia: 'APORTE' });
    expect(abrir.status).toBe(201);
    turnoId = (abrir.body as WithId).id;

    // Una venta, un movimiento y un ajuste previos para los GET :id.
    const venta = await http()
      .post('/ventas')
      .set(auth(cajero))
      .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 3 }] });
    expect(venta.status).toBe(201);
    ventaId = (venta.body as VentaBody).id;
    detalleVentaId = (venta.body as VentaBody).detalle_ventas[0].id;
    const mov = await http()
      .post('/movimientos-financieros')
      .set(auth(cajero))
      .send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto: 1,
        descripcion: 'Previo matriz',
      });
    movimientoId = (mov.body as WithId).id;
    const aj = await http().post('/ajustes-inventario').set(auth(admin)).send({
      lote_id: loteId,
      cantidad_ajustada: 1,
      tipo_ajuste: 'QUEBRADO',
      justificacion: 'Previo matriz',
    });
    expect(aj.status).toBe(201);
    ajusteId = (aj.body as WithId).id;
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, admin);
    await app.close();
  });

  // ───────────────────────── la matriz ─────────────────────────
  const filas: Fila[] = [
    // Caja y turnos: operan ambos
    {
      nombre: 'GET /cajas-turnos/activa',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/cajas-turnos/activa' }),
    },
    {
      nombre: 'GET /cajas-turnos/ultimo-cierre',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/cajas-turnos/ultimo-cierre' }),
    },
    {
      nombre: 'GET /cajas-turnos (historial)',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/cajas-turnos' }),
    },
    {
      nombre: 'GET /cajas-turnos/:id',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/cajas-turnos/${turnoId}` }),
    },
    {
      nombre: 'GET /cajas-turnos/:id/resumen',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/cajas-turnos/${turnoId}/resumen` }),
    },
    {
      nombre:
        'POST /cajas-turnos/abrir (ya hay uno abierto: 409 para ambos, no 403)',
      cajero: 409,
      admin: 409,
      req: () => ({
        metodo: 'post',
        url: '/cajas-turnos/abrir',
        body: { fondo_inicial: 10 },
      }),
    },

    // Bóveda
    {
      nombre: 'GET /caja-general/saldo (ver el saldo: ambos)',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/caja-general/saldo' }),
    },
    {
      nombre: 'GET /caja-general (libro de la bóveda: solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/caja-general' }),
    },
    {
      nombre: 'POST /caja-general/inyeccion (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/caja-general/inyeccion',
        body: { monto: 1, descripcion: 'Matriz' },
      }),
    },
    {
      nombre: 'POST /caja-general/arqueo (solo dueña)',
      cajero: 403,
      admin: 201,
      req: async () => {
        const s = await http().get('/caja-general/saldo').set(auth(admin));
        return {
          metodo: 'post',
          url: '/caja-general/arqueo',
          body: {
            saldo_declarado: Number(
              (s.body as { saldo_actual: string }).saldo_actual,
            ),
          },
        };
      },
    },

    // Movimientos de dinero (POST decide por tipo y origen)
    {
      nombre: 'GET /movimientos-financieros',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/movimientos-financieros' }),
    },
    {
      nombre: 'GET /movimientos-financieros/:id',
      cajero: 200,
      admin: 200,
      req: () => ({
        metodo: 'get',
        url: `/movimientos-financieros/${movimientoId}`,
      }),
    },
    {
      nombre: 'EGRESO_OPERATIVO desde la gaveta (por defecto)',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/movimientos-financieros',
        body: {
          tipo_movimiento: 'EGRESO_OPERATIVO',
          monto: 1,
          descripcion: 'm',
        },
      }),
    },
    {
      nombre: 'EGRESO_OPERATIVO con origen GAVETA explícito',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/movimientos-financieros',
        body: {
          tipo_movimiento: 'EGRESO_OPERATIVO',
          monto: 1,
          descripcion: 'm',
          origen_fondos: 'GAVETA',
          categoria_gasto_id: categoriaGastoId,
        },
      }),
    },
    {
      nombre: 'RETIRO_BOVEDA (guardar en bóveda)',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/movimientos-financieros',
        body: { tipo_movimiento: 'RETIRO_BOVEDA', monto: 2, descripcion: 'm' },
      }),
    },
    {
      nombre: 'EGRESO_OPERATIVO pagado desde la bóveda (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/movimientos-financieros',
        body: {
          tipo_movimiento: 'EGRESO_OPERATIVO',
          monto: 1,
          descripcion: 'm',
          origen_fondos: 'BOVEDA',
        },
      }),
    },
    {
      nombre: 'RETIRO_PERSONAL (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/movimientos-financieros',
        body: {
          tipo_movimiento: 'RETIRO_PERSONAL',
          monto: 1,
          descripcion: 'm',
        },
      }),
    },
    {
      nombre: 'INGRESO_CAPITAL (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/movimientos-financieros',
        body: {
          tipo_movimiento: 'INGRESO_CAPITAL',
          monto: 1,
          descripcion: 'm',
        },
      }),
    },
    {
      nombre: 'TRASLADO_DESDE_BOVEDA (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/movimientos-financieros',
        body: {
          tipo_movimiento: 'TRASLADO_DESDE_BOVEDA',
          monto: 1,
          descripcion: 'm',
        },
      }),
    },

    // Categorías de gasto
    {
      nombre: 'GET /categorias-gastos y /:id (leer: ambos)',
      cajero: 200,
      admin: 200,
      req: () => ({
        metodo: 'get',
        url: `/categorias-gastos/${categoriaGastoId}`,
      }),
    },
    {
      nombre: 'GET /categorias-gastos',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/categorias-gastos' }),
    },
    {
      nombre: 'POST /categorias-gastos (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/categorias-gastos',
        body: { nombre: uniq('Gasto-nuevo'), tipo: 'VARIABLE' },
      }),
    },
    {
      nombre: 'PATCH /categorias-gastos/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'patch',
        url: `/categorias-gastos/${categoriaGastoTmp}`,
        body: { nombre: uniq('Gasto-renombrado') },
      }),
    },
    {
      nombre: 'DELETE /categorias-gastos/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'delete',
        url: `/categorias-gastos/${categoriaGastoTmp}`,
      }),
    },

    // Catálogo
    {
      nombre: 'GET /categorias y /:id (lectura de catálogo: ambos)',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/categorias/${categoriaId}` }),
    },
    {
      nombre: 'GET /categorias',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/categorias' }),
    },
    {
      nombre: 'POST /categorias (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/categorias',
        body: { nombre: uniq('Cat-nueva') },
      }),
    },
    {
      nombre: 'PATCH /categorias/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'patch',
        url: `/categorias/${categoriaTmp}`,
        body: { nombre: uniq('Cat-renombrada') },
      }),
    },
    {
      nombre: 'DELETE /categorias/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'delete', url: `/categorias/${categoriaTmp}` }),
    },
    {
      nombre: 'GET /productos',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/productos' }),
    },
    {
      nombre: 'GET /productos/:id',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/productos/${productoId}` }),
    },
    {
      nombre: 'POST /productos (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/productos',
        body: { nombre: uniq('Prod-nuevo'), categoria_id: categoriaId },
      }),
    },
    {
      nombre: 'POST /productos/rapido (alta rápida: ambos)',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/productos/rapido',
        body: { nombre: uniq('Rapido'), precio_venta: 2 },
      }),
    },
    {
      nombre: 'PATCH /productos/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'patch',
        url: `/productos/${productoId}`,
        body: { nombre: uniq('Prod-editado') },
      }),
    },
    {
      nombre: 'DELETE /productos/:id (solo dueña; con historial se desactiva)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'delete',
        url: `/productos/${productoDesactivar}`,
      }),
    },
    {
      nombre: 'PATCH /productos/:id/reactivar (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'patch',
        url: `/productos/${productoDesactivar}/reactivar`,
      }),
    },
    {
      nombre: 'DELETE /productos/:id sin historial (solo dueña; se borra)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'delete', url: `/productos/${productoTmp}` }),
    },
    {
      nombre: 'GET /presentaciones',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/presentaciones' }),
    },
    {
      nombre: 'GET /presentaciones/:id',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/presentaciones/${presentacionId}` }),
    },
    {
      nombre: 'GET /presentaciones/:id/historial-precios',
      cajero: 200,
      admin: 200,
      req: () => ({
        metodo: 'get',
        url: `/presentaciones/${presentacionId}/historial-precios`,
      }),
    },
    {
      nombre: 'GET /presentaciones/:id/uso',
      cajero: 200,
      admin: 200,
      req: () => ({
        metodo: 'get',
        url: `/presentaciones/${presentacionId}/uso`,
      }),
    },
    {
      nombre: 'POST /presentaciones (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/presentaciones',
        body: {
          producto_id: productoId,
          descripcion: uniq('Pres'),
          factor_conversion: 2,
          precio_venta: 20,
        },
      }),
    },
    {
      nombre: 'PATCH /presentaciones/:id: los precios son de la dueña',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'patch',
        url: `/presentaciones/${presentacionId}`,
        body: { precio_venta: 11 },
      }),
    },
    {
      nombre: 'DELETE /presentaciones/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'delete',
        url: `/presentaciones/${presentacionTmp}`,
      }),
    },

    // Compras y deudas
    {
      nombre: 'GET /compras (ver el historial: ambos)',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/compras' }),
    },
    {
      nombre: 'GET /compras/:id',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/compras/${compraId}` }),
    },
    {
      nombre: 'POST /compras (registrar compras: solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/compras',
        body: {
          proveedor: uniq('Matriz-compra'),
          estado_pago: 'PAGADO',
          origen_fondos: 'CAPITAL_DUEÑOS',
          detalles_lotes: [
            {
              producto_id: productoId,
              costo_unitario_adquisicion: 1,
              cantidad_inicial: 1,
            },
          ],
        },
      }),
    },
    {
      nombre: 'GET /cuentas-por-pagar (deudas: solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/cuentas-por-pagar' }),
    },
    {
      nombre: 'POST /cuentas-por-pagar/:id/abonos (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: `/cuentas-por-pagar/${deudaId}/abonos`,
        body: { monto: 1, origen: 'GAVETA' },
      }),
    },

    // Inventario: ajustes
    {
      nombre: 'POST /ajustes-inventario: merma QUEBRADO con motivo (ambos)',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/ajustes-inventario',
        body: {
          lote_id: loteId,
          cantidad_ajustada: 1,
          tipo_ajuste: 'QUEBRADO',
          justificacion: 'Se cayó',
        },
      }),
    },
    {
      nombre: 'POST /ajustes-inventario: merma VENCIDO con motivo (ambos)',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/ajustes-inventario',
        body: {
          lote_id: loteId,
          cantidad_ajustada: 1,
          tipo_ajuste: 'VENCIDO',
          justificacion: 'Caducó',
        },
      }),
    },
    {
      nombre: 'POST /ajustes-inventario: merma ROBO con motivo (ambos)',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/ajustes-inventario',
        body: {
          lote_id: loteId,
          cantidad_ajustada: 1,
          tipo_ajuste: 'ROBO',
          justificacion: 'Faltó en el estante',
        },
      }),
    },
    {
      nombre:
        'POST /ajustes-inventario: merma sin motivo (la cajera 400, la dueña puede)',
      cajero: 400,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/ajustes-inventario',
        body: {
          lote_id: loteId,
          cantidad_ajustada: 1,
          tipo_ajuste: 'QUEBRADO',
        },
      }),
    },
    {
      nombre: 'POST /ajustes-inventario: CONTEO (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/ajustes-inventario',
        body: {
          lote_id: loteId,
          cantidad_ajustada: 1,
          tipo_ajuste: 'CONTEO',
          justificacion: 'Conteo',
        },
      }),
    },
    {
      nombre: 'POST /ajustes-inventario: CONTEO_SOBRANTE por lote (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/ajustes-inventario',
        body: {
          lote_id: loteId,
          cantidad_ajustada: 1,
          tipo_ajuste: 'CONTEO_SOBRANTE',
          justificacion: 'Encontré producto',
        },
      }),
    },
    {
      nombre:
        'POST /ajustes-inventario: CONTEO_SOBRANTE por producto (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/ajustes-inventario',
        body: {
          producto_id: productoId,
          cantidad_ajustada: 1,
          tipo_ajuste: 'CONTEO_SOBRANTE',
          justificacion: 'Encontré producto',
        },
      }),
    },
    {
      nombre: 'GET /ajustes-inventario (lista: solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/ajustes-inventario' }),
    },
    {
      nombre: 'GET /ajustes-inventario/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/ajustes-inventario/${ajusteId}` }),
    },

    // Reportes
    ...[
      'estado-resultados',
      'patrimonio',
      'flujo-efectivo',
      'productos-top',
      'margen-por-producto',
    ].map(
      (r): Fila => ({
        nombre: `GET /reportes/${r} (solo dueña)`,
        cajero: 403,
        admin: 200,
        req: () => ({ metodo: 'get', url: `/reportes/${r}` }),
      }),
    ),

    // Usuarios
    {
      nombre: 'GET /usuarios (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/usuarios' }),
    },
    {
      nombre: 'GET /usuarios/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/usuarios/${usuarioTmp}` }),
    },
    {
      nombre: 'POST /usuarios (solo dueña)',
      cajero: 403,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/usuarios',
        body: {
          nombre: uniq('nuevo'),
          rol: 'CAJERO',
          password: 'clave-123456',
        },
      }),
    },
    {
      nombre: 'PATCH /usuarios/:id (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'patch',
        url: `/usuarios/${usuarioTmp}`,
        body: { nombre: uniq('renombrado') },
      }),
    },
    {
      nombre: 'DELETE /usuarios/:id: desactivar (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({ metodo: 'delete', url: `/usuarios/${usuarioTmp}` }),
    },
    {
      nombre: 'PATCH /usuarios/:id/reactivar (solo dueña)',
      cajero: 403,
      admin: 200,
      req: () => ({
        metodo: 'patch',
        url: `/usuarios/${usuarioTmp}/reactivar`,
      }),
    },

    // Ventas: opera la cajera, y la dueña también
    {
      nombre: 'GET /ventas',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: '/ventas' }),
    },
    {
      nombre: 'GET /ventas/:id',
      cajero: 200,
      admin: 200,
      req: () => ({ metodo: 'get', url: `/ventas/${ventaId}` }),
    },
    {
      nombre: 'POST /ventas',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: '/ventas',
        body: { detalles: [{ presentacion_id: presentacionId, cantidad: 1 }] },
      }),
    },
    {
      nombre: 'POST /ventas/:id/devolucion (con motivo: ambos)',
      cajero: 201,
      admin: 201,
      req: () => ({
        metodo: 'post',
        url: `/ventas/${ventaId}/devolucion`,
        body: {
          detalles: [
            {
              detalle_venta_id: detalleVentaId,
              cantidad: 1,
              destino: 'REINGRESO',
            },
          ],
          justificacion: 'Matriz',
        },
      }),
    },
  ];

  it.each(filas.map((f) => [f.nombre, f] as const))('%s', async (_n, fila) => {
    // 1) La cajera primero: si es 403, no debe haber tocado nada.
    const rCajero = await enviar('cajero', await fila.req('cajero'));
    expect({ rol: 'cajero', status: rCajero.status }).toEqual({
      rol: 'cajero',
      status: fila.cajero,
    });
    if (fila.cajero === 403) {
      expect(mensaje(rCajero)).toBe(MENSAJE_DUENA);
    }

    // 2) La dueña: lo que la cajera no puede, ella sí.
    const rAdmin = await enviar('admin', await fila.req('admin'));
    expect({ rol: 'admin', status: rAdmin.status }).toEqual({
      rol: 'admin',
      status: fila.admin,
    });
  });

  // ───────────────────────── casos aparte ─────────────────────────
  it('sin sesión todo da 401 (muestra de cada módulo)', async () => {
    const urls = [
      '/ventas',
      '/productos',
      '/cajas-turnos/activa',
      '/compras',
      '/cuentas-por-pagar',
      '/reportes/patrimonio',
      '/usuarios',
      '/ajustes-inventario',
      '/caja-general/saldo',
      '/movimientos-financieros',
    ];
    for (const url of urls) {
      const res = await http().get(url);
      expect({ url, status: res.status }).toEqual({ url, status: 401 });
    }
  });

  it('GET /productos?incluir_inactivos=true: solo la dueña ve los desactivados', async () => {
    // Desactivar de nuevo el producto con historial (la fila anterior lo reactivó).
    const del = await http()
      .delete(`/productos/${productoDesactivar}`)
      .set(auth(admin));
    expect(del.status).toBe(200);

    const ids = (res: { body: unknown }) =>
      (res.body as ProductoBody[]).map((p) => p.id);
    const deAdmin = await http()
      .get('/productos?incluir_inactivos=true')
      .set(auth(admin));
    const deCajera = await http()
      .get('/productos?incluir_inactivos=true')
      .set(auth(cajero));
    expect(deAdmin.status).toBe(200);
    expect(deCajera.status).toBe(200);
    expect(ids(deAdmin)).toContain(productoDesactivar);
    expect(ids(deCajera)).not.toContain(productoDesactivar);
  });

  it('anular una venta: la cajera y la dueña pueden, con motivo obligatorio', async () => {
    for (const rol of ['cajero', 'admin'] as Rol[]) {
      const venta = await http()
        .post('/ventas')
        .set(auth(tokenDe(rol)))
        .send({ detalles: [{ presentacion_id: presentacionId, cantidad: 1 }] });
      expect(venta.status).toBe(201);
      const id = (venta.body as WithId).id;

      const sinMotivo = await http()
        .patch(`/ventas/${id}/anular`)
        .set(auth(tokenDe(rol)))
        .send({ justificacion_nula: '' });
      expect(sinMotivo.status).toBe(400);

      const ok = await http()
        .patch(`/ventas/${id}/anular`)
        .set(auth(tokenDe(rol)))
        .send({ justificacion_nula: `Anulada por ${rol}` });
      expect(ok.status).toBe(200);
    }
  });

  it('cierre forzado: la cajera recibe 403, la dueña cierra con justificación', async () => {
    const turno = await http().get('/cajas-turnos/activa').set(auth(cajero));
    const esperado = Number(
      (turno.body as { efectivo_esperado: string }).efectivo_esperado,
    );

    const denegado = await http()
      .patch(`/cajas-turnos/${turnoId}/cerrar-forzado`)
      .set(auth(cajero))
      .send({ efectivo_declarado: esperado, observaciones: 'x' });
    expect(denegado.status).toBe(403);
    expect(mensaje(denegado)).toBe(MENSAJE_DUENA);

    // Sin justificación ni siquiera la dueña puede forzar.
    const sinMotivo = await http()
      .patch(`/cajas-turnos/${turnoId}/cerrar-forzado`)
      .set(auth(admin))
      .send({ efectivo_declarado: esperado });
    expect(sinMotivo.status).toBe(400);

    const ok = await http()
      .patch(`/cajas-turnos/${turnoId}/cerrar-forzado`)
      .set(auth(admin))
      .send({ efectivo_declarado: esperado, observaciones: 'Turno olvidado' });
    expect(ok.status).toBe(200);
    expect((ok.body as { estado: string }).estado).toBe('CERRADA_FORZADA');
  });

  it('el cierre normal lo hace la cajera (y la dueña)', async () => {
    for (const rol of ['cajero', 'admin'] as Rol[]) {
      const ult = await http()
        .get('/cajas-turnos/ultimo-cierre')
        .set(auth(tokenDe(rol)));
      const remanente = Number(
        (ult.body as { fondo_siguiente: string }).fondo_siguiente,
      );
      const abrir = await http()
        .post('/cajas-turnos/abrir')
        .set(auth(tokenDe(rol)))
        .send({ fondo_inicial: remanente });
      expect(abrir.status).toBe(201);
      const cerrar = await http()
        .patch(`/cajas-turnos/${(abrir.body as WithId).id}/cerrar`)
        .set(auth(tokenDe(rol)))
        .send({ efectivo_declarado: remanente });
      expect(cerrar.status).toBe(200);
    }
  });
});
