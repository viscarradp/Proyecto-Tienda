import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MENSAJE_NUMERO_GRANDE,
  MENSAJE_SISTEMA_OCUPADO,
  MENSAJE_TEXTO_LARGO,
  mapearErrorPrisma,
} from './prisma-exception.filter';

function errorPrisma(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('fallo de prueba', {
    code,
    clientVersion: 'test',
    meta,
  });
}

function mapeado(error: Prisma.PrismaClientKnownRequestError): HttpException {
  const http = mapearErrorPrisma(error);
  expect(http).not.toBeNull();
  return http as HttpException;
}

describe('mapearErrorPrisma', () => {
  it('P2028 (timeout de transacción) → 503 con mensaje amable', () => {
    const http = mapeado(errorPrisma('P2028'));
    expect(http.getStatus()).toBe(503);
    expect(http.message).toBe(MENSAJE_SISTEMA_OCUPADO);
  });

  it('P2034 (conflicto/deadlock) → 503 con mensaje amable', () => {
    const http = mapeado(errorPrisma('P2034'));
    expect(http.getStatus()).toBe(503);
    expect(http.message).toBe(MENSAJE_SISTEMA_OCUPADO);
  });

  it('P2010 con SQLSTATE 40P01 (deadlock crudo) → 503', () => {
    const http = mapeado(
      errorPrisma('P2010', {
        driverAdapterError: { cause: { originalCode: '40P01' } },
      }),
    );
    expect(http.getStatus()).toBe(503);
  });

  it('P2020 (valor fuera de rango) → 400 "Un número es demasiado grande"', () => {
    const http = mapeado(errorPrisma('P2020'));
    expect(http.getStatus()).toBe(400);
    expect(http.message).toBe(MENSAJE_NUMERO_GRANDE);
  });

  it('P2010 con SQLSTATE 22003 (desborde numérico crudo) → 400', () => {
    const http = mapeado(
      errorPrisma('P2010', {
        driverAdapterError: { cause: { originalCode: '22003' } },
      }),
    );
    expect(http.getStatus()).toBe(400);
    expect(http.message).toBe(MENSAJE_NUMERO_GRANDE);
  });

  it('P2000 (texto demasiado largo) → 400', () => {
    const http = mapeado(errorPrisma('P2000'));
    expect(http.getStatus()).toBe(400);
    expect(http.message).toBe(MENSAJE_TEXTO_LARGO);
  });

  it('conserva los mapeos previos: P2002 → 409, P2003 → 400, P2025 → 404', () => {
    expect(
      mapeado(errorPrisma('P2002', { target: ['nombre'] })).getStatus(),
    ).toBe(409);
    expect(mapeado(errorPrisma('P2003')).getStatus()).toBe(400);
    expect(mapeado(errorPrisma('P2025')).getStatus()).toBe(404);
  });

  it('códigos no mapeados (y P2010 desconocido) devuelven null → 500 por defecto', () => {
    expect(mapearErrorPrisma(errorPrisma('P9999'))).toBeNull();
    expect(
      mapearErrorPrisma(
        errorPrisma('P2010', {
          driverAdapterError: { cause: { originalCode: '42P01' } },
        }),
      ),
    ).toBeNull();
  });
});
