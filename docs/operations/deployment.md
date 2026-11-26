# Despliegue — producción en Render, Vercel y Supabase

Desde el 2026-11-26 el sistema corre en tres servicios gratuitos. Decisión y motivos:
[`../decisions/0013-produccion-render-vercel-supabase.md`](../decisions/0013-produccion-render-vercel-supabase.md).
Las variables están descritas en [`configuration.md`](configuration.md).

## 1. Mapa de producción

| Parte | Dónde corre | Cómo se despliega | Dirección |
|---|---|---|---|
| Backend (NestJS) | Render, servicio "Proyecto-Tienda" (plan gratis) | Solo, con cada push a `master` | `https://proyecto-tienda-nbi6.onrender.com` |
| Frontend (Next.js) | Vercel | Solo, con cada push | `https://proyecto-tienda-sand.vercel.app` |
| Base de datos | Supabase, proyecto "Tienda ERP DB" | A mano (ver sección 4) | Secreto `DATABASE_URL` en Render |
| Respaldo nocturno | GitHub Actions | Programado | [`respaldos.md`](respaldos.md) |

No hay `render.yaml`: la configuración del servicio de Render (tipo de ejecución, comandos de build y arranque, carpeta
raíz) vive en el panel de Render, no en el repo. Si hay que revisarla o cambiarla, se hace ahí.

## 2. Backend en Render

**Health check.** `GET /salud` es público, ejecuta `SELECT 1` y responde `200 {"estado":"ok"}`, o
`503 {"estado":"error"}` si la base no responde. No lleva datos sensibles ni rate-limit. Es la ruta del health check de
Render y la que usa el ping de la laptop de la tienda.

**Variables.** Se cargan en Render → servicio → *Environment*. La plantilla sin secretos es
[`render.env.example`](render.env.example) (se pega con *Add from .env*); los secretos se cargan directo en Render.

| Variable | Valor en producción |
|---|---|
| `NODE_ENV` | `production` (explícita: activa la validación de arranque) |
| `CORS_ORIGINS` | `https://proyecto-tienda-sand.vercel.app` |
| `TRUST_PROXY` | `1` |
| `ZONA_HORARIA_NEGOCIO` | `America/El_Salvador` |
| `DATABASE_URL` | Secreto. Session pooler de Supabase, puerto 5432 (sección 4). |
| `JWT_SECRET` | Secreto, 32 caracteres o más (`openssl rand -hex 32`). |
| `INITIAL_ADMIN_PASSWORD` | Secreto, solo para el primer arranque con la base sin usuarios (ADR 0003). Se retira después de cambiar la contraseña del admin. |
| `DB_POOL_MAX` | Opcional (default 5). Instancias x valor deben caber en el límite de conexiones de la base. |
| Bot de Telegram | Sección 6. |

**No definir** `PORT` (Render lo pone solo y la app lo respeta) ni `ENABLE_SWAGGER` (con `NODE_ENV=production` la
documentación de la API queda apagada).

**El arranque se niega a seguir** (con un mensaje que lo explica) si falta `CORS_ORIGINS`, si `JWT_SECRET` tiene menos
de 32 caracteres o es un valor de ejemplo del repo, o si el bot está en modo `webhook` sin token o con un secreto de
menos de 16 caracteres (`src/common/config-produccion.ts`). Si un despliegue no levanta, mira primero los logs de Render.

**`TRUST_PROXY=1`.** Detrás de Render todas las peticiones llegan con la IP del proxy y el rate-limit trataría a toda la
tienda como un solo cliente (login: 5 intentos por minuto en total). Con `1` confía en un único salto de proxy y lee la
IP real. Con otro número de proxies, ajusta el valor. Si el backend quedara expuesto directo a internet, déjala vacía.

**Una sola instancia.** El rate-limit está en memoria de cada proceso: con más de una instancia cada una contaría por
separado. Mantén el servicio en una instancia (además, el plan gratis no escala).

**Plan gratis y sueño.** Render duerme el servicio tras ~15 minutos sin tráfico; el primer pedido después tarda ~1 minuto
en responder. El plan regala 750 horas de instancia al mes. Para que la tienda no sufra el sueño en horario de trabajo,
la laptop del punto de venta lo mantiene despierto (sección 5).

## 3. Frontend en Vercel

Vercel construye y publica con cada push. `NEXT_PUBLIC_API_URL` (la dirección del backend) es pública y **se incrusta en
el bundle al construir** (`lib/api.ts`): si cambia, hay que **redesplegar** el frontend; no basta con cambiar la variable.
Nunca pongas secretos en variables `NEXT_PUBLIC_*`. Si la dirección del frontend cambia, actualiza `CORS_ORIGINS` en
Render.

## 4. Base de datos en Supabase

