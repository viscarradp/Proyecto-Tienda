# Despliegue — imágenes de producción

Cada app tiene dos Dockerfiles:

| Archivo | Uso |
|---|---|
| `Dockerfile` | **Producción.** Multi-stage, solo dependencias de producción, usuario no-root, sin comandos de esquema. |
| `Dockerfile.dev` | Desarrollo con hot-reload (lo usa `docker-compose.yml`). El backend corre `db push --accept-data-loss` contra la BD **local**: nunca lo despliegues. |

Decisión y motivos: [`../decisions/0010-imagenes-produccion.md`](../decisions/0010-imagenes-produccion.md).

## Construir

```bash
# Backend (~520 MB)
docker build -t tienda-backend:prod ./erp-tienda-backend

# Frontend (~230 MB). La URL del API se INCRUSTA en el bundle al construir.
docker build -t tienda-frontend:prod \
  --build-arg NEXT_PUBLIC_API_URL=https://api.mi-tienda.example.com \
  ./erp-tienda-frontend
```

`NEXT_PUBLIC_API_URL` es pública (llega al navegador) y se fija en el build:
cambiarla exige reconstruir la imagen; `docker run -e` no la modifica. Nunca
pongas secretos en variables `NEXT_PUBLIC_*`.

## Correr

```bash
docker run --rm -p 3000:3000 --env-file backend.env tienda-backend:prod
docker run --rm -p 3001:3001 tienda-frontend:prod
```

Variables del backend (detalle en [`configuration.md`](configuration.md)):

| Variable | Notas |
|---|---|
| `DATABASE_URL` | Obligatoria. En Supabase, la URL del pooler con `sslmode=require`. |
| `JWT_SECRET` | Obligatoria, >= 32 caracteres (`openssl rand -hex 32`). |
| `CORS_ORIGINS` | Obligatoria: URL exacta del frontend. |
| `INITIAL_ADMIN_PASSWORD` | Solo para el primer arranque con BD vacía (ADR 0003). |
| `TRUST_PROXY` | `1` en Cloud Run (ver abajo). |
| `DB_POOL_MAX` | Opcional (default 5). instancias x valor <= límite de conexiones de la BD. |

La imagen fija `NODE_ENV=production`: si falta `CORS_ORIGINS` o `JWT_SECRET` es
corto, el proceso termina al arrancar con un mensaje que lo explica. Cloud Run
inyecta `PORT` (la app lo respeta).

## Health check

`GET /salud` es público, ejecuta `SELECT 1` y responde `200 {"estado":"ok"}`, o
`503 {"estado":"error"}` si la BD no responde. Úsalo como startup/liveness
probe del proveedor y como URL de un monitor externo con aviso por correo
(UptimeRobot, uptime check de GCP). No lleva datos sensibles ni rate-limit.

## TRUST_PROXY (Cloud Run)

Detrás de un balanceador, todas las peticiones llegan con la IP del proxy y el
rate-limit trataría a toda la tienda como un solo cliente. En **Cloud Run
define `TRUST_PROXY=1`** (un único salto: el frontend de Google). Con otro
número de proxies, ajusta el valor a esa cantidad. Si el backend queda expuesto
directamente a internet, déjala vacía.

Recomendado para el API en Cloud Run: `min-instances=1` (evita el arranque en
frío al abrir la tienda) y `max-instances=2` (el rate-limit está en memoria por
instancia, y limita las conexiones a la BD).

## Esquema de la base de datos (paso manual)

Las imágenes **no** tocan el esquema. Hasta entrar a producción real el esquema
se aplica a mano (ADR 0002), desde tu máquina y con la URL **directa** de
Supabase (no la del pooler, que no soporta DDL):

```bash
cd erp-tienda-backend
DATABASE_URL="<url-directa>" npx prisma db push   # pide confirmación si hay pérdida de datos
```

Al entrar a producción con datos reales se adoptan migraciones
(`prisma migrate deploy` como paso explícito del despliegue, nunca en el `CMD`
de la imagen). Los catálogos base (`prisma/seed.ts`) son opcionales y no crean
usuarios; el admin inicial lo crea el backend con `INITIAL_ADMIN_PASSWORD`.

## Checklist rápido

1. Esquema aplicado (paso anterior).
2. Imágenes construidas; subirlas al registro del proveedor es un paso manual.
3. Variables definidas; backend arriba, `GET /salud` responde 200.
4. Entrar con `admin` y **cambiar la contraseña inicial**; retirar `INITIAL_ADMIN_PASSWORD`.
