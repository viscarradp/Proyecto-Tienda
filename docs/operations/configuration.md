# Configuración — Variables de Entorno

Copia el `.env.example` de cada app y completa los valores reales. Nunca
subas un `.env` real al repositorio (ya está en `.gitignore`).

## Backend (`erp-tienda-backend/.env`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión a PostgreSQL (Supabase u otro proveedor). |
| `JWT_SECRET` | Sí | Secreto para firmar/verificar JWT. El servidor **no arranca** sin esta variable; en producción además exige >= 32 caracteres y rechaza los valores de ejemplo del repo. Usa `openssl rand -hex 32`. |
| `PORT` | No (default `3000`) | Puerto donde escucha el backend. |
| `INITIAL_ADMIN_PASSWORD` | No, pero recomendada | Contraseña del usuario `admin` que se crea automáticamente la primera vez que arranca con la tabla `usuarios` vacía. Si falta, **no se crea ningún admin** (ver [`../decisions/0003-admin-seed-por-env.md`](../decisions/0003-admin-seed-por-env.md)). |
| `CORS_ORIGINS` | No en desarrollo (default `http://localhost:3001`); **Sí con `NODE_ENV=production`** | Orígenes permitidos por CORS, separados por coma. En producción debe apuntar al dominio real del frontend; si falta, el servidor no arranca. |
| `NODE_ENV` | Sí en producción (la imagen ya trae `production`) | `production` exige `CORS_ORIGINS` y un `JWT_SECRET` de >= 32 caracteres (si no, **no arranca**). Swagger solo se enciende con `development` o `ENABLE_SWAGGER=true`; si falta `NODE_ENV` queda apagado. |
| `TRUST_PROXY` | No (default desactivado) | Saltos de proxy en los que confiar para leer la IP real del cliente (`X-Forwarded-For`). El rate-limit cuenta por IP: sin esto, detrás de un balanceador toda la tienda comparte un solo cupo (login: 5/min en total). **Cloud Run: `1`.** Acepta un número, o IPs/CIDR (`10.0.0.0/8`); `true` se rechaza. Si el backend está expuesto directo a internet, déjala vacía (un cliente podría falsificar su IP). |
| `DB_POOL_MAX` | No (default `5`) | Máximo de conexiones del pool de PostgreSQL **por instancia**. instancias x `DB_POOL_MAX` debe caber en el límite de conexiones del plan de la BD (con Supabase, usa la URL del pooler). |
| `ZONA_HORARIA_NEGOCIO` | No (default `America/El_Salvador`) | Zona horaria de la tienda, como nombre IANA. Existe porque los reportes (`estado-resultados`, `productos-top`, `margen-por-producto`, `flujo-efectivo`) agrupan por **día en la hora de la tienda**: las fechas se guardan en UTC y, sin esta zona, una venta de las 6 pm en adelante caería en el día siguiente. Si el valor es inválido, el servidor **no arranca**. |
| `TOLERANCIA_DESCUADRE` | No (default `1.00`) | Monto en dólares a partir del cual un descuadre al **cerrar caja** o en el **arqueo de bóveda** exige justificación. Por debajo, el ajuste es automático. Ver [`../domain/caja-y-turnos.md`](../domain/caja-y-turnos.md). |
| `ENABLE_SWAGGER` | No | Si es `"true"`, enciende Swagger (en `/api`) aunque `NODE_ENV=production`. |

## Bot de Telegram (registrar compras por chat)

La dueña puede registrar compras escribiéndole al bot (texto o foto de la factura). El bot **viene apagado**: sin
`TELEGRAM_MODO` no hace nada, así que tests y entornos sin token no cambian.

| Variable | Obligatoria | Descripción |
|---|---|---|
| `TELEGRAM_MODO` | No (default `apagado`) | `apagado`, `polling` (demo en la laptop, sin URL pública) o `webhook` (Render). Si el modo está activo pero falta el token, el bot queda apagado y avisa en el log. |
| `TELEGRAM_BOT_TOKEN` | Sí con `polling` o `webhook` | Token que entrega @BotFather. **Es un secreto**: solo en el `.env` local o directo en Render; nunca en el repo, el chat ni capturas. El backend lo enmascara en logs y errores. |
| `TELEGRAM_USUARIOS` | Sí para que alguien pueda usarlo | Lista `telegramUserId:nombreDeUsuario` separada por comas, p. ej. `123456789:admin`. El nombre es el del usuario del ERP: debe existir, estar **activo** y ser **ADMIN** (las compras son de la dueña). |
| `TELEGRAM_WEBHOOK_URL` | No (solo `webhook`) | URL pública completa, p. ej. `https://tu-backend.onrender.com/telegram/webhook`. Si está definida, el backend la registra en Telegram al arrancar. |
| `TELEGRAM_WEBHOOK_SECRET` | Sí con `webhook` | Texto aleatorio de **16 caracteres o más** (`openssl rand -hex 24`). Telegram lo manda en `X-Telegram-Bot-Api-Secret-Token` y el backend responde 401 si no coincide. Con `NODE_ENV=production` y `webhook`, el servidor no arranca sin token ni secreto válido. |
| `OPENROUTER_API_KEY` | Sí para que el bot entienda | Clave de OpenRouter. **Es un secreto** (mismo trato que el token). Sin ella el bot contesta "No pude leer eso ahora". |
| `OPENROUTER_MODEL` | Sí para que el bot entienda | ID exacto del modelo en OpenRouter, p. ej. `anthropic/claude-sonnet-5.5`, `qwen/qwen3.8-max-0902` o `moonshotai/kimi-k3.1-pro` (los tres aceptan fotos; precios y criterio en [`../domain/bot.md`](../domain/bot.md)). Se cambia sin tocar código. |
| `OPENROUTER_MODEL_VISION` | No | Modelo para las fotos de factura; si falta, se usa `OPENROUTER_MODEL` (que entonces debe aceptar imágenes). |
| `OPENROUTER_DATA_COLLECTION` | No (default `deny`) | `deny` pide a OpenRouter solo proveedores que no guardan los datos; `allow` lo relaja si un modelo se queda sin proveedores. |