- **Conexión.** La conexión directa de Supabase (`db.<proyecto>.supabase.co`) es solo IPv6. Render y los runners de
  GitHub Actions no la alcanzan: ambos usan el **Session pooler (puerto 5432)** con `sslmode=require`.
- **RLS.** Todas las tablas tienen RLS activado **sin políticas**: la API de datos de Supabase (PostgREST) no las expone.
  El backend entra como dueño de las tablas.
- **Esquema de respaldo.** Las tablas viejas de marzo quedaron en el esquema `respaldo_2026_11_26`. No las usa la app y
  el respaldo nocturno no las cubre (ver [`respaldos.md`](respaldos.md)).
- **Cambios de esquema.** No hay migraciones ([ADR 0002](../decisions/0002-sin-migraciones-hasta-produccion.md)). Un
  cambio de esquema se ensaya primero en una base local desechable, se compara con `prisma migrate diff` y se aplica en
  Supabase con el MCP de Supabase, con permiso del usuario. **Nunca** se corren los e2e ni `db push --force-reset`
  contra una base remota. Ni las imágenes de producción ni el arranque del backend tocan el esquema.
- Los catálogos base (`prisma/seed.ts`) son opcionales y no crean usuarios; el admin inicial lo crea el backend con
  `INITIAL_ADMIN_PASSWORD`.
- Los cambios de esquema que Supabase aún no tiene están en
  [`plan-fases.md`](../roadmap/plan-fases.md#cambios-de-esquema-pendientes-en-supabase).

## 5. Mantener despierto el backend

La laptop del punto de venta hace `GET /salud` cada 10 minutos de 05:30 a 21:30, y además al arrancar y al despertar de
una suspensión (`scripts/pos/tienda-ping.sh`). De noche el backend se duerme solo y no gasta las 750 horas. Instalación
y mantenimiento: [`laptop-pos.md`](laptop-pos.md). Si la laptop está apagada, el primer pedido del día tarda ~1 minuto.

## 6. Bot de Telegram en producción

Reglas del bot: [`../domain/bot.md`](../domain/bot.md). En Render se usa el modo `webhook`:

| Variable | Notas |
|---|---|
| `TELEGRAM_MODO` | `webhook`. Sin ella el bot queda apagado. |
| `TELEGRAM_BOT_TOKEN` | Secreto, el de @BotFather. Obligatorio con `webhook`. |
| `TELEGRAM_WEBHOOK_SECRET` | Secreto, 16 caracteres o más (`openssl rand -hex 24`). Obligatorio con `webhook`. |
| `TELEGRAM_WEBHOOK_URL` | `https://proyecto-tienda-nbi6.onrender.com/telegram/webhook`. Si está definida, el backend registra el webhook en Telegram **cada vez que arranca**. |
| `TELEGRAM_USUARIOS` | `telegramUserId:nombreDeUsuario` (ADMIN activo), separados por coma. |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Secreto y modelo para interpretar las compras. `OPENROUTER_MODEL_VISION` y `OPENROUTER_DATA_COLLECTION` son opcionales. |

Telegram llama a `POST /telegram/webhook` con el secreto en el encabezado `X-Telegram-Bot-Api-Secret-Token`; sin él (o
si no coincide) el backend responde 401. Si el backend está dormido, el primer mensaje tarda en responder mientras
Render despierta.

## 7. Respaldos

El respaldo nocturno cifrado (GitHub Actions + `pg_dump`) y el ensayo de restauración están en
[`respaldos.md`](respaldos.md). Actívalo **antes** de la primera venta real.

## 8. Antes de la primera venta real

El checklist completo está en [`../roadmap/plan-fases.md`](../roadmap/plan-fases.md#antes-de-la-primera-venta-real).

## Probar las imágenes de producción en local

Para reproducir producción en tu máquina, cada app trae un `Dockerfile` de producción
(multi-stage, solo dependencias de producción, usuario no-root, sin comandos de esquema; ver
[ADR 0010](../decisions/0010-imagenes-produccion.md)). El `Dockerfile.dev` es solo de desarrollo y **nunca** se despliega:
el backend corre `db push --accept-data-loss` al arrancar.

```bash
# Backend
docker build -t tienda-backend:prod ./erp-tienda-backend
docker run --rm -p 3000:3000 --env-file backend.env tienda-backend:prod

# Frontend: la URL del API se INCRUSTA en el bundle al construir
docker build -t tienda-frontend:prod \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3000 \
  ./erp-tienda-frontend
docker run --rm -p 3001:3001 tienda-frontend:prod
```

La imagen del backend fija `NODE_ENV=production`, así que `backend.env` debe traer `DATABASE_URL`, `JWT_SECRET` (32
caracteres o más) y `CORS_ORIGINS` (aquí, `http://localhost:3001`). En el frontend, `docker run -e
NEXT_PUBLIC_API_URL=...` no tiene efecto: hay que reconstruir con `--build-arg`.
