# Proyecto Tienda — ERP/POS para una tienda de colonia

Micro ERP/POS en efectivo para una tienda de colonia en El Salvador: ventas con caja, inventario por lotes (FIFO),
compras, gastos, bóveda y reportes para saber si el negocio es rentable. Principios: **apoyar, no imponer** (ante la
duda, registrar y avisar en vez de bloquear) y **no sobreingeniería**.

> 📖 **La documentación está en [`docs/`](docs/README.md)**: reglas de negocio por tema, arquitectura, decisiones (ADRs),
> operación y el [estado del proyecto y qué sigue](docs/roadmap/plan-fases.md). Este README es la guía rápida para
> instalar y arrancar.

**Producción:** backend en Render, frontend en Vercel y base en Supabase; los dos se despliegan solos con cada push a
`master` ([`docs/operations/deployment.md`](docs/operations/deployment.md)). Antes de la primera venta real quedan
pasos manuales: [`plan-fases.md`](docs/roadmap/plan-fases.md#antes-de-la-primera-venta-real).

## Stack

- **Backend** (`erp-tienda-backend`): NestJS 11 + Prisma 7 + PostgreSQL, JWT + Passport, Swagger opcional.
- **Frontend** (`erp-tienda-frontend`): Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + Zustand + shadcn/ui.

## Qué hace

- Usuarios con dos roles: `ADMIN` (la dueña) y `CAJERO`; se desactivan, no se borran.
- Productos con presentaciones (factor decimal, historial de precios) y **alta rápida** desde el mostrador.
- Compras e inventario por lotes (FIFO), **deuda de stock** al vender sin stock registrado, mermas y conteos.
- **Ventas** por cantidad o por monto (idempotentes), anulaciones y devoluciones.
- Turnos de caja ("Gaveta"), movimientos de dinero origen→destino y **bóveda** con arqueo.
- Compras a crédito y abonos a proveedores.
- **Reportes:** estado de resultados, patrimonio, flujo de efectivo y productos, por día en la zona horaria de la tienda.
- **Bot de Telegram** para que la dueña registre compras con un mensaje o la foto de la factura.

## Requisitos

- Node.js 22 y npm.
- PostgreSQL: con Docker, `docker compose up -d postgres`.

## Configuración

Cada app trae su `.env.example`: cópialo a `.env` (backend) o `.env.local` (frontend). Lo mínimo para desarrollo:
`DATABASE_URL`, `JWT_SECRET` e `INITIAL_ADMIN_PASSWORD` (sin esta última no se crea el usuario `admin`). Todas las
variables: [`docs/operations/configuration.md`](docs/operations/configuration.md).

## Desarrollo local

```bash
cd erp-tienda-backend  && npm install
cd ../erp-tienda-frontend && npm install
```

Dos terminales:

```bash
cd erp-tienda-backend  && npm run start:dev   # API en http://localhost:3000 (Swagger en /api con NODE_ENV=development)
cd erp-tienda-frontend && npm run dev         # web en http://localhost:3001
```

Esquema de la base (no hay migraciones, [ADR 0002](docs/decisions/0002-sin-migraciones-hasta-produccion.md)):

```bash
cd erp-tienda-backend
npx prisma generate
npx prisma db push
npx prisma db seed     # opcional: catálogos base, no crea usuarios
```

Todo en contenedores, con recarga en vivo: `./scripts/docker-dev.sh start`
([`docs/operations/docker-development.md`](docs/operations/docker-development.md)).

### Probar desde el celular (misma red Wi-Fi)

1. Levanta backend y frontend como siempre.
2. En el celular, abre `http://<IP-de-la-laptop>:3001`. La IP se ve con `ipconfig` en Windows (la "Dirección IPv4" del
   Wi-Fi).
3. Si Windows pregunta por el firewall, permite Node.js en redes **privadas**.

Por HTTP la sesión no usa cookie `Secure` (el navegador la descartaría); en producción, con HTTPS, sí.

## Tests y calidad

```bash
# Backend
npm run test                          # unitarios
npm run test:e2e                      # e2e: BORRA la base de DATABASE_URL, usa una propia
npm run lint:check && npx nest build

# Frontend
npm run lint && npm run build
```

Antes de correr los e2e lee [`docs/operations/testing.md`](docs/operations/testing.md). La CI
(`.github/workflows/ci.yml`) corre lint, build, unitarios y e2e en cada push.

## Estructura del repositorio

```text
.
├── erp-tienda-backend/    API (NestJS + Prisma)
├── erp-tienda-frontend/   Interfaz (Next.js)
├── scripts/               Docker de desarrollo, respaldo y restauración, laptop del punto de venta (pos/)
├── docs/                  Documentación
└── docker-compose.yml     Postgres local (y el stack completo para desarrollo)
```

## Licencia

Uso interno / privado.
