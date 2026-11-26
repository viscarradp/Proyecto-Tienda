# Arquitectura — Visión General

## Qué es el sistema

Un ERP/POS a medida para una tienda de colonia (negocio de abarrotes): control
de inventario por lotes (FIFO), ventas con caja registradora, compras a
proveedores, gastos, y turnos de caja. El objetivo es que el dueño del negocio
sepa, sin ambigüedad, cuánto vendió, cuánto gastó y si es rentable — sin ser
una persona técnica.

## Alcance

La usuaria final no es técnica ni empresaria: las soluciones deben ser proporcionales a una tienda con 1-2 cajas, no a
un escenario enterprise o multi-tenant (ver [`../roadmap/plan-fases.md`](../roadmap/plan-fases.md)). Principio rector:
**apoyar, no imponer** — ante la duda se registra y se avisa, no se bloquea
([ADR 0011](../decisions/0011-registrar-y-avisar.md)).

- **Incluye:** catálogo de productos, caja (turnos, ingresos/egresos, bóveda y arqueo), compras e inventario por lotes
  (con compra a crédito y pago de deudas a proveedores), ventas por cantidad o por monto con descarga FIFO (y venta sin
  stock con "deuda de stock"), devoluciones, mermas, reportes (estado de resultados, patrimonio, flujo de efectivo),
  bot de Telegram para registrar compras y autenticación con roles `ADMIN`/`CAJERO`.
- **Fuera de alcance a propósito:** recursos humanos, CRM, fiado a clientes (cuentas por cobrar) y pasarelas de pago
  electrónico: toda venta es en efectivo (ver [`../domain/caja-y-ventas.md`](../domain/caja-y-ventas.md)).

## Las dos aplicaciones

```
erp-tienda-backend/    API REST — NestJS 11 + Prisma 7 + PostgreSQL (Supabase)
erp-tienda-frontend/   UI — Next.js 16 (App Router) + React 19 + Zustand
```

Se despliegan por separado: el backend en Render, el frontend en Vercel y la base en Supabase
([`../operations/deployment.md`](../operations/deployment.md)).
La comunicación es HTTP con JWT en el header `Authorization: Bearer`.

## Flujo de una petición (backend)

```
Cliente HTTP
   │
   ▼
ThrottlerGuard      ← límite de requests por IP (incluso en rutas @Public)
   │
   ▼
JwtAuthGuard         ← exige JWT válido, salvo rutas marcadas @Public(); JwtStrategy
   │                    consulta la BD en cada request (usuario existente, activo, rol vigente)
   │
   ▼
RolesGuard           ← exige un rol de @Roles(...) si el endpoint lo pide
   │
   ▼
Controller           ← recibe el request, delega al Service
   │
   ▼
Service               ← lógica de negocio, usa PrismaService (this.prisma.$transaction)
   │
   ▼
PrismaService (@prisma/adapter-pg) → PostgreSQL (Supabase)
```

Los tres guards son **globales** (`APP_GUARD` en `app.module.ts`): por defecto
todo endpoint nuevo requiere JWT válido. Para hacer una ruta pública hay que
marcarla explícitamente con `@Public()`. Esto es intencional — "seguro por
defecto".

## Módulos del backend

Un módulo de NestJS por entidad de negocio, cada uno con
`*.controller.ts` (rutas HTTP), `*.service.ts` (lógica + acceso a datos vía
Prisma) y `dto/` (validación de entrada con `class-validator`):

`auth`, `usuarios`, `categorias`, `productos`, `presentaciones`, `compras`,
`cuentas_por_pagar` (deudas con proveedores y abonos), `ajustes_inventario`,
`ventas` (incluye devoluciones), `cajas_turnos`, `caja_general` (la bóveda:
saldo derivado, inyección y arqueo — ya no es una tabla), `movimientos_financieros`,
`categorias_gastos`, `reportes`, `salud`, `bot`.

`salud` expone `GET /salud` (público, `SELECT 1`, sin rate-limit) como health
check del proveedor de despliegue — ver
[`../operations/deployment.md`](../operations/deployment.md).

`bot` es el chat para registrar compras: un núcleo (`bot/nucleo`: interpretación con un modelo de OpenRouter y
borradores de compra) y el canal de Telegram (`bot/telegram`: modo `polling` o `webhook`). Expone la ruta pública
`POST /telegram/webhook`, protegida por un secreto en el encabezado (ver [`security.md`](security.md)). Reglas y
funcionamiento: [`../domain/bot.md`](../domain/bot.md).

`prisma/` no es un módulo de negocio: expone `PrismaService`, un wrapper de
`PrismaClient` inyectable en cualquier servicio (es `@Global()`, no hace falta
importarlo en cada módulo). `src/common/` agrupa lo compartido: orden de locks
(`concurrency.ts`), cuentas de efectivo y saldo de bóveda, avisos de la política
"registrar y avisar", redondeo, deuda de stock (`pendientes-stock.ts`), zona
horaria del negocio, permisos por rol, validadores de DTO y el filtro de
excepciones de Prisma.

## Convenciones transversales

- **Concurrencia:** bloqueo pesimista con orden fijo **turno → venta → lotes →
  pendientes** (y el lock de bóveda después del turno). Siempre se bloquea antes de
  insertar filas que referencien la fila bloqueada ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
- **Transacciones:** `TX_OPTIONS` (timeout 15 s, espera de conexión 5 s) en las
  transacciones largas; el default de Prisma (5 s) se quedaba corto contra Supabase.
- **Dinero y cantidades:** `Decimal` (nunca floats); dinero a 2 decimales con
  redondeo mitad hacia arriba **por línea** antes de sumar; cantidades a 3 decimales.
  Los DTO acotan los rangos (un número enorme da 400, no un 500).
- **Avisos en la respuesta:** las operaciones que "registran y avisan" devuelven
  `avisos: string[]` junto al recurso creado.
- **Zona horaria del negocio:** se guarda UTC; los reportes agrupan por día en
  `ZONA_HORARIA_NEGOCIO` (default `America/El_Salvador`).
- **Pool de conexiones:** `DB_POOL_MAX` por instancia; ver
  [`../operations/configuration.md`](../operations/configuration.md).

## Frontend

Next.js con App Router. **Todas las páginas del dashboard son Client
Components** (`'use client'`): el fetch de datos ocurre en el navegador vía
`lib/api.ts` (`apiFetch`), que inyecta el JWT desde una cookie en cada
petición. El estado compartido entre componentes (carrito de venta, caché de
inventario) vive en dos stores de Zustand (`src/store/`).

`proxy.ts` (raíz del proyecto — en Next.js 16 reemplaza a `middleware.ts`)
protege `/dashboard/*` a nivel de servidor: verifica que exista el JWT y que
no esté obviamente vencido antes de renderizar cualquier página del
dashboard. Es una verificación liviana (no valida la firma criptográfica) —
ver [`../decisions/0007-proxy-verificacion-liviana.md`](../decisions/0007-proxy-verificacion-liviana.md).
El filtrado de botones/menús por rol en la UI sigue siendo solo visual; la
autorización real la hace siempre el backend. Ver [`security.md`](security.md) y
[`roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md).

## Ver también

- [`data-model.md`](data-model.md) — tablas y el motor FIFO de inventario.
- [`../domain/caja-y-ventas.md`](../domain/caja-y-ventas.md) — índice de las reglas de negocio por tema.
- [`security.md`](security.md) — autenticación y hardening aplicado.
