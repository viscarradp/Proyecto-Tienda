# 0010 — Imágenes de producción separadas y defaults seguros de despliegue

> **Complementado por [ADR 0013](0013-produccion-render-vercel-supabase.md):** el destino final es Render + Vercel +
> Supabase, no Cloud Run; `TRUST_PROXY=1` vale igual en Render, y el esquema se aplica con el MCP de Supabase.

**Estado:** Aceptado · **Fecha:** 2026-11 (ciclo 2026-11, lote L3a)

## Contexto

Los únicos Dockerfiles eran de desarrollo: el del backend arrancaba con
`prisma db push --accept-data-loss && npm run start:dev` y el del frontend con
`next dev` (ARQ-01). Reutilizarlos para desplegar en Cloud Run habría ejecutado
`db push --accept-data-loss` contra Supabase en cada arranque y autoescalado.
Además, la configuración fallaba abierta (ARQ-18): Swagger encendido si faltaba
`NODE_ENV`, CORS por defecto, ningún control del `JWT_SECRET`; detrás de un
balanceador el rate-limit veía una sola IP (COD-04); el pool `pg` no tenía
manejador de errores, y un error de conexión ociosa tumbaba el proceso
(ARQ-06); y `prisma/seed.ts` creaba `admin` con contraseña fija, contra el ADR
0003.

## Decisión

1. **Dos Dockerfiles por app.** `Dockerfile` es de producción (multi-stage,
   `npm ci`, build, solo dependencias de producción, usuario `node`, sin
   comandos de esquema; backend `node dist/src/main.js`, frontend `output:
   'standalone'` + `node server.js`). `Dockerfile.dev` conserva el
   comportamiento de desarrollo; `docker-compose.yml` usa estos últimos. El
   `db push --accept-data-loss` queda solo en el de desarrollo, comentado.
   `NEXT_PUBLIC_API_URL` es un build arg (se incrusta en el bundle).
2. **`GET /salud`**: público, `SELECT 1`, 200 `{estado:'ok'}` / 503; exento del
   throttler. Es el health check del proveedor.
3. **`TRUST_PROXY`** (número de saltos o CIDR; `true` rechazado) configura
   `trust proxy` de Express. Desactivado por defecto; `1` en Cloud Run.
4. **Validación al arrancar con `NODE_ENV=production`**: exige `CORS_ORIGINS` y
   `JWT_SECRET` >= 32 caracteres (rechaza además los valores de ejemplo del
   repo). Swagger pasa a ser opt-in: solo con `NODE_ENV=development` o
   `ENABLE_SWAGGER=true` (modifica el punto 4 del ADR 0004).
5. **Seed sin usuarios**: solo catálogos base idempotentes; el admin inicial
   sigue siendo `INITIAL_ADMIN_PASSWORD` (ADR 0003).
6. **Pool `pg`**: `DB_POOL_MAX` (default 5), `idleTimeoutMillis` 30 s,
   `connectionTimeoutMillis` 10 s, y `pool.on('error')` que registra sin
   tumbar el proceso.

## Alternativas consideradas

- **Un solo Dockerfile con `target` de dev/prod**: más compacto, pero un
  `docker build .` sin target seguiría pudiendo producir la imagen peligrosa.
  Con archivos separados, el nombre por defecto es el seguro.
- **Ejecutar migraciones/`db push` en el arranque de producción**: descartado
  (ADR 0002); el esquema es un paso explícito y manual.
- **`TRUST_PROXY=1` automático en producción**: falla si el backend queda sin
  proxy (IP falsificable). Se prefiere explícito por variable.
- **Observabilidad adicional (Sentry, request-id)**: fuera de alcance ("no
  sobreingeniería"); bastan los logs del proveedor y el monitor sobre `/salud`.

## Consecuencias

- Quien despliega debe definir `CORS_ORIGINS` y un `JWT_SECRET` fuerte, o el
  proceso no arranca (a propósito).
- Cambiar la URL del API exige reconstruir la imagen del frontend.
- Sin `NODE_ENV` definido, Swagger queda apagado: en desarrollo local usa
  `NODE_ENV=development` (ya está en los `.env.example`).
- El `/health` antiguo se mantiene sin tocar la BD; el health check real es
  `/salud`.
- Aplicar el esquema sigue siendo un paso manual documentado en
  [`../operations/deployment.md`](../operations/deployment.md).
