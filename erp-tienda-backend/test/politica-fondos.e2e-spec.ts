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
interface Movimiento {
  tipo_movimiento: string;
  cuenta_origen: string;
  cuenta_destino: string;
  monto: string | number;
  caja_turno_id: number | null;
  categoria_gasto_id: number | null;
  categorias_gastos?: { nombre: string } | null;
  descripcion: string;
}
interface Turno {
  id: number;
  efectivo_esperado: string | number;
  fondo_inicial: string | number;
  movimientos_financieros: Movimiento[];
}

/**
 * L6 · Política de fondos y apertura (D-04, D-15; ADR 0011): registrar y avisar
 * en vez de bloquear, y la diferencia de apertura siempre deja asiento.
 */
describe('Política de fondos y apertura (e2e, L6)', () => {
  let app: INestApplication;
  let token: string;

  const auth = () => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    token = await loginAsAdmin(app);
    await ensureNoOpenShift(app, token);
    // El primer turno de la historia (sin cierre previo) solo se puede probar
    // con el libro de caja vacío: se reinician SOLO las tablas de caja (cada
    // archivo e2e crea sus propios datos y es independiente del orden).
    await app
      .get(PrismaService)
      .$executeRawUnsafe(
        'TRUNCATE TABLE cajas_turnos, movimientos_financieros RESTART IDENTITY CASCADE',
      );
  });

  afterAll(async () => {
    await app.close();
  });

  async function saldoBoveda(): Promise<number> {
    const res = await api().get('/caja-general/saldo').set(auth());
    return Number((res.body as { saldo_actual: string }).saldo_actual);
  }

  async function remanente(): Promise<number> {
    const res = await api().get('/cajas-turnos/ultimo-cierre').set(auth());
    return Number((res.body as { fondo_siguiente: string }).fondo_siguiente);
  }

  async function turnoActivo(): Promise<Turno> {
    const activa = await api().get('/cajas-turnos/activa').set(auth());
    const res = await api()
      .get(`/cajas-turnos/${(activa.body as WithId).id}`)
      .set(auth());
    return res.body as Turno;
  }

  /** Abre con `fondo`; si difiere del remanente explica con `origen`. */
  async function abrir(fondo: number, origen?: string, nota?: string) {
    return api()
      .post('/cajas-turnos/abrir')
      .set(auth())
      .send({ fondo_inicial: fondo, origen_diferencia: origen, nota });
  }

  /** Abre con exactamente el remanente (sin diferencia) para partir de cero. */
  async function abrirSinDiferencia() {
    const res = await abrir(await remanente());
    expect(res.status).toBe(201);
    return res.body as WithId & Avisos;
  }

  /** Cierra el turno activo declarando `declarado` (con justificación). */
  async function cerrar(id: number, declarado: number, aBoveda = 0) {
    const res = await api()
      .patch(`/cajas-turnos/${id}/cerrar`)
      .set(auth())
      .send({
        efectivo_declarado: declarado,
        monto_a_boveda: aBoveda,
        observaciones: 'cierre e2e L6',
      });
    expect(res.status).toBe(200);
  }

  async function categoriaId(nombre: string): Promise<number> {
    const res = await api()
      .post('/categorias-gastos')
      .set(auth())
      .send({ nombre, tipo: 'FIJO' });
    return (res.body as WithId).id;
  }

  function movimientoDe(turno: Turno, tipo: string): Movimiento | undefined {
    return turno.movimientos_financieros.find(
      (m) => m.tipo_movimiento === tipo,
    );
  }

  describe('registrar y avisar (D-04)', () => {
    it('egreso de gaveta mayor al esperado → 201 con aviso y esperado negativo', async () => {
      const turno = await abrirSinDiferencia();
      // El esperado arranca en el remanente; dejarlo en 10 con un retiro previo
      // sería ruido: se mide contra el esperado real.
      const antes = Number((await turnoActivo()).efectivo_esperado);
      const monto = antes + 5;

      const res = await api()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'EGRESO_OPERATIVO',
          monto,
          descripcion: 'Pago al repartidor sin fondo registrado',
        });
      expect(res.status).toBe(201);
      const avisos = (res.body as Avisos).avisos;
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatch(/gaveta quedó en −\$5\.00/);

      expect(Number((await turnoActivo()).efectivo_esperado)).toBeCloseTo(-5);

      // El cierre reconcilia: contó 0 y el sistema esperaba −5 → sobrante de 5.
      await cerrar(turno.id, 0);
    });

    it('retiro personal y guardar en bóveda por encima del esperado también se registran con aviso', async () => {
      const turno = await abrirSinDiferencia();
      const antes = Number((await turnoActivo()).efectivo_esperado);

      const retiro = await api()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'RETIRO_PERSONAL',
          monto: antes + 3,
          descripcion: 'Retiro',
        });
      expect(retiro.status).toBe(201);
      expect((retiro.body as Avisos).avisos[0]).toMatch(/−\$3\.00/);

      const boveda = await api()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'RETIRO_BOVEDA',
          monto: 2,
          descripcion: 'Guardar',
        });
      expect(boveda.status).toBe(201);
      expect((boveda.body as Avisos).avisos[0]).toMatch(/−\$5\.00/);

      await cerrar(turno.id, 0);
    });

    it('un egreso que sí alcanza no trae avisos', async () => {
      const aporte = await abrir((await remanente()) + 50, 'APORTE');
      expect(aporte.status).toBe(201);
      const res = await api()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'EGRESO_OPERATIVO',
          monto: 1,
          descripcion: 'Bolsas',
        });
      expect(res.status).toBe(201);
      expect((res.body as Avisos).avisos).toEqual([]);
      await cerrar((aporte.body as WithId).id, await remanenteTrasMovimiento());
    });

    /** Esperado del turno activo (para cerrar sin descuadre). */
    async function remanenteTrasMovimiento(): Promise<number> {
      return Number((await turnoActivo()).efectivo_esperado);
    }

    it('egreso desde bóveda mayor al saldo → 201 con aviso y saldo derivado negativo', async () => {
      const saldo = await saldoBoveda();
      const res = await api()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'EGRESO_OPERATIVO',
          monto: saldo + 10,
          descripcion: 'Luz sin bóveda cargada',
          origen_fondos: 'BOVEDA',
        });
      expect(res.status).toBe(201);
      expect((res.body as Avisos).avisos[0]).toMatch(
        /bóveda quedó en −\$10\.00/,
      );
      expect(await saldoBoveda()).toBeCloseTo(-10);

      // Se deja la bóveda como estaba (arqueo/aporte la reconcilia).
      await api()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 10 + Math.max(saldo, 0) });
      if (saldo < 0) {
        await api()
          .post('/caja-general/arqueo')
          .set(auth())
          .send({ saldo_declarado: 0, justificacion: 'reset e2e' });
      }
    });

    describe('compras', () => {
      let productoId: number;

      beforeAll(async () => {
        const cat = await api()
          .post('/categorias')
          .set(auth())
          .send({ nombre: 'Compras-L6-E2E' });
        const prod = await api()
          .post('/productos')
          .set(auth())
          .send({
            nombre: 'Galleta-L6-E2E',
            categoria_id: (cat.body as WithId).id,
          });
        productoId = (prod.body as WithId).id;
      });

      const comprar = (origen: string, costo: number) =>
        api()
          .post('/compras')
          .set(auth())
          .send({
            proveedor: 'Proveedor L6',
            estado_pago: 'PAGADO',
            origen_fondos: origen,
            detalles_lotes: [
              {
                producto_id: productoId,
                costo_unitario_adquisicion: costo,
                cantidad_inicial: 1,
              },
            ],
          });

      it('CAJA_POS por encima del esperado → 201 con aviso y esperado negativo', async () => {
        const turno = await abrirSinDiferencia();
        const antes = Number((await turnoActivo()).efectivo_esperado);
        const res = await comprar('CAJA_POS', antes + 4);
        expect(res.status).toBe(201);
        expect((res.body as Avisos).avisos[0]).toMatch(
          /gaveta quedó en −\$4\.00/,
        );
        expect(Number((await turnoActivo()).efectivo_esperado)).toBeCloseTo(-4);
        await cerrar(turno.id, 0);
      });

      it('CAJA_GENERAL por encima del saldo → 201 con aviso y bóveda negativa', async () => {
        const saldo = await saldoBoveda();
        const res = await comprar('CAJA_GENERAL', Math.max(saldo, 0) + 7);
        expect(res.status).toBe(201);
        expect((res.body as Avisos).avisos[0]).toMatch(/bóveda quedó en −\$/);
        expect(await saldoBoveda()).toBeLessThan(0);
        // Reconciliar la bóveda para no afectar otros archivos de test.
        await api()
          .post('/caja-general/arqueo')
          .set(auth())
          .send({
            saldo_declarado: Math.max(saldo, 0),
            justificacion: 'reset e2e',
          });
      });
    });
  });

  describe('diferencia de apertura (D-15)', () => {
    it('primer turno de la historia con fondo 20 y APORTE → INGRESO_CAPITAL de 20', async () => {
      expect(await remanente()).toBe(0);
      const res = await abrir(20, 'APORTE');
      expect(res.status).toBe(201);
      const t = await turnoActivo();
      expect(Number(t.efectivo_esperado)).toBeCloseTo(20);
      const m = movimientoDe(t, 'INGRESO_CAPITAL')!;
      expect(m).toMatchObject({
        cuenta_origen: 'DUEÑOS',
        cuenta_destino: 'GAVETA',
      });
      expect(Number(m.monto)).toBeCloseTo(20);
      await cerrar(t.id, 20);
      expect(await remanente()).toBeCloseTo(20);
    });

    it('sobrante APORTE → INGRESO_CAPITAL DUEÑOS→GAVETA; el esperado arranca en el fondo', async () => {
      const r = await remanente();
      const bovedaAntes = await saldoBoveda();
      const res = await abrir(r + 12, 'APORTE', 'billete de la dueña');
      expect(res.status).toBe(201);
      expect((res.body as Avisos).avisos).toEqual([]);

      const t = await turnoActivo();
      expect(Number(t.efectivo_esperado)).toBeCloseTo(r + 12);
      const m = movimientoDe(t, 'INGRESO_CAPITAL')!;
      expect(m).toMatchObject({
        cuenta_origen: 'DUEÑOS',
        cuenta_destino: 'GAVETA',
      });
      expect(Number(m.monto)).toBeCloseTo(12);
      expect(m.descripcion).toMatch(/billete de la dueña/);
      expect(await saldoBoveda()).toBeCloseTo(bovedaAntes);
      await cerrar(t.id, r + 12);
    });

    it('sobrante BOVEDA → TRASLADO_DESDE_BOVEDA BOVEDA→GAVETA y baja la bóveda', async () => {
      await api()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 40 });
      const r = await remanente();
      const bovedaAntes = await saldoBoveda();
      const res = await abrir(r + 15, 'BOVEDA');
      expect(res.status).toBe(201);

      const t = await turnoActivo();
      const m = movimientoDe(t, 'TRASLADO_DESDE_BOVEDA')!;
      expect(m).toMatchObject({
        cuenta_origen: 'BOVEDA',
        cuenta_destino: 'GAVETA',
      });
      expect(Number(m.monto)).toBeCloseTo(15);
      expect(await saldoBoveda()).toBeCloseTo(bovedaAntes - 15);
      await cerrar(t.id, r + 15);
    });

    it('sobrante BOVEDA con bóveda insuficiente: abre igual y avisa', async () => {
      const saldo = await saldoBoveda();
      const r = await remanente();
      const res = await abrir(r + Math.max(saldo, 0) + 6, 'BOVEDA');
      expect(res.status).toBe(201);
      expect((res.body as Avisos).avisos[0]).toMatch(/bóveda quedó en −\$/);
      await cerrar((res.body as WithId).id, r + Math.max(saldo, 0) + 6);
      await api()
        .post('/caja-general/arqueo')
        .set(auth())
        .send({
          saldo_declarado: Math.max(saldo, 0),
          justificacion: 'reset e2e',
        });
    });

    it('sobrante sin explicar → AJUSTE_SOBRANTE GASTO→GAVETA con aviso', async () => {
      const r = await remanente();
      const res = await abrir(r + 8);
      expect(res.status).toBe(201);
      expect((res.body as Avisos).avisos[0]).toMatch(/sin explicar/);

      const t = await turnoActivo();
      const m = movimientoDe(t, 'AJUSTE_SOBRANTE')!;
      expect(m).toMatchObject({
        cuenta_origen: 'GASTO',
        cuenta_destino: 'GAVETA',
        descripcion: 'Diferencia de apertura sin explicar',
      });
      expect(Number(m.monto)).toBeCloseTo(8);
      await cerrar(t.id, r + 8);
    });

    it('"No sé" registra igual sin explicar; una opción que no corresponde también', async () => {
      const r1 = await remanente();
      const noSe = await abrir(r1 + 2, 'NO_SE');
      expect(noSe.status).toBe(201);
      expect(
        movimientoDe(await turnoActivo(), 'AJUSTE_SOBRANTE'),
      ).toBeDefined();
      await cerrar((noSe.body as WithId).id, r1 + 2);

      // RETIRO no tiene sentido cuando sobra → sin explicar, no se bloquea.
      const r2 = await remanente();
      const raro = await abrir(r2 + 2, 'RETIRO');
      expect(raro.status).toBe(201);
      const t = await turnoActivo();
      expect(movimientoDe(t, 'AJUSTE_SOBRANTE')).toBeDefined();
      expect(movimientoDe(t, 'RETIRO_PERSONAL')).toBeUndefined();
      await cerrar(t.id, r2 + 2);
    });

    it('faltante BOVEDA → TRASLADO_A_BOVEDA GAVETA→BOVEDA, sube la bóveda y no se resta dos veces al cerrar', async () => {
      // Deja un remanente de 30 en la gaveta.
      await api()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 1 });
      const base = await abrirSinDiferencia();
      const esperado = Number((await turnoActivo()).efectivo_esperado);
      await api().post('/movimientos-financieros').set(auth()).send({
        tipo_movimiento: 'INGRESO_CAPITAL',
        monto: 30,
        descripcion: 'Para el test',
      });
      await cerrar(base.id, esperado + 30);
      const r = await remanente();
      expect(r).toBeCloseTo(esperado + 30);

      const bovedaAntes = await saldoBoveda();
      const res = await abrir(r - 10, 'BOVEDA');
      expect(res.status).toBe(201);
      const t = await turnoActivo();
      expect(Number(t.efectivo_esperado)).toBeCloseTo(r - 10);
      expect(await saldoBoveda()).toBeCloseTo(bovedaAntes + 10);

      // Cierra declarando lo esperado y sin trasladar nada: el remanente debe
      // ser r − 10 (el traslado de apertura no se descuenta de nuevo).
      await cerrar(t.id, r - 10);
      expect(await remanente()).toBeCloseTo(r - 10);
    });

    it('faltante RETIRO → RETIRO_PERSONAL GAVETA→DUEÑOS', async () => {
      const r = await remanente();
      const bovedaAntes = await saldoBoveda();
      const res = await abrir(r - 5, 'RETIRO');
      expect(res.status).toBe(201);
      const t = await turnoActivo();
      const m = movimientoDe(t, 'RETIRO_PERSONAL')!;
      expect(m).toMatchObject({
        cuenta_origen: 'GAVETA',
        cuenta_destino: 'DUEÑOS',
      });
      expect(Number(m.monto)).toBeCloseTo(5);
      expect(await saldoBoveda()).toBeCloseTo(bovedaAntes);
      await cerrar(t.id, r - 5);
    });

    it('faltante sin explicar → AJUSTE_FALTANTE GAVETA→GASTO con aviso', async () => {
      const r = await remanente();
      const res = await abrir(r - 3);
      expect(res.status).toBe(201);
      expect((res.body as Avisos).avisos[0]).toMatch(/sin explicar/);
      const t = await turnoActivo();
      const m = movimientoDe(t, 'AJUSTE_FALTANTE')!;
      expect(m).toMatchObject({
        cuenta_origen: 'GAVETA',
        cuenta_destino: 'GASTO',
        descripcion: 'Diferencia de apertura sin explicar',
      });
      expect(Number(m.monto)).toBeCloseTo(3);
      await cerrar(t.id, r - 3);
    });

    it('sin diferencia no registra ningún asiento de apertura', async () => {
      const r = await remanente();
      const res = await abrir(r, 'APORTE');
      expect(res.status).toBe(201);
      expect((await turnoActivo()).movimientos_financieros).toHaveLength(0);
      await cerrar((res.body as WithId).id, r);
    });

    it('el patrimonio no cambia por una diferencia explicada desde la bóveda', async () => {
      await api()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 20 });
      const patrimonioAntes = await efectivoTotal();
      const r = await remanente();
      const res = await abrir(r + 9, 'BOVEDA');
      expect(res.status).toBe(201);
      expect(await efectivoTotal()).toBeCloseTo(patrimonioAntes);
      await cerrar((res.body as WithId).id, r + 9);
    });

    async function efectivoTotal(): Promise<number> {
      const res = await api().get('/reportes/patrimonio').set(auth());
      return Number(
        (res.body as { efectivo: { total: string } }).efectivo.total,
      );
    }
  });

  describe('traer de la bóveda a media jornada', () => {
    it('TRASLADO_DESDE_BOVEDA suma al esperado y baja la bóveda', async () => {
      await api()
        .post('/caja-general/inyeccion')
        .set(auth())
        .send({ monto: 25 });
      const turno = await abrirSinDiferencia();
      const esperadoAntes = Number((await turnoActivo()).efectivo_esperado);
      const bovedaAntes = await saldoBoveda();

      const res = await api()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'TRASLADO_DESDE_BOVEDA',
          monto: 20,
          descripcion: 'Reponer cambio',
        });
      expect(res.status).toBe(201);
      expect((res.body as Avisos).avisos).toEqual([]);
      expect(res.body).toMatchObject({
        cuenta_origen: 'BOVEDA',
        cuenta_destino: 'GAVETA',
      });

      expect(Number((await turnoActivo()).efectivo_esperado)).toBeCloseTo(
        esperadoAntes + 20,
      );
      expect(await saldoBoveda()).toBeCloseTo(bovedaAntes - 20);
      await cerrar(turno.id, esperadoAntes + 20);
    });

    it('si la bóveda no alcanza, igual se registra y avisa', async () => {
      const saldo = await saldoBoveda();
      const turno = await abrirSinDiferencia();
      const esperadoAntes = Number((await turnoActivo()).efectivo_esperado);
      const monto = Math.max(saldo, 0) + 4;
      const res = await api()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'TRASLADO_DESDE_BOVEDA',
          monto,
          descripcion: 'Cambio',
        });
      expect(res.status).toBe(201);
      expect((res.body as Avisos).avisos[0]).toMatch(/bóveda quedó en −\$/);
      await cerrar(turno.id, esperadoAntes + monto);
      await api()
        .post('/caja-general/arqueo')
        .set(auth())
        .send({
          saldo_declarado: Math.max(saldo, 0),
          justificacion: 'reset e2e',
        });
    });

    it('sin turno abierto se rechaza (la gaveta no existe sin turno)', async () => {
      const res = await api()
        .post('/movimientos-financieros')
        .set(auth())
        .send({
          tipo_movimiento: 'TRASLADO_DESDE_BOVEDA',
          monto: 1,
          descripcion: 'x',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('categoría de gasto opcional (NEG-13)', () => {
    it('un egreso sin categoría queda en "Otros" (se crea una sola vez)', async () => {
      const turno = await abrir((await remanente()) + 20, 'APORTE');
      expect(turno.status).toBe(201);
      const id = (turno.body as WithId).id;

      const a = await api().post('/movimientos-financieros').set(auth()).send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto: 1,
        descripcion: 'Sin categoría 1',
      });
      const b = await api().post('/movimientos-financieros').set(auth()).send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto: 1,
        descripcion: 'Sin categoría 2',
      });
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      const catA = (a.body as Movimiento).categoria_gasto_id;
      expect(catA).not.toBeNull();
      expect((b.body as Movimiento).categoria_gasto_id).toBe(catA);

      const cats = await api().get('/categorias-gastos').set(auth());
      const otros = (cats.body as { id: number; nombre: string }[]).filter(
        (c) => c.nombre === 'Otros',
      );
      expect(otros).toHaveLength(1);
      expect(otros[0].id).toBe(catA);

      // Con categoría explícita se respeta.
      const propia = await categoriaId('Propia-L6-E2E');
      const c = await api().post('/movimientos-financieros').set(auth()).send({
        tipo_movimiento: 'EGRESO_OPERATIVO',
        monto: 1,
        descripcion: 'Con categoría',
        categoria_gasto_id: propia,
      });
      expect((c.body as Movimiento).categoria_gasto_id).toBe(propia);

      await cerrar(id, Number((await turnoActivo()).efectivo_esperado));
    });
  });
});
