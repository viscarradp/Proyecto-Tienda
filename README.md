# Proyecto Tienda - ERP Full Stack

Sistema ERP para tienda con enfoque en inventario, ventas, compras, caja y movimientos financieros.

## Overview

Este repositorio contiene dos aplicaciones principales:

- Backend API en NestJS + Prisma + PostgreSQL.
- Frontend web en Next.js (App Router) + React + Tailwind CSS.

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

### Backend (`erp-tienda-backend/.env`)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/erp_tienda"
JWT_SECRET="cambia-esto-en-produccion"
PORT=3000
```

Variables usadas en backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `PORT` (opcional, por defecto 3000)

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

En backend:

```bash
cd erp-tienda-backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

## Notas

- CORS esta habilitado en backend para desarrollo local.
- El frontend envia JWT en header `Authorization: Bearer <token>`.

## Roadmap Sugerido

- Agregar `docker-compose` para levantar todo con un comando.
- Agregar CI (lint + test + build) en GitHub Actions.
- Incorporar versionado y changelog.

## Licencia

Uso interno / privado (ajustar segun necesidad del proyecto).
