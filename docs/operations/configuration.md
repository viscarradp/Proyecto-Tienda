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

## Frontend (`erp-tienda-frontend/.env.local`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No (default `http://localhost:3000`) | URL base del backend. Al llevar el prefijo `NEXT_PUBLIC_`, **se expone al navegador** — nunca poner un secreto en una variable con este prefijo. Se **incrusta en el bundle al construir**: en la imagen de producción es un `--build-arg`, no una variable de ejecución (ver [`deployment.md`](deployment.md)). |

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
