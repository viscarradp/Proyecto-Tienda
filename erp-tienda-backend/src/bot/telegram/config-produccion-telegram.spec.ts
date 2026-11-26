import { validarConfigProduccion } from '../../common/config-produccion';

const base = {
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://x.test',
  JWT_SECRET: 'a'.repeat(40),
};

describe('validarConfigProduccion + Telegram', () => {
  it('sin TELEGRAM_MODO no exige nada de Telegram', () => {
    expect(() => validarConfigProduccion(base as never)).not.toThrow();
    expect(() =>
      validarConfigProduccion({ ...base, TELEGRAM_MODO: 'polling' } as never),
    ).not.toThrow();
  });

  it('modo webhook exige token y secreto de 16+ caracteres', () => {
    expect(() =>
      validarConfigProduccion({ ...base, TELEGRAM_MODO: 'webhook' } as never),
    ).toThrow(/TELEGRAM_BOT_TOKEN[\s\S]*TELEGRAM_WEBHOOK_SECRET/);
    expect(() =>
      validarConfigProduccion({
        ...base,
        TELEGRAM_MODO: 'webhook',
        TELEGRAM_BOT_TOKEN: '1:abc',
        TELEGRAM_WEBHOOK_SECRET: 'corto',
      } as never),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    expect(() =>
      validarConfigProduccion({
        ...base,
        TELEGRAM_MODO: 'webhook',
        TELEGRAM_BOT_TOKEN: '1:abc',
        TELEGRAM_WEBHOOK_SECRET: 'x'.repeat(16),
      } as never),
    ).not.toThrow();
  });
});
