# Modelo de Efectivo y Trazabilidad — Bloque 1

Remediación del modelo de flujo de efectivo del ERP (Bloque 1 de la
[auditoría de negocio/contable 2026-07-04](../auditorias/2026-07-04-auditoria-negocio-contable.md)).
Fuente de verdad de este trabajo.

## Índice

| Documento | Para qué |
|---|---|
| [`00-especificaciones.md`](00-especificaciones.md) | **Specs.** Diagnóstico (F1-F7), diseño origen→destino, y spec por ítem. ⭐ empieza aquí. |
| [`01-plan-implementacion.md`](01-plan-implementacion.md) | **Plan.** 6 sub-fases (1.A–1.F), tareas y criterios de aceptación. |
| [`02-bitacora.md`](02-bitacora.md) | **Bitácora.** Estado y avance real. |

## Contexto rápido

- **Objetivo:** cerrar el modelo de efectivo **antes de la primera venta real** (BD vacía = cambios baratos).
- **Causa raíz:** movimientos de efectivo sin origen/destino → 4 fugas. Fix: catálogo cerrado `GAVETA, BOVEDA, DUEÑOS, GASTO, PROVEEDOR`.
- **Decisiones:** fraccionados = SÍ (Decimal); alcance = backend + frontend; bóveda derivada del libro.
- **Rama:** `feature/bloque1-modelo-contable` (merge `--no-ff` a `master` por sub-fase).
- **Regla:** sin migraciones Prisma (`db push`); el push a Supabase real es paso manual del usuario.
