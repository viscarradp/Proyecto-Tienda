# erp-tienda-backend

API del ERP de la tienda: NestJS 11 + Prisma 7 (`@prisma/adapter-pg`) + PostgreSQL. La guía general (instalación,
configuración, despliegue) está en el [README de la raíz](../README.md) y en [`../docs/`](../docs/README.md).

## Comandos

```bash
npm install
npm run start:dev     # API en http://localhost:3000 (Swagger en /api con NODE_ENV=development)
npm run build         # prisma generate + nest build
npm run start:prod    # node dist/src/main.js

npm run test          # unitarios, sin base de datos
npm run test:e2e      # e2e contra Postgres real: BORRA y recrea el esquema de DATABASE_URL
npm run lint:check    # lint sin tocar archivos (el de CI)
npm run lint          # lint con --fix: puede modificar archivos que no cambiaste
```

- Los e2e necesitan una base propia y desechable; lee [`../docs/operations/testing.md`](../docs/operations/testing.md)
  antes de correrlos.
- No uses `npm run format` sobre todo el proyecto: formatea solo los archivos que tocaste
  (`npx prettier --write <archivos>`).
- Esquema: no hay migraciones ([ADR 0002](../docs/decisions/0002-sin-migraciones-hasta-produccion.md)); en local,
  `npx prisma db push`. Para producción, ver [`../docs/operations/deployment.md`](../docs/operations/deployment.md).

## Estructura

```text
src/
├── auth/, usuarios/                 Login con JWT, roles ADMIN (la dueña) y CAJERO, usuarios desactivables
├── productos/, presentaciones/, categorias/
├── compras/, ajustes_inventario/    Inventario por lotes (FIFO), mermas y conteos
├── ventas/                          Ventas, anulaciones y devoluciones
├── cajas_turnos/                    Apertura y cierre de la gaveta
├── movimientos_financieros/, caja_general/, categorias_gastos/, cuentas_por_pagar/
├── reportes/                        Estado de resultados, patrimonio, flujo, productos
├── bot/                             Bot de Telegram para registrar compras (núcleo + adaptador)
├── salud/                           GET /salud para el health check
├── common/                          Locks, transacciones, filtros de errores, configuración de producción
└── prisma/                          PrismaService
prisma/schema.prisma                 Esquema de la base (fuente de verdad de las tablas)
test/                                e2e (Jest + Supertest contra Postgres real)
```

Las reglas de negocio de cada módulo están en [`../docs/domain/`](../docs/domain/caja-y-ventas.md) y el modelo de
datos en [`../docs/architecture/data-model.md`](../docs/architecture/data-model.md).
