// Se ejecuta UNA vez, antes de que Jest cargue cualquier archivo de test.
// Define valores por defecto para las variables de entorno requeridas
// (si ya vienen del entorno -p. ej. CI- no se sobreescriben) y deja el
// schema sincronizado y VACÍO contra la base de datos de pruebas.
//
// docker-compose.yml (raíz del repo) levanta un Postgres local con estas
// mismas credenciales — no hace falta ningún archivo .env para correr
// `npm run test:e2e` localmente.
const { execSync } = require('child_process');
const path = require('path');

module.exports = async function globalSetup() {
  process.env.NODE_ENV ??= 'test';
  process.env.DATABASE_URL ??=
    'postgresql://postgres:postgres@localhost:5432/erp_tienda_dev';
  // SEGURIDAD: el `db push --force-reset` de abajo es DESTRUCTIVO. DIRECT_URL se
  // ancla a la MISMA URL local que DATABASE_URL para que, aunque un .env de
  // producción defina DIRECT_URL (Supabase), la suite e2e NUNCA resetee la base
  // real. (prisma.config.ts usa DIRECT_URL para DDL.)
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  process.env.JWT_SECRET ??= 'e2e-test-secret-no-usar-en-produccion';
  process.env.INITIAL_ADMIN_PASSWORD ??= 'E2eTestAdmin123!';

  // --force-reset deja la BD en blanco antes de cada corrida: los tests
  // e2e deben ser deterministas y no depender de datos de corridas previas.
  // (Prisma 7 ya no acepta --skip-generate en `db push`.)
  execSync('npx prisma db push --force-reset --accept-data-loss', {
    cwd: path.join(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });
};