Solo se atienden chats privados (los grupos se ignoran). A quien no esté en `TELEGRAM_USUARIOS` el bot le contesta su
número de Telegram para que se lo pase a quien administra el sistema.

### Crear el bot con @BotFather

1. En Telegram, busca **@BotFather** y escribe `/newbot`.
2. Elige un nombre para mostrar (p. ej. "Mi Tienda").
3. Elige un nombre de usuario que termine en `bot` (p. ej. `mitienda_compras_bot`).
4. BotFather responde con el token. Cópialo a `TELEGRAM_BOT_TOKEN` en tu `.env` **sin compartirlo** con nadie.
   Si se filtra, en @BotFather usa `/revoke` para generar otro.

### Demo en local (polling)

1. Agrega al `erp-tienda-backend/.env`: `TELEGRAM_MODO=polling`, `TELEGRAM_BOT_TOKEN=<tu token>`,
   `OPENROUTER_API_KEY=<tu clave>` y `OPENROUTER_MODEL=<modelo>`.
2. Arranca el backend (`npm run start:dev`) y, desde tu cuenta, escríbele `/start` al bot.
3. Como todavía no estás autorizado, te contesta tu número de Telegram. Ponlo en `TELEGRAM_USUARIOS`
   (p. ej. `123456789:admin`) y reinicia el backend.
4. Escríbele lo que compraste o mándale la foto de una factura.

En `polling` el backend quita cualquier webhook previo y consulta a Telegram cada ~30 s; no necesita URL pública.

## Frontend (`erp-tienda-frontend/.env.local`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No (default `http://localhost:3000`) | URL base del backend. Al llevar el prefijo `NEXT_PUBLIC_`, **se expone al navegador** — nunca poner un secreto en una variable con este prefijo. Se **incrusta en el bundle al construir**: en la imagen de producción es un `--build-arg`, no una variable de ejecución (ver [`deployment.md`](deployment.md)). Si apunta a localhost y la página se abre por otra dirección (p. ej. la IP de la laptop desde el celular), el navegador usa esa dirección en lugar de localhost. |
| `DEV_ORIGINS` | No | Solo desarrollo. Orígenes extra (separados por coma) que pueden abrir `next dev`, además de las IP de la laptop, que se detectan solas. Sirve dentro de Docker, donde la IP del contenedor no es la de la laptop. |

## Respaldo (secretos de GitHub Actions, no van en ningún `.env`)

Los usa `.github/workflows/respaldo.yml` y `scripts/respaldo/*.sh`. Guía en [`respaldos.md`](respaldos.md).

| Variable | Dónde | Descripción |
|---|---|---|
| `BACKUP_DATABASE_URL` | Secreto de GitHub | Cadena de **conexión directa** (puerto 5432, no el pooler) de la BD a respaldar. |
| `BACKUP_PASSPHRASE` | Secreto de GitHub | Clave de cifrado. Guárdala también fuera de GitHub: sin ella no se restaura. |
| `RESTORE_DATABASE_URL` | Entorno local, al restaurar | BD destino de `restaurar.sh` (vacía; se niega si el host no es local salvo `--confirmo-destino-remoto`). |
| `BACKUP_OUT_DIR`, `BACKUP_SCHEMA` | Opcionales | Directorio de salida (default `./respaldos`) y esquema a respaldar (default `public`). |

## Notas de despliegue

- El proyecto es agnóstico de proveedor: la base de datos puede vivir en
  Supabase (recomendado hoy) y el backend en cualquier servicio que corra
  Node.js (Cloud Run, Render, un VM de GCP/AWS, etc.). Ninguna configuración está atada
  a un proveedor específico — todo pasa por estas variables de entorno.
- Si el backend y el frontend corren en dominios distintos, `CORS_ORIGINS`
  debe incluir el dominio exacto del frontend (con esquema, ej.
  `https://mi-tienda.vercel.app`), separado por coma si hay más de uno.

Pasos de despliegue, health check e imágenes de producción: [`deployment.md`](deployment.md).
