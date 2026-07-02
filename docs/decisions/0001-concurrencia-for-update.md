# 0001 — Concurrencia: bloqueo pesimista (FOR UPDATE / advisory lock)

**Estado:** Aceptado · **Fecha:** 2026-07 (Fase 0 de endurecimiento)

## Contexto

La auditoría técnica (`AUDITORIA-TECNICA.md`, hallazgos H1/H2/H7) encontró que
varias operaciones financieras/de inventario seguían el patrón "leer, decidir,
escribir" sin ningún bloqueo:

- El motor FIFO de ventas leía `cantidad_disponible` de los lotes, decidía
  cuánto descontar, y luego escribía — sin bloquear las filas leídas.
- Los egresos (compras, movimientos financieros) leían `efectivo_esperado`,
  validaban fondos suficientes, y luego decrementaban — sin bloquear la fila.
- Abrir un turno de caja validaba "no hay otro turno ABIERTA" y luego creaba
  uno — sin ninguna exclusión mutua entre dos aperturas concurrentes.

Bajo el nivel de aislamiento por defecto de PostgreSQL (Read Committed, que es
también el default de Prisma), dos transacciones concurrentes pueden leer el
mismo estado y ambas pasar la validación, produciendo:

- Sobreventa (stock negativo).
- Sobregiro de caja (`efectivo_esperado` negativo).
- Dos turnos `ABIERTA` simultáneos.
- Doble ajuste financiero por un doble cierre de turno.

## Decisión

Usar **bloqueo pesimista**, eligiendo la herramienta según el tipo de
invariante:

1. **`SELECT ... FOR UPDATE`** cuando la invariante corresponde a una o más
   filas concretas que se pueden identificar y bloquear (ej. los lotes de un
   producto, la fila de un turno de caja por `id` o por `estado = 'ABIERTA'`).
   Una segunda transacción que intente leer esas mismas filas espera hasta
   que la primera haga `COMMIT`/`ROLLBACK`, y entonces lee el estado ya
   actualizado.

2. **`pg_advisory_xact_lock(hashtext(clave)::bigint)`** (advisory lock
   transaccional) cuando la invariante **no** corresponde a una fila
   existente que bloquear — por ejemplo, "que no exista ya un turno
   `ABIERTA`" (antes de crearlo no hay fila que bloquear) o el saldo de
   `caja_general` (se calcula con `SUM()` sobre toda la tabla, no es el
   valor de una fila). El lock se libera automáticamente al terminar la
   transacción.

Implementado en `erp-tienda-backend/src/common/concurrency.ts`
(`CajaTurnoRow`, `LoteInventarioRow`, `acquireAdvisoryLock`) y usado en:

| Archivo | Función | Mecanismo |
|---|---|---|
| `ventas/ventas.service.ts` | `create()` (FIFO) | `FOR UPDATE` sobre lotes candidatos |
| `ventas/ventas.service.ts` | `anular()` | `FOR UPDATE` sobre el turno de caja |
| `compras/compras.service.ts` | `create()` (CAJA_POS) | `FOR UPDATE` sobre el turno abierto |
| `compras/compras.service.ts` | `create()` (CAJA_GENERAL) | advisory lock (`caja_general_ledger`) |
| `movimientos_financieros/movimientos_financieros.service.ts` | `create()` (egresos) | `FOR UPDATE` sobre el turno |
| `cajas_turnos/cajas_turnos.service.ts` | `abrir()` | advisory lock (`caja_turno_abrir`) |
| `cajas_turnos/cajas_turnos.service.ts` | `cerrar()` | `FOR UPDATE` sobre el turno |

## Alternativas consideradas

- **Aislamiento `Serializable` + reintento**: más "Prisma-native" (sin SQL
  crudo), pero añade lógica de reintento en cada operación y más abortos de
  transacción bajo contención. Se descartó por complejidad adicional sin
  beneficio claro a esta escala (una tienda con 1-2 cajas concurrentes).
- **Actualización condicional (optimista)**: `updateMany` con
  `WHERE cantidad_disponible >= n` y verificar `count`. Libre de bloqueos,
  pero exige un bucle de reintento más intrincado en el motor FIFO (que ya
  itera lote por lote). Se descartó por complejidad desproporcionada al
  beneficio a esta escala.
- **No hacer nada**: descartado — es exactamente el riesgo que motivó esta
  decisión (integridad de dinero/inventario).

## Consecuencias

- Los locks viven en PostgreSQL, no en memoria del proceso Node — la
  solución **escala correctamente** si el backend corre en múltiples
  instancias (a diferencia de un mutex en memoria).
- Bajo contención alta, algunas transacciones esperan brevemente en vez de
  fallar o corromper datos — es el trade-off correcto para este dominio
  (correctitud de dinero/stock por encima de latencia).
- No requiere ninguna migración de base de datos — funciona con el schema
  actual. Las constraints de BD equivalentes (`CHECK`, índice único parcial)
  quedan documentadas como trabajo futuro para producción — ver
  [`0002-sin-migraciones-hasta-produccion.md`](0002-sin-migraciones-hasta-produccion.md)
  y [`../roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md).
