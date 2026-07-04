# Proyecto Tienda - ERP Full Stack

Sistema ERP para tienda con enfoque en inventario, ventas, compras, caja y movimientos financieros.

## Overview

Este repositorio contiene dos aplicaciones principales:

- Backend API en NestJS + Prisma + PostgreSQL.
- Frontend web en Next.js (App Router) + React + Tailwind CSS.

> 📖 **Documentación completa en [`docs/`](docs/README.md)**: arquitectura, modelo de datos,
> reglas de negocio, seguridad, configuración, decisiones técnicas (ADRs) y el
> [plan de trabajo vigente con su estado actual](docs/roadmap/plan-fases.md). Este README
> es solo la guía rápida de instalación/arranque; para entender el *por qué* de las cosas,
> `docs/` es la fuente de verdad.

## Arquitectura

- `erp-tienda-backend`: API REST, autenticacion JWT, validacion, Swagger y acceso a datos con Prisma.
- `erp-tienda-frontend`: interfaz de usuario para login, dashboard y modulos operativos.

## Stack Tecnico

### Backend

- NestJS 11
- Prisma 7
- PostgreSQL (compatible con Supabase)
- JWT + Passport
- Swagger

### Frontend

- Next.js 16
- React 19
- Tailwind CSS 4
- Zustand
- shadcn/ui

## Modulos Principales (Backend)

- Autenticacion y usuarios
- Productos, presentaciones y categorias
- Compras e inventario por lotes
- Ajustes de inventario
- Ventas y detalle de ventas
- Caja general y turnos de caja
- Movimientos financieros y categorias de gastos

## Estructura del Repositorio

```text
.
├── erp-tienda-backend/
└── erp-tienda-frontend/
```

## Requisitos

- Node.js 20+
- npm 10+
- PostgreSQL (o URL de Supabase)

## Configuracion de Variables de Entorno

Cada app tiene un `.env.example` con todas las variables documentadas
(`erp-tienda-backend/.env.example`, `erp-tienda-frontend/.env.example`).
Cópialo a `.env` (backend) o `.env.local` (frontend) y completa los valores
reales. Detalle de cada variable en
[`docs/operations/configuration.md`](docs/operations/configuration.md).

### Backend (`erp-tienda-backend/.env`)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/erp_tienda"
JWT_SECRET="reemplaza-con-un-secreto-largo-y-aleatorio"
PORT=3000
INITIAL_ADMIN_PASSWORD="cambia-esta-contraseña"
CORS_ORIGINS="http://localhost:3001"
NODE_ENV=development
```

- `DATABASE_URL`, `JWT_SECRET`: obligatorias, el backend no arranca sin ellas.
- `PORT` (opcional, por defecto 3000).
- `INITIAL_ADMIN_PASSWORD`: contraseña del usuario `admin` que se crea automáticamente
  la primera vez que arranca con la base de datos vacía. **Si no la defines, no se
  crea ningún usuario admin** — no hay credencial hardcodeada por diseño.
- `CORS_ORIGINS` (opcional, por defecto `http://localhost:3001`): orígenes permitidos, separados por coma.
- `NODE_ENV` / `ENABLE_SWAGGER` (opcional): en `production`, Swagger se desactiva a menos que `ENABLE_SWAGGER=true`.

### Frontend (`erp-tienda-frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL="http://localhost:3000"
```

Variable usada en frontend:

- `NEXT_PUBLIC_API_URL`

## Instalacion

Instala dependencias en cada proyecto:

```bash
cd erp-tienda-backend
npm install

cd ../erp-tienda-frontend
npm install
```

## Desarrollo Local

Abre dos terminales.

### 1) Backend

```bash
cd erp-tienda-backend
npm run start:dev
```

Backend por defecto en `http://localhost:3000`.
Swagger en `http://localhost:3000/api`.

### 2) Frontend

```bash
cd erp-tienda-frontend
npm run dev
```

Frontend por defecto en `http://localhost:3001`.

## Scripts Utiles

### Backend

```bash
npm run start:dev    # desarrollo
npm run build        # build de produccion
npm run start:prod   # ejecutar build
npm run test         # unit tests
npm run test:e2e     # e2e tests
npm run lint         # lint
```

### Frontend

```bash
npm run dev          # desarrollo
npm run build        # build de produccion
npm run start        # ejecutar build
npm run lint         # lint
```

## Base de Datos y Prisma

⚠️ **Este proyecto todavía no usa migraciones de Prisma** (decisión deliberada
mientras está en desarrollo activo sin instancias de producción — ver
[`docs/decisions/0002-sin-migraciones-hasta-produccion.md`](docs/decisions/0002-sin-migraciones-hasta-produccion.md)).
El schema se sincroniza directamente contra la base de datos:

```bash
cd erp-tienda-backend
npx prisma generate
npx prisma db push
npx prisma db seed
```

### Postgres local con Docker (opcional, para desarrollo o para correr tests)

```bash
docker compose up -d postgres
```

Levanta un Postgres 16 en `localhost:5432` (usuario/contraseña `postgres`,
base `erp_tienda_dev`). Útil si no quieres depender de Supabase para
desarrollar localmente, y es lo que usan los tests e2e — ver
[`docs/operations/testing.md`](docs/operations/testing.md).

### Stack completo con Docker (Postgres + Backend + Frontend)

Si prefieres no instalar Node/Postgres localmente, el mismo `docker-compose.yml`
también levanta el backend y el frontend en contenedores, con hot-reload:

```bash
./scripts/docker-dev.sh start
# o: docker compose up
```

Ver [`DOCKER-QUICKSTART.md`](DOCKER-QUICKSTART.md) y
[`docs/DOCKER-DEVELOPMENT.md`](docs/DOCKER-DEVELOPMENT.md) para el detalle
(logs, shells, troubleshooting, y por qué el `.env` de la raíz es
independiente de los `.env` de `erp-tienda-backend/` y `erp-tienda-frontend/`).

## Notas

- CORS usa una allowlist explícita vía `CORS_ORIGINS` (ver arriba), no está abierto a cualquier origen.
- El frontend envia JWT en header `Authorization: Bearer <token>`.
- Swagger disponible en `http://localhost:3000/api` solo fuera de `NODE_ENV=production`
  (o si defines `ENABLE_SWAGGER=true`).

## Roadmap

El roadmap vigente, con el estado detallado de cada fase (qué está hecho, qué
falta y por qué), vive en
[`docs/roadmap/plan-fases.md`](docs/roadmap/plan-fases.md). CI (lint + test +
build en GitHub Actions, `.github/workflows/ci.yml`) y Docker para Postgres
local ya están en su lugar — pendiente a nivel de infraestructura:

- Incorporar versionado y changelog.

## Licencia

Uso interno / privado (ajustar segun necesidad del proyecto).
