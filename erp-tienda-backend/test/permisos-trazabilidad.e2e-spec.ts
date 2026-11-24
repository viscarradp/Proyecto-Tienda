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
  usuario: Record<string, unknown>;
}
interface UsuarioBody {
  id: number;
  nombre: string;
  rol: string;
  activo: boolean;
}
interface ErrorBody {
  message: string;
}
interface VentaBody {
  id: number;
  anulada_por_id: number | null;
  anulada_por: { nombre: string } | null;
  usuarios: { nombre: string } | null;
  detalle_ventas: { id: number }[];
}
interface TurnoBody {
  id: number;
  estado: string;
  efectivo_esperado: string | number;
  usuarios: { nombre: string } | null;
  cerrado_por: { nombre: string } | null;
  cerrado_por_id: number | null;
}

const MENSAJE_DUENA = 'Esto lo hace la dueña (administradora).';

/**
 * L7 · D-06 "la cajera opera, la dueña controla": permisos por tipo de
 * movimiento, autoría de anulación y cierre, y ciclo de vida de usuarios
 * (desactivar en vez de borrar; el token se valida contra la BD en cada request).
 */
describe('Permisos y trazabilidad (e2e, L7)', () => {
  let app: INestApplication;
  let admin: string;
  let cajero: string;
  let cajeroNombre: string;
  let presentacionId: number;
  const sufijo = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function crearUsuario(
    nombre: string,
    rol: 'ADMIN' | 'CAJERO',
    password = 'clave-l7-123',
  ) {
    const res = await http()
      .post('/usuarios')
      .set(auth(admin))
      .send({ nombre, rol, password });
    expect(res.status).toBe(201);
    return res.body as UsuarioBody;
  }

  async function login(nombre: string, password = 'clave-l7-123') {
    return http().post('/auth/login').send({ nombre, password });
  }

  beforeAll(async () => {
    app = await createTestApp();
    admin = await loginAsAdmin(app);
    await ensureNoOpenShift(app, admin);

    cajeroNombre = `cajera-l7-${sufijo}`;
    await crearUsuario(cajeroNombre, 'CAJERO');
    cajero = ((await login(cajeroNombre)).body as LoginBody).access_token;

    const cat = await http()
      .post('/categorias')
      .set(auth(admin))
      .send({ nombre: `L7-cat-${sufijo}` });
    const prod = await http()
      .post('/productos')
      .set(auth(admin))
      .send({
        nombre: `L7-prod-${sufijo}`,
        categoria_id: (cat.body as WithId).id,
      });
    const productoId = (prod.body as WithId).id;
    const pres = await http().post('/presentaciones').set(auth(admin)).send({
      producto_id: productoId,
      descripcion: 'Unidad',
      factor_conversion: 1,
      precio_venta: 10,
    });
    presentacionId = (pres.body as WithId).id;
    await http()
      .post('/compras')
      .set(auth(admin))
      .send({
        proveedor: 'L7-E2E',
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        detalles_lotes: [
          {
            producto_id: productoId,
            costo_unitario_adquisicion: 4,
            cantidad_inicial: 50,
          },
        ],
      });
  });

  afterAll(async () => {
    await ensureNoOpenShift(app, admin);
    await app.close();
  });

  describe('CAJERO: la cajera opera', () => {
    let turnoId: number;

    beforeAll(async () => {
      const abrir = await http()
        .post('/cajas-turnos/abrir')
        .set(auth(cajero))
        .send({ fondo_inicial: 20 });
      expect(abrir.status).toBe(201);
      turnoId = (abrir.body as WithId).id;
    });

    const mov = (token: string, body: Record<string, unknown>) =>
      http()
        .post('/movimientos-financieros')
        .set(auth(token))
        .send({ descripcion: 'Prueba L7', monto: 1, ...body });

    it('recibe 403 con mensaje claro en lo que es de la dueña', async () => {
      const casos: Record<string, unknown>[] = [
        { tipo_movimiento: 'INGRESO_CAPITAL' },
        { tipo_movimiento: 'RETIRO_PERSONAL' },
        { tipo_movimiento: 'TRASLADO_DESDE_BOVEDA' },
        { tipo_movimiento: 'EGRESO_OPERATIVO', origen_fondos: 'BOVEDA' },
      ];
      for (const caso of casos) {
        const res = await mov(cajero, caso);
        expect(res.status).toBe(403);
        expect((res.body as ErrorBody).message).toBe(MENSAJE_DUENA);
      }

      const iny = await http()
        .post('/caja-general/inyeccion')
        .set(auth(cajero))
        .send({ monto: 10, descripcion: 'No debería' });
      expect(iny.status).toBe(403);
      expect((iny.body as ErrorBody).message).toBe(MENSAJE_DUENA);

      const cat = await http()
        .post('/categorias-gastos')
        .set(auth(cajero))
        .send({ nombre: `L7-gasto-${sufijo}`, tipo: 'FIJO' });
      expect(cat.status).toBe(403);
    });

    it('puede leer las categorías de gasto (la dueña las crea)', async () => {
      const crear = await http()
        .post('/categorias-gastos')
        .set(auth(admin))
        .send({ nombre: `L7-gasto-adm-${sufijo}`, tipo: 'FIJO' });
      expect(crear.status).toBe(201);
      const lista = await http().get('/categorias-gastos').set(auth(cajero));
      expect(lista.status).toBe(200);
    });

    it('paga un gasto chico desde la gaveta y guarda en la bóveda (201)', async () => {
      const egreso = await mov(cajero, {
        tipo_movimiento: 'EGRESO_OPERATIVO',
      });
      expect(egreso.status).toBe(201);
      const egresoGaveta = await mov(cajero, {
        tipo_movimiento: 'EGRESO_OPERATIVO',
        origen_fondos: 'GAVETA',
      });
      expect(egresoGaveta.status).toBe(201);
      const guardar = await mov(cajero, {
        tipo_movimiento: 'RETIRO_BOVEDA',
        monto: 5,
      });
      expect(guardar.status).toBe(201);
    });

    it('la dueña conserva todos los movimientos (ADMIN)', async () => {
      const res = await mov(admin, { tipo_movimiento: 'RETIRO_PERSONAL' });
      expect(res.status).toBe(201);
      const desdeBoveda = await mov(admin, {
        tipo_movimiento: 'EGRESO_OPERATIVO',
        origen_fondos: 'BOVEDA',
      });
      expect(desdeBoveda.status).toBe(201);
    });

    it('vende, devuelve y anula; anular registra quién anuló', async () => {
      const vender = () =>
        http()
          .post('/ventas')
          .set(auth(cajero))
          .send({
            detalles: [{ presentacion_id: presentacionId, cantidad: 2 }],
          });

      const v1 = await vender();
      expect(v1.status).toBe(201);
      const venta1 = v1.body as VentaBody;

      // Devolución parcial por la cajera.
      const dev = await http()
        .post(`/ventas/${venta1.id}/devolucion`)
        .set(auth(cajero))
        .send({
          detalles: [
            {
              detalle_venta_id: venta1.detalle_ventas[0].id,
              cantidad: 1,
              destino: 'REINGRESO',
            },
          ],
          justificacion: 'Cliente se arrepintió',
        });
      expect(dev.status).toBe(201);

      // Otra venta, anulada por la cajera.
      const v2 = (await vender()).body as VentaBody;
      const anular = await http()
        .patch(`/ventas/${v2.id}/anular`)
        .set(auth(cajero))
        .send({ justificacion_nula: 'Error al cobrar' });
      expect(anular.status).toBe(200);

      const detalle = await http().get(`/ventas/${v2.id}`).set(auth(admin));
      const venta = detalle.body as VentaBody;
      expect(venta.anulada_por_id).not.toBeNull();
      expect(venta.anulada_por?.nombre).toBe(cajeroNombre);
      expect(venta.usuarios?.nombre).toBe(cajeroNombre);

      // El listado también trae los nombres (solo { nombre }).
      const lista = await http()
        .get('/ventas')
        .query({ caja_turno_id: turnoId })
        .set(auth(admin));
      const fila = (lista.body as VentaBody[]).find((v) => v.id === v2.id);
      expect(fila?.anulada_por).toEqual({ nombre: cajeroNombre });
    });

    it('la venta anulada por la dueña la registra a ella', async () => {
      const v = (
        await http()
          .post('/ventas')
          .set(auth(admin))
          .send({
            detalles: [{ presentacion_id: presentacionId, cantidad: 1 }],
          })
      ).body as VentaBody;
      const res = await http()
        .patch(`/ventas/${v.id}/anular`)
        .set(auth(admin))
        .send({ justificacion_nula: 'Prueba' });
      expect(res.status).toBe(200);
      const venta = (await http().get(`/ventas/${v.id}`).set(auth(admin)))
        .body as VentaBody;
      expect(venta.anulada_por?.nombre).toBe('admin');
    });

    it('cerrar guarda cerrado_por (y el listado trae quién abrió y cerró)', async () => {
      const turno = (await http().get('/cajas-turnos/activa').set(auth(cajero)))
        .body as TurnoBody;
      const cierre = await http()
        .patch(`/cajas-turnos/${turnoId}/cerrar`)
        .set(auth(cajero))
        .send({ efectivo_declarado: Number(turno.efectivo_esperado) });
      expect(cierre.status).toBe(200);
      expect((cierre.body as TurnoBody).cerrado_por_id).not.toBeNull();

      const lista = await http().get('/cajas-turnos').set(auth(cajero));
      const items = (lista.body as { items: TurnoBody[] }).items;
      const fila = items.find((t) => t.id === turnoId);
      expect(fila?.usuarios).toEqual({ nombre: cajeroNombre });
      expect(fila?.cerrado_por).toEqual({ nombre: cajeroNombre });
    });

    it('el cierre forzado es de la dueña y guarda cerrado_por', async () => {
      const abrir = await http()
        .post('/cajas-turnos/abrir')
        .set(auth(cajero))
        .send({ fondo_inicial: 0 });
      expect(abrir.status).toBe(201);
      const id = (abrir.body as WithId).id;

      const noPuede = await http()
        .patch(`/cajas-turnos/${id}/cerrar-forzado`)
        .set(auth(cajero))
        .send({ efectivo_declarado: 0, observaciones: 'Intento' });
      expect(noPuede.status).toBe(403);
      expect((noPuede.body as ErrorBody).message).toBe(MENSAJE_DUENA);

      const forzado = await http()
        .patch(`/cajas-turnos/${id}/cerrar-forzado`)
        .set(auth(admin))
        .send({ efectivo_declarado: 0, observaciones: 'Se olvidó cerrar' });
      expect(forzado.status).toBe(200);
      const detalle = (await http().get(`/cajas-turnos/${id}`).set(auth(admin)))
        .body as TurnoBody;
      expect(detalle.estado).toBe('CERRADA_FORZADA');
      expect(detalle.cerrado_por).toEqual({ nombre: 'admin' });
      expect(detalle.usuarios).toEqual({ nombre: cajeroNombre });
    });
  });

  describe('Usuarios: desactivar en vez de borrar', () => {
    it('la CAJERO no accede a la gestión de usuarios', async () => {
      const res = await http().get('/usuarios').set(auth(cajero));
      expect(res.status).toBe(403);
      expect((res.body as ErrorBody).message).toBe(MENSAJE_DUENA);
    });

    it('desactivar: no puede iniciar sesión y su token vigente recibe 401; reactivar lo devuelve', async () => {
      const nombre = `temporal-l7-${sufijo}`;
      const u = await crearUsuario(nombre, 'CAJERO');
      const token = ((await login(nombre)).body as LoginBody).access_token;
      expect((await http().get('/productos').set(auth(token))).status).toBe(
        200,
      );

      const del = await http().delete(`/usuarios/${u.id}`).set(auth(admin));
      expect(del.status).toBe(200);
      expect((del.body as UsuarioBody).activo).toBe(false);
      expect(del.body).not.toHaveProperty('password_hash');

      // El usuario NO se borró (la autoría se conserva).
      const sigue = await http().get(`/usuarios/${u.id}`).set(auth(admin));
      expect(sigue.status).toBe(200);
      expect((sigue.body as UsuarioBody).activo).toBe(false);

      const intento = await login(nombre);
      expect(intento.status).toBe(401);
      expect((intento.body as ErrorBody).message).toMatch(/desactivado/);
      // Contraseña incorrecta de un usuario inactivo: mensaje genérico.
      const mala = await login(nombre, 'otra-clave-123');
      expect((mala.body as ErrorBody).message).toBe('Credenciales inválidas');

      expect((await http().get('/productos').set(auth(token))).status).toBe(
        401,
      );

      const re = await http()
        .patch(`/usuarios/${u.id}/reactivar`)
        .set(auth(admin));
      expect(re.status).toBe(200);
      expect((re.body as UsuarioBody).activo).toBe(true);
      expect(re.body).not.toHaveProperty('password_hash');
      expect((await login(nombre)).status).toBe(200);
      expect((await http().get('/productos').set(auth(token))).status).toBe(
        200,
      );
    });

    it('un cambio de rol aplica al siguiente request con el mismo token', async () => {
      const nombre = `admin2-l7-${sufijo}`;
      const u = await crearUsuario(nombre, 'ADMIN');
      const token = ((await login(nombre)).body as LoginBody).access_token;
      expect((await http().get('/usuarios').set(auth(token))).status).toBe(200);

      const cambio = await http()
        .patch(`/usuarios/${u.id}`)
        .set(auth(admin))
        .send({ rol: 'CAJERO' });
      expect(cambio.status).toBe(200);
      expect((cambio.body as UsuarioBody).rol).toBe('CAJERO');

      const res = await http().get('/usuarios').set(auth(token));
      expect(res.status).toBe(403);
      expect((res.body as ErrorBody).message).toBe(MENSAJE_DUENA);
    });

    it('cambiar contraseña: la anterior deja de servir y la nueva entra', async () => {
      const nombre = `clave-l7-${sufijo}`;
      const u = await crearUsuario(nombre, 'CAJERO');
      const cambio = await http()
        .patch(`/usuarios/${u.id}`)
        .set(auth(admin))
        .send({ password: 'nueva-clave-456' });
      expect(cambio.status).toBe(200);
      expect(cambio.body).not.toHaveProperty('password_hash');
      expect((await login(nombre)).status).toBe(401);
      expect((await login(nombre, 'nueva-clave-456')).status).toBe(200);

      const corta = await http()
        .patch(`/usuarios/${u.id}`)
        .set(auth(admin))
        .send({ password: '123' });
      expect(corta.status).toBe(400);
    });

    it('no se puede desactivar a uno mismo ni dejar al sistema sin dueña activa', async () => {
      const yo = (await http().get('/usuarios').set(auth(admin)))
        .body as UsuarioBody[];
      const miId = yo.find((x) => x.nombre === 'admin')!.id;

      const auto = await http().delete(`/usuarios/${miId}`).set(auth(admin));
      expect(auto.status).toBe(400);

      // Es la única ADMIN activa: bajarse a CAJERO la dejaría sin dueña.
      const bajar = await http()
        .patch(`/usuarios/${miId}`)
        .set(auth(admin))
        .send({ rol: 'CAJERO' });
      expect(bajar.status).toBe(409);

      // Con otra ADMIN activa sí se puede desactivar a esa otra.
      const otra = await crearUsuario(`admin3-l7-${sufijo}`, 'ADMIN');
      const ok = await http().delete(`/usuarios/${otra.id}`).set(auth(admin));
      expect(ok.status).toBe(200);
    });

    it('ninguna respuesta de usuarios incluye password_hash', async () => {
      const nombre = `hash-l7-${sufijo}`;
      const creado = await http()
        .post('/usuarios')
        .set(auth(admin))
        .send({ nombre, rol: 'CAJERO', password: 'clave-l7-123' });
      expect(creado.body).not.toHaveProperty('password_hash');
      const lista = await http().get('/usuarios').set(auth(admin));
      for (const fila of lista.body as Record<string, unknown>[]) {
        expect(fila).not.toHaveProperty('password_hash');
      }
      const uno = await http()
        .get(`/usuarios/${(creado.body as UsuarioBody).id}`)
        .set(auth(admin));
      expect(uno.body).not.toHaveProperty('password_hash');
      const l = await login(nombre);
      expect(l.body as LoginBody).not.toHaveProperty('password_hash');
      expect((l.body as LoginBody).usuario).not.toHaveProperty('password_hash');
    });

    it('un usuario inexistente da 404 al desactivar o reactivar', async () => {
      expect(
        (await http().delete('/usuarios/999999').set(auth(admin))).status,
      ).toBe(404);
      expect(
        (await http().patch('/usuarios/999999/reactivar').set(auth(admin)))
          .status,
      ).toBe(404);
    });
  });
});
