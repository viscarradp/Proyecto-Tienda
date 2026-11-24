import { opcionesPool } from './pool-config';
import { parseTrustProxy, validarConfigProduccion } from './config-produccion';

const SECRETO_OK = 'a'.repeat(32);

describe('validarConfigProduccion', () => {
  it('no valida nada fuera de producción', () => {
    expect(() =>
      validarConfigProduccion({ NODE_ENV: 'development' }),
    ).not.toThrow();
    expect(() => validarConfigProduccion({ NODE_ENV: 'test' })).not.toThrow();
    expect(() => validarConfigProduccion({})).not.toThrow();
  });

  it('acepta una configuración de producción completa', () => {
    expect(() =>
      validarConfigProduccion({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://tienda.example.com',
        JWT_SECRET: SECRETO_OK,
      }),
    ).not.toThrow();
  });

  it('falla si falta CORS_ORIGINS (o está vacía)', () => {
    for (const cors of [undefined, '', ' , ']) {
      expect(() =>
        validarConfigProduccion({
          NODE_ENV: 'production',
          CORS_ORIGINS: cors,
          JWT_SECRET: SECRETO_OK,
        }),
      ).toThrow(/CORS_ORIGINS/);
    }
  });

  it('falla si JWT_SECRET falta o tiene menos de 32 caracteres', () => {
    for (const secreto of [undefined, '', 'a'.repeat(31)]) {
      expect(() =>
        validarConfigProduccion({
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://tienda.example.com',
          JWT_SECRET: secreto,
        }),
      ).toThrow(/JWT_SECRET/);
    }
  });

  it('rechaza el secreto de ejemplo del docker-compose aunque sea largo', () => {
    expect(() =>
      validarConfigProduccion({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://tienda.example.com',
        JWT_SECRET: 'tu-secreto-super-seguro-cambia-esto-en-produccion',
      }),
    ).toThrow(/ejemplo/);
  });

  it('reporta todos los problemas juntos', () => {
    expect(() => validarConfigProduccion({ NODE_ENV: 'production' })).toThrow(
      /CORS_ORIGINS[\s\S]*JWT_SECRET/,
    );
  });
});

describe('parseTrustProxy', () => {
  it('está desactivado por defecto', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('0')).toBe(false);
  });

  it('interpreta un número de saltos', () => {
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy(' 2 ')).toBe(2);
  });

  it('pasa listas/CIDR a Express tal cual', () => {
    expect(parseTrustProxy('loopback')).toBe('loopback');
    expect(parseTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });

  it('rechaza "true" (confiaría en cualquier cliente)', () => {
    expect(() => parseTrustProxy('true')).toThrow(/TRUST_PROXY/);
  });
});

describe('opcionesPool', () => {
  it('usa un máximo de 5 por defecto y timeouts explícitos', () => {
    const o = opcionesPool({ DATABASE_URL: 'postgresql://x' });
    expect(o.max).toBe(5);
    expect(o.connectionString).toBe('postgresql://x');
    expect(o.idleTimeoutMillis).toBeGreaterThan(0);
    expect(o.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  it('toma DB_POOL_MAX del entorno', () => {
    expect(opcionesPool({ DB_POOL_MAX: '3' }).max).toBe(3);
  });

  it('rechaza valores inválidos', () => {
    for (const v of ['0', '-1', 'abc', '2.5']) {
      expect(() => opcionesPool({ DB_POOL_MAX: v })).toThrow(/DB_POOL_MAX/);
    }
  });
});
