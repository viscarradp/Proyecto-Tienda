# Desarrollo con Docker

Levanta PostgreSQL, backend y frontend con un comando, con hot-reload. Son imágenes **solo de desarrollo**
(`Dockerfile.dev`); la producción no usa Docker Compose (ver [`deployment.md`](deployment.md)).

## Requisitos

- Docker Desktop (trae Docker Compose) corriendo.
- Git.

## Inicio rápido

```bash
# En la raíz del proyecto (la primera vez construye las imágenes)
./scripts/docker-dev.sh start
```

O sin el script: `docker compose build` y luego `docker compose up`.

- **Frontend:** http://localhost:3001
- **Backend:** http://localhost:3000
- **Swagger (API):** http://localhost:3000/api
- **PostgreSQL:** localhost:5432 (usuario `postgres`, contraseña `postgres`, base `erp_tienda_dev`)

Entra con el usuario `admin` y la contraseña `INITIAL_ADMIN_PASSWORD`. `docker-compose.yml` trae un valor por defecto
**solo para desarrollo**; cámbialo en un `.env` en la raíz si quieres (ver más abajo).

Para detener:

```bash
./scripts/docker-dev.sh stop    # o: docker compose down
```

## Estructura

```
Proyecto-Tienda/
├── docker-compose.yml          # Los 3 servicios
├── .env.example                # Plantilla de variables SOLO para docker compose
├── erp-tienda-backend/
│   ├── Dockerfile.dev          # Imagen de DESARROLLO del backend; la de producción es Dockerfile
│   ├── .dockerignore
│   └── .env.example            # Plantilla para correr el backend SIN Docker
├── erp-tienda-frontend/
│   ├── Dockerfile.dev          # Imagen de DESARROLLO del frontend; la de producción es Dockerfile
│   ├── .dockerignore
│   └── .env.example            # Plantilla para correr el frontend SIN Docker
└── scripts/
    └── docker-dev.sh           # Script helper
```

### Los tres `.env.example` no se mezclan

| Archivo | Variables | Cuándo se usa |
|---|---|---|
| `.env.example` (raíz) | `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`, `ZONA_HORARIA_NEGOCIO` y `NEXT_PUBLIC_API_URL` (las dos últimas comentadas), que `docker compose` inyecta en los contenedores | Solo con `docker compose` |
| `erp-tienda-backend/.env.example` | Todas las variables del backend | Solo si corres el backend con `npm run start:dev` **sin Docker** |
| `erp-tienda-frontend/.env.example` | `NEXT_PUBLIC_API_URL` | Solo si corres el frontend con `npm run dev` **sin Docker** |

Con Docker, `DATABASE_URL`, `CORS_ORIGINS`, etc. ya están fijados en `docker-compose.yml` (apuntan a los nombres de
servicio de la red de Docker); no hace falta copiar los `.env.example` de las subcarpetas. Copia el de la raíz a `.env`
solo si quieres cambiar alguno de sus valores.

## Trabajar con el código

Los cambios se reflejan solos dentro de los contenedores:

- **Backend:** se monta `src/` y `prisma/`; `npm run start:dev` recarga al guardar.
- **Frontend:** se montan solo `app`, `components`, `hooks`, `lib`, `public` y `src`. Un cambio en `proxy.ts`,
  `next.config.ts` o `package.json` no llega al contenedor: reconstruye con `docker compose build frontend`.
  Lo mismo aplica a `package.json` del backend.

### Logs y shells

```bash
./scripts/docker-dev.sh logs             # todos
./scripts/docker-dev.sh logs-backend     # también logs-frontend y logs-db
./scripts/docker-dev.sh shell-backend    # también shell-frontend y shell-db (psql)
./scripts/docker-dev.sh ps               # estado
./scripts/docker-dev.sh restart
```

## Servicios

- **PostgreSQL:** puerto 5432, base `erp_tienda_dev`. Los datos viven en el volumen `erp_tienda_pg_data`, así que
  persisten al parar los contenedores.
- **Backend (NestJS):** puerto 3000, modo desarrollo. Al iniciar corre `prisma db push --accept-data-loss` contra la base
  local (aplica el esquema sin migraciones, ADR [0002](../decisions/0002-sin-migraciones-hasta-produccion.md); puede
  borrar datos si el esquema pierde columnas, por eso solo se usa con esta base desechable), arranca en modo watch y
  expone Swagger.
- **Frontend (Next.js):** puerto 3001, `next dev`. Se conecta al backend con `NEXT_PUBLIC_API_URL`
  (`http://localhost:3000` por defecto).

Variables que fija `docker-compose.yml` para el backend: `DATABASE_URL`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`,
`CORS_ORIGINS=http://localhost:3001`, `ZONA_HORARIA_NEGOCIO`, `NODE_ENV=development` y `ENABLE_SWAGGER=true`. Para
sobrescribir las que lee de la raíz, crea un `.env` ahí:

```bash
JWT_SECRET=tu-secreto-aqui
INITIAL_ADMIN_PASSWORD=TuContraseña123!
```

## Datos

```bash
docker volume ls | grep tienda
./scripts/docker-dev.sh clean     # docker compose down -v: BORRA la base local
```

Respaldo y restauración (los de producción, que son los que importan): [`respaldos.md`](respaldos.md).

## Testing

Los unitarios del backend, dentro del contenedor:

```bash
./scripts/docker-dev.sh test-backend
```

Los e2e **no** se corren en el contenedor (la imagen no trae la carpeta `test`) y además borrarían la base de
desarrollo. Se corren desde tu máquina con una base propia: ver [`testing.md`](testing.md).

## Problemas comunes

- **El backend no se conecta a la base:** `docker compose ps`; `postgres` debe mostrar `healthy` (puede tardar unos
  segundos). Si no, revisa `./scripts/docker-dev.sh logs-backend`.
- **Puerto ya en uso** (3000, 3001 o 5432): cierra el proceso que lo usa (en Windows,
  `netstat -ano | findstr :3000`) o el Postgres local que ocupe el 5432.
- **No se ven los cambios:** confirma que editas un archivo de una carpeta montada (ver arriba) y recarga el navegador.
  Si cambiaste dependencias o archivos no montados, reconstruye.
- **Reconstruir de cero:**

  ```bash
  docker compose down
  docker compose build --no-cache
  docker compose up
  ```
