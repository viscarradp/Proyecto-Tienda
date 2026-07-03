# Arquitectura — Visión General

## Qué es el sistema

Un ERP/POS a medida para una tienda de colonia (negocio de abarrotes): control
de inventario por lotes (FIFO), ventas con caja registradora, compras a
proveedores, gastos, y turnos de caja. El objetivo es que el dueño del negocio
sepa, sin ambigüedad, cuánto vendió, cuánto gastó y si es rentable — sin ser
una persona técnica.

## Motivación y alcance

El proyecto nació para resolver un problema concreto de un negocio familiar:
la gestión manual de una tienda de colonia propicia pérdida de trazabilidad
en el inventario (mermas no registradas), descuadres en el flujo de efectivo
(gaveta física) y falta de visibilidad sobre los márgenes de ganancia reales
por la fluctuación de costos de adquisición. El usuario final típico **no es
una persona técnica ni una empresaria** — es alguien que solo quiere llevar
su negocio de forma más fácil y saber si es rentable. Esto es la razón de la
regla de diseño "no sobreingeniería" que aparece en
[`../roadmap/plan-fases.md`](../roadmap/plan-fases.md): las soluciones deben
ser proporcionales a una tienda con 1-2 cajas, no a un escenario enterprise
o multi-tenant.

Alcance definido: catálogo de productos, control de caja (apertura/cierre,
ingresos/egresos), compras e inventario por lotes, ventas con descarga FIFO,
control de mermas, y autenticación con roles `ADMIN`/`CAJERO`.

**Fuera de alcance a propósito** (no son omisiones, son decisiones de
producto): módulos de Recursos Humanos, CRM complejo de clientes, cuentas por
cobrar a largo plazo, e integración con pasarelas de pago electrónico — el
enfoque actual es transaccional físico/efectivo (ver también
[`../domain/caja-y-ventas.md`](../domain/caja-y-ventas.md) sobre el supuesto
de que toda venta es en efectivo).

## Las dos aplicaciones

```
erp-tienda-backend/    API REST — NestJS 11 + Prisma 7 + PostgreSQL (Supabase)
erp-tienda-frontend/   UI — Next.js 16 (App Router) + React 19 + Zustand
```

Se despliegan por separado (frontend y backend en distintos servicios/hosts).
La comunicación es HTTP con JWT en el header `Authorization: Bearer`.

## Flujo de una petición (backend)

```
Cliente HTTP
   │
   ▼
ThrottlerGuard      ← límite de requests por IP (incluso en rutas @Public)
   │
   ▼
JwtAuthGuard         ← exige JWT válido, salvo rutas marcadas @Public()
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
`ajustes_inventario`, `ventas`, `cajas_turnos`, `caja_general`,
`movimientos_financieros`, `categorias_gastos`, `reportes`.

`prisma/` no es un módulo de negocio: expone `PrismaService`, un wrapper de
`PrismaClient` inyectable en cualquier servicio (es `@Global()`, no hace falta
importarlo en cada módulo).

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
autorización real la hace siempre el backend. Ver [`security.md`](../security.md) y
[`roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md).

## Ver también

- [`data-model.md`](data-model.md) — tablas y el motor FIFO de inventario.
- [`../domain/caja-y-ventas.md`](../domain/caja-y-ventas.md) — reglas de negocio.
- [`../security.md`](../security.md) — autenticación y hardening aplicado.
