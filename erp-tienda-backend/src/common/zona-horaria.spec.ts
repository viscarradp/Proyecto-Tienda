import {
  esFechaCalendarioValida,
  hoyEnZona,
  limitesDelDia,
  primerDiaDelMesEnZona,
  validarZonaHoraria,
  zonaHorariaNegocio,
} from './zona-horaria';

const SV = 'America/El_Salvador';
const NY = 'America/New_York';

describe('zona-horaria', () => {
  describe('limitesDelDia', () => {
    it('El Salvador (UTC-6): el día local cruza al día UTC siguiente', () => {
      const { inicio, fin } = limitesDelDia('2026-11-24', SV);
      expect(inicio.toISOString()).toBe('2026-11-24T06:00:00.000Z');
      expect(fin.toISOString()).toBe('2026-11-25T05:59:59.999Z');
    });

    it('una venta de las 19:30 locales cae dentro de su día local', () => {
      const venta = new Date('2026-11-25T01:30:00.000Z'); // 19:30 del 24 en SV
      const { inicio, fin } = limitesDelDia('2026-11-24', SV);
      expect(venta >= inicio && venta <= fin).toBe(true);
      const sig = limitesDelDia('2026-11-25', SV);
      expect(venta >= sig.inicio && venta <= sig.fin).toBe(false);
    });

    it('DST inicio (NY 2026-03-08): inicio en EST, fin en EDT (día de 23 h)', () => {
      const { inicio, fin } = limitesDelDia('2026-03-08', NY);
      expect(inicio.toISOString()).toBe('2026-03-08T05:00:00.000Z');
      expect(fin.toISOString()).toBe('2026-03-09T03:59:59.999Z');
    });

    it('DST fin (NY 2026-11-01): inicio en EDT, fin en EST (día de 25 h)', () => {
      const { inicio, fin } = limitesDelDia('2026-11-01', NY);
      expect(inicio.toISOString()).toBe('2026-11-01T04:00:00.000Z');
      expect(fin.toISOString()).toBe('2026-11-02T04:59:59.999Z');
    });

    it('zona al este de UTC (Asia/Tokyo, UTC+9)', () => {
      const { inicio, fin } = limitesDelDia('2026-06-15', 'Asia/Tokyo');
      expect(inicio.toISOString()).toBe('2026-06-14T15:00:00.000Z');
      expect(fin.toISOString()).toBe('2026-06-15T14:59:59.999Z');
    });

    it('rechaza fechas inválidas', () => {
      for (const f of ['', 'hoy', '2026-1-5', '2026-13-01', '2026-02-30']) {
        expect(() => limitesDelDia(f, SV)).toThrow(/Fecha inválida/);
      }
    });
  });

  describe('esFechaCalendarioValida', () => {
    it('acepta días reales y rechaza el resto', () => {
      expect(esFechaCalendarioValida('2028-02-29')).toBe(true);
      expect(esFechaCalendarioValida('2026-02-29')).toBe(false);
      expect(esFechaCalendarioValida('2026-11-24T00:00:00Z')).toBe(false);
    });
  });

  describe('hoyEnZona / primerDiaDelMesEnZona', () => {
    it('usa el día local, no el UTC', () => {
      // 02:00Z del 25 = 20:00 del 24 en El Salvador.
      const ahora = new Date('2026-11-25T02:00:00.000Z');
      expect(hoyEnZona(ahora, SV)).toBe('2026-11-24');
      expect(hoyEnZona(ahora, 'UTC')).toBe('2026-11-25');
    });

    it('el 1ro del mes sigue la zona (cambio de mes)', () => {
      // 03:00Z del 1 de diciembre = 21:00 del 30 de noviembre en SV.
      const ahora = new Date('2026-12-01T03:00:00.000Z');
      expect(primerDiaDelMesEnZona(ahora, SV)).toBe('2026-11-01');
      expect(primerDiaDelMesEnZona(ahora, 'UTC')).toBe('2026-12-01');
    });
  });

  describe('zona configurable', () => {
    const original = process.env.ZONA_HORARIA_NEGOCIO;
    afterEach(() => {
      if (original === undefined) delete process.env.ZONA_HORARIA_NEGOCIO;
      else process.env.ZONA_HORARIA_NEGOCIO = original;
    });

    it('default America/El_Salvador', () => {
      delete process.env.ZONA_HORARIA_NEGOCIO;
      expect(zonaHorariaNegocio()).toBe(SV);
    });

    it('falla con un mensaje claro si la zona es inválida', () => {
      process.env.ZONA_HORARIA_NEGOCIO = 'Marte/Olympus';
      expect(() => zonaHorariaNegocio()).toThrow(
        /ZONA_HORARIA_NEGOCIO inválida/,
      );
      expect(() => validarZonaHoraria('xx')).toThrow(/"xx"/);
    });
  });
});
