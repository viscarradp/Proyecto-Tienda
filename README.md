# Proyecto Tienda — ERP/POS para una tienda de colonia

Micro ERP/POS en efectivo para una tienda de colonia en El Salvador: ventas con caja, inventario por lotes (FIFO),
compras, gastos, bóveda y reportes para saber si el negocio es rentable. Principios: **apoyar, no imponer** (ante la duda,
registrar y avisar en vez de bloquear) y **no sobreingeniería**.

> 📖 **Toda la documentación está en [`docs/`](docs/README.md)** (índice "si quieres… ve a…"): reglas de negocio por tema,
> arquitectura, seguridad, decisiones (ADRs), operación y el [plan de trabajo con su estado actual](docs/roadmap/plan-fases.md).
> Este README es solo la guía rápida para instalar y arrancar. **Antes de la primera venta real** hay pasos manuales
> (esquema en Supabase, respaldo, ensayo de restauración): [`docs/roadmap/plan-fases.md`](docs/roadmap/plan-fases.md#antes-de-la-primera-venta-real).

## Stack

- **Backend** (`erp-tienda-backend`): NestJS 11 + Prisma 7 + PostgreSQL (compatible con Supabase), JWT + Passport, Swagger (opt-in).
- **Frontend** (`erp-tienda-frontend`): Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + Zustand + shadcn/ui.

## Módulos del backend

- Autenticación, **usuarios** (roles `ADMIN` = la dueña y `CAJERO`; se desactivan, no se borran) y permisos.
- Productos, presentaciones (factor decimal, historial de precios) y categorías; **alta rápida** de la cajera.
- Compras e inventario por lotes (FIFO), **deuda de stock** al vender sin stock, ajustes de inventario (mermas y conteos).
- **Ventas** (por cantidad o por monto, idempotentes), anulaciones y **devoluciones**.
- Turnos de caja, **movimientos financieros** (modelo origen→destino) y **caja general (bóveda)** con arqueo.
- **Cuentas por pagar**: compras a crédito y abonos a proveedores.
- **Reportes**: estado de resultados, patrimonio, flujo de efectivo, productos top y margen (por día en la zona horaria de la tienda).
- **Salud**: `GET /salud`, el health check del despliegue.

## Requisitos

- Node.js 20+ y npm 10+
- PostgreSQL (o una URL de Supabase) — con Docker: `docker compose up -d postgres`

## Configuración

Cada app trae su `.env.example` (`erp-tienda-backend/.env.example`, `erp-tienda-frontend/.env.example`): cópialo a `.env`
(backend) o `.env.local` (frontend). Lo mínimo para desarrollo: `DATABASE_URL`, `JWT_SECRET` e `INITIAL_ADMIN_PASSWORD`
(sin esta última no se crea el usuario `admin`). **Todas las variables** (producción, `CORS_ORIGINS`, `TRUST_PROXY`,
`DB_POOL_MAX`, `ZONA_HORARIA_NEGOCIO`, `TOLERANCIA_DESCUADRE`, respaldo…) están en
[`docs/operations/configuration.md`](docs/operations/configuration.md).

## Instalación y desarrollo local

```bash
cd erp-tienda-backend  && npm install
cd ../erp-tienda-frontend && npm install
```

Dos terminales:

```bash
cd erp-tienda-backend  && npm run start:dev   # API en http://localhost:3000 (Swagger en /api con NODE_ENV=development)
cd erp-tienda-frontend && npm run dev         # web en http://localhost:3001
```

Stack completo en contenedores, con hot-reload: `./scripts/docker-dev.sh start` — ver
[`DOCKER-QUICKSTART.md`](DOCKER-QUICKSTART.md) y [`docs/operations/docker-development.md`](docs/operations/docker-development.md).

### Probar desde el celular (misma red Wi-Fi)

1. Levanta backend y frontend como siempre.
2. En el celular, abre `http://<IP-de-la-laptop>:3001`. La IP se ve con `ipconfig` en Windows (la "Dirección IPv4" del Wi-Fi).
3. Si Windows pregunta por el firewall, permite Node.js en redes **privadas**.

Por HTTP la sesión no usa cookie `Secure` (si no, el navegador la descartaría); en producción, con HTTPS, sí la usa.

## Base de datos

Todavía **no hay migraciones de Prisma** (decisión deliberada, [ADR 0002](docs/decisions/0002-sin-migraciones-hasta-produccion.md)):
el schema se sincroniza con `db push`.

```bash
cd erp-tienda-backend
npx prisma generate
npx prisma db push
npx prisma db seed     # opcional: catálogos base, no crea usuarios
```

## Tests y calidad

```bash
# Backend (erp-tienda-backend)
npm run test          # unitarios, sin base de datos
npm run test:e2e      # e2e contra Postgres real — BORRA y recrea el schema de DATABASE_URL
npm run lint:check && npx nest build

# Frontend (erp-tienda-frontend)
npm run lint && npm run build
```

⚠️ `npm run test:e2e` resetea la base apuntada por `DATABASE_URL`: usa **una base propia para los tests** (p. ej.
`erp_tienda_e2e`) y nunca una con datos reales. Si lo corre un agente de IA, Prisma 7 exige el consentimiento explícito del
usuario para `db push --force-reset`. Detalle en [`docs/operations/testing.md`](docs/operations/testing.md). CI
(`.github/workflows/ci.yml`) corre lint, build, unitarios y e2e en cada push.

## Despliegue y respaldos

- Imágenes de producción (`Dockerfile`), `/salud`, `TRUST_PROXY` y aplicar el esquema: [`docs/operations/deployment.md`](docs/operations/deployment.md).
- Respaldo nocturno cifrado de la base y ensayo de restauración: [`docs/operations/respaldos.md`](docs/operations/respaldos.md).

## Estructura del repositorio

```text
.
├── erp-tienda-backend/    API (NestJS + Prisma)
├── erp-tienda-frontend/   Interfaz (Next.js)
├── scripts/               Docker de desarrollo, respaldo y restauración
├── docs/                  Documentación (fuente de verdad)
└── docker-compose.yml     Postgres local (y el stack completo para desarrollo)
```

## Licencia

Uso interno / privado.
