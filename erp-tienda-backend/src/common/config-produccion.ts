import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Valores de ejemplo que circulan en el repo (docker-compose, .env.example).
 * Si llegan a producción, el secreto JWT sería público.
 */
const JWT_SECRETS_DE_EJEMPLO = [
  'tu-secreto-super-seguro-cambia-esto-en-produccion',
  'dev-secret-cambiar-en-produccion',
  'reemplaza-con-un-secreto-largo-y-aleatorio',
];

export const JWT_SECRET_MIN_LENGTH = 32;
export const TELEGRAM_SECRET_MIN_LENGTH = 16;

/**
 * Con NODE_ENV=production exige la configuración mínima segura y falla con un
 * mensaje claro (ver docs/decisions/0010). En desarrollo y tests no valida
 * nada, para no pedir configuración extra.
 */
export function validarConfigProduccion(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;

  const errores: string[] = [];

  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (corsOrigins.length === 0) {
    errores.push(
      'CORS_ORIGINS es obligatoria en producción (URL del frontend, separadas por coma).',
    );
  }

  const secreto = env.JWT_SECRET ?? '';
  if (secreto.length < JWT_SECRET_MIN_LENGTH) {
    errores.push(
      `JWT_SECRET debe tener al menos ${JWT_SECRET_MIN_LENGTH} caracteres en producción (genera uno con: openssl rand -hex 32).`,
    );
  } else if (JWT_SECRETS_DE_EJEMPLO.includes(secreto)) {
    errores.push(
      'JWT_SECRET usa un valor de ejemplo del repositorio; genera uno propio (openssl rand -hex 32).',
    );
  }

  // Bot de Telegram: solo se exige algo si se usa el modo webhook (público).
  if ((env.TELEGRAM_MODO ?? '').trim().toLowerCase() === 'webhook') {
    if (!(env.TELEGRAM_BOT_TOKEN ?? '').trim()) {
      errores.push(
        'TELEGRAM_BOT_TOKEN es obligatoria con TELEGRAM_MODO=webhook.',
      );
    }
    if (
      (env.TELEGRAM_WEBHOOK_SECRET ?? '').length < TELEGRAM_SECRET_MIN_LENGTH
    ) {
      errores.push(
        `TELEGRAM_WEBHOOK_SECRET debe tener al menos ${TELEGRAM_SECRET_MIN_LENGTH} caracteres con TELEGRAM_MODO=webhook.`,
      );
    }
  }

  if (errores.length > 0) {
    throw new Error(
      `Configuración de producción inválida:\n - ${errores.join('\n - ')}`,
    );
  }
}

/**
 * Interpreta TRUST_PROXY para Express:
 * - vacío / "false" / "0" -> desactivado (default).
 * - número N -> confía en N saltos de proxy (Cloud Run: 1).
 * - otro texto -> lista de IPs/CIDR/nombres que entiende Express
 *   ("loopback", "10.0.0.0/8").
 * "true" se rechaza: confiaría en cualquier X-Forwarded-For y permitiría
 * falsificar la IP para evadir el rate-limit.
 */
export function parseTrustProxy(
  valor: string | undefined,
): number | string | false {
  const v = (valor ?? '').trim();
  if (v === '' || v.toLowerCase() === 'false') return false;
  if (v.toLowerCase() === 'true') {
    throw new Error(
      'TRUST_PROXY=true no está permitido (confía en cualquier cliente); usa el número de saltos de proxy, p. ej. 1.',
    );
  }
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n === 0 ? false : n;
  }
  return v;
}

/** Aplica `trust proxy` a Express para que req.ip sea la del cliente real. */
export function aplicarTrustProxy(
  app: NestExpressApplication,
  valor: string | undefined,
): void {
  const parsed = parseTrustProxy(valor);
  if (parsed !== false) app.set('trust proxy', parsed);
}
