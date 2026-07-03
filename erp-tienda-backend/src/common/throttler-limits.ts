/**
 * Límites de rate-limiting reales (producción/desarrollo). En NODE_ENV=test
 * se usan límites muy altos para que la suite e2e (que dispara decenas de
 * requests en segundos contra el mismo "cliente" de pruebas) no choque con
 * el propio rate-limit — no es un hueco de seguridad, solo aplica cuando
 * quien controla el entorno es la propia suite de tests.
 * Ver docs/decisions/0009-testing-e2e.md.
 */
const isTest = process.env.NODE_ENV === 'test';

export const GLOBAL_THROTTLE_LIMIT = isTest ? 100000 : 60;
export const LOGIN_THROTTLE_LIMIT = isTest ? 100000 : 5;
