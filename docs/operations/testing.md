# Testing

## Qué existe

- **Tests unitarios** (`erp-tienda-backend/src/**/*.spec.ts`): scaffolding
  por defecto de NestJS. No hay lógica de negocio cubierta aquí todavía.
- **Tests e2e** (`erp-tienda-backend/test/*.e2e-spec.ts`): cubren los
  escenarios de concurrencia que la auditoría encontró como reales —
  sobreventa del motor FIFO (hallazgo H1) y doble apertura/cierre de turno
  de caja (hallazgo H7). Ver el detalle de alcance y por qué no se buscó
  cobertura exhaustiva en
  [`../decisions/0009-testing-docker-ci.md`](../decisions/0009-testing-docker-ci.md).
- **Frontend**: sin tests todavía (solo lint + build en CI).

## Cómo correr los tests e2e localmente

Requieren un Postgres corriendo. `docker-compose.yml` (raíz del repo) lo
provee:

```bash
docker compose up -d postgres
cd erp-tienda-backend
npm run test:e2e
```

No hace falta ningún archivo `.env`: `test/global-setup.js` define valores
por defecto (`DATABASE_URL`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`) que
coinciden exactamente con las credenciales de `docker-compose.yml`. Si ya
tienes esas variables en tu entorno, se respetan tal cual (`??=`, no las
sobreescribe).

⚠️ **`npm run test:e2e` borra y recrea el schema de la base de datos
apuntada por `DATABASE_URL`** (`prisma db push --force-reset`) antes de
correr — es necesario para que los tests sean deterministas. **Nunca
apunta esto a una base con datos reales.** Por defecto solo puede afectar
al Postgres local de `docker-compose.yml`.

## Cómo correr los tests unitarios

```bash
cd erp-tienda-backend
npm run test
```

No requieren base de datos.

## CI

`.github/workflows/ci.yml` corre automáticamente en cada push y en cada PR
a `master`: lint + build + tests unitarios + tests e2e (backend, con un
Postgres de servicio propio de GitHub Actions) y lint + build (frontend).
Detalle de las decisiones de diseño en
[`../decisions/0009-testing-docker-ci.md`](../decisions/0009-testing-docker-ci.md).
