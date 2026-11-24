import { Prisma } from '@prisma/client';
import { efectivoEnGaveta, remanenteDeUltimoCierre } from './efectivo-gaveta';

type Where = { estado?: string | { in: string[] } };

interface TurnoFalso {
  estado: string;
  efectivo_esperado?: number | null;
  efectivo_declarado?: number | null;
  fecha_cierre?: Date | null;
  traslados?: number[];
}

const dec = (n: number | null | undefined) =>
  n == null ? null : new Prisma.Decimal(n);

/** Cliente falso que imita el findFirst de cajas_turnos sobre una lista. */
function clienteCon(turnos: TurnoFalso[]) {
  return {
    cajas_turnos: {
      findFirst: jest.fn((args: { where: Where }) => {
        const est = args.where.estado;
        const lista = turnos.filter((t) =>
          typeof est === 'string'
            ? t.estado === est
            : est?.in.includes(t.estado),
        );
        lista.sort(
          (a, b) =>
            (b.fecha_cierre?.getTime() ?? 0) - (a.fecha_cierre?.getTime() ?? 0),
        );
        const t = lista[0];
        if (!t) return Promise.resolve(null);
        return Promise.resolve({
          ...t,
          efectivo_esperado: dec(t.efectivo_esperado),
          efectivo_declarado: dec(t.efectivo_declarado),
          movimientos_financieros: (t.traslados ?? []).map((m) => ({
            monto: new Prisma.Decimal(m),
          })),
        });
      }),
    },
  } as never;
}

describe('efectivoEnGaveta / remanenteDeUltimoCierre', () => {
  it('sin ningún turno: 0 y sin fecha de cierre', async () => {
    const c = clienteCon([]);
    expect((await efectivoEnGaveta(c)).toString()).toBe('0');
    const r = await remanenteDeUltimoCierre(c);
    expect(r.fondo_siguiente.toString()).toBe('0');
    expect(r.fecha_cierre).toBeNull();
  });

  it('con turno abierto: su efectivo_esperado (aunque haya cierres previos)', async () => {
    const c = clienteCon([
      {
        estado: 'CERRADA',
        efectivo_declarado: 500,
        fecha_cierre: new Date('2026-01-01'),
      },
      { estado: 'ABIERTA', efectivo_esperado: 123.45 },
    ]);
    expect((await efectivoEnGaveta(c)).toString()).toBe('123.45');
  });

  it('turno abierto con esperado nulo: 0', async () => {
    const c = clienteCon([{ estado: 'ABIERTA', efectivo_esperado: null }]);
    expect((await efectivoEnGaveta(c)).toString()).toBe('0');
  });

  it('sin turno: lo declarado menos los traslados a bóveda de ese turno', async () => {
    const c = clienteCon([
      {
        estado: 'CERRADA',
        efectivo_declarado: 200,
        fecha_cierre: new Date('2026-01-02'),
        traslados: [50, 30],
      },
    ]);
    expect((await efectivoEnGaveta(c)).toString()).toBe('120');
    expect((await remanenteDeUltimoCierre(c)).fondo_siguiente.toString()).toBe(
      '120',
    );
  });

  it('el último cierre se elige por fecha_cierre y cuenta CERRADA_FORZADA', async () => {
    const c = clienteCon([
      {
        estado: 'CERRADA',
        efectivo_declarado: 999,
        fecha_cierre: new Date('2026-01-01'),
      },
      {
        estado: 'CERRADA_FORZADA',
        efectivo_declarado: 80,
        fecha_cierre: new Date('2026-01-03'),
        traslados: [20],
      },
    ]);
    const r = await remanenteDeUltimoCierre(c);
    expect(r.fondo_siguiente.toString()).toBe('60');
    expect(r.fecha_cierre).toEqual(new Date('2026-01-03'));
  });

  it('declarado nulo se trata como 0', async () => {
    const c = clienteCon([
      {
        estado: 'CERRADA',
        efectivo_declarado: null,
        fecha_cierre: new Date('2026-01-01'),
      },
    ]);
    expect((await efectivoEnGaveta(c)).toString()).toBe('0');
  });
});
