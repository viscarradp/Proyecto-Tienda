# Testing

## Qué existe

- **Tests unitarios** (`erp-tienda-backend/src/**/*.spec.ts`): lógica pura sin base de datos — zona horaria del negocio,
  validación de configuración de producción y `TRUST_PROXY`, filtro de excepciones de Prisma, deuda de
  stock, entre otros.
- **Tests e2e** (`erp-tienda-backend/test/*.e2e-spec.ts`, 156 casos en 19 archivos al cierre del Ciclo 2026-11): levantan la app real de Nest contra un
  Postgres real y cubren las invariantes del negocio — motor FIFO y sobreventa concurrente, turnos de caja, apertura con
  diferencia y origen, política "registrar y avisar", bóveda y arqueo, estado de resultados y patrimonio, devoluciones y
  anulación, venta por monto y sin stock (mostrador flexible), idempotencia, contingencia, permisos y trazabilidad (D-06),
  deudas con proveedores y abonos, paginación, zona horaria de los reportes, `/salud`. Alcance y por qué se prioriza la
  concurrencia: [`../decisions/0009-testing-docker-ci.md`](../decisions/0009-testing-docker-ci.md).
- **Frontend**: sin tests automáticos todavía (lint + build en CI; los lotes de interfaz se verifican en el navegador).

## Cómo correr los tests e2e localmente

Requieren un Postgres corriendo. `docker-compose.yml` (raíz del repo) lo provee:

```bash
docker compose up -d postgres
cd erp-tienda-backend
npm run test:e2e
```

No hace falta ningún archivo `.env`: `test/global-setup.js` define valores por defecto (`DATABASE_URL`, `JWT_SECRET`,
`INITIAL_ADMIN_PASSWORD`) que coinciden con las credenciales de `docker-compose.yml`. Si ya tienes esas variables en tu
entorno, se respetan tal cual (`??=`, no las sobreescribe).

⚠️ **`npm run test:e2e` borra y recrea el schema de la base apuntada por `DATABASE_URL`**
(`prisma db push --force-reset`) antes de correr, para que los tests sean deterministas. **Nunca la apuntes a una base con
datos reales.** El valor por defecto es `erp_tienda_dev`, la misma base que usa el desarrollo con Docker: si tienes datos de
prueba que quieres conservar ahí, **usa una base propia para los tests**:

```bash
# Crea una base solo para los e2e en el mismo Postgres de docker-compose…
docker compose exec postgres createdb -U postgres erp_tienda_e2e
# …y apúntala (Git Bash / macOS / Linux):
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/erp_tienda_e2e"
npm run test:e2e
```

(En PowerShell: `$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/erp_tienda_e2e"`.)

### Si lo corre un agente de IA (Prisma 7)

Prisma 7 **bloquea `db push --force-reset` cuando detecta que lo orquesta un agente de IA** y exige que el usuario lo
confirme explícitamente (acepta el consentimiento mediante la variable de entorno que el propio mensaje de Prisma indica,
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Es una barrera correcta: la persona responsable debe revisar primero que
`DATABASE_URL` apunte a la base desechable de pruebas y dar el consentimiento ella misma; un agente no debe sortearla
(más contexto en [ADR 0009](../decisions/0009-testing-docker-ci.md)).

## Cómo correr los tests unitarios

```bash
cd erp-tienda-backend
npm run test
```

No requieren base de datos.

## Lint y build

```bash
cd erp-tienda-backend  && npm run lint:check && npx nest build
cd erp-tienda-frontend && npm run lint && npm run build
```

`lint` del backend corre con `--fix`; `lint:check` es la versión que usa CI (falla si hay algo por corregir).

## CI

`.github/workflows/ci.yml` corre automáticamente en cada push y en cada PR a `master`: lint + build + tests unitarios + tests
e2e (backend, con un Postgres de servicio propio de GitHub Actions) y lint + build (frontend). El respaldo nocturno es otro
workflow aparte (`respaldo.yml`, ver [`respaldos.md`](respaldos.md)). Detalle de las decisiones de diseño del CI en
[`../decisions/0009-testing-docker-ci.md`](../decisions/0009-testing-docker-ci.md).
