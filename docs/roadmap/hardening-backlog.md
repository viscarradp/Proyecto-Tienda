# Deuda técnica diferida a propósito

Lo que se dejó fuera a conciencia, para que no se olvide: **por qué** se difirió y **cuándo** retomarlo. Los IDs `H…`
son de la [auditoría técnica](../auditorias/2026-07-02-auditoria-tecnica.md). El estado general está en
[`plan-fases.md`](plan-fases.md).

## Al adoptar migraciones (decisión abierta)

Hoy hay producción sin migraciones ([ADR 0013](../decisions/0013-produccion-render-vercel-supabase.md)). Estos ítems van
juntos, en la migración base.

### 1. Migraciones de Prisma versionadas

**Por qué se difirió:** iterar el esquema rápido mientras el sistema no tenía datos reales
([ADR 0002](../decisions/0002-sin-migraciones-hasta-produccion.md)).
**Cómo:** `prisma migrate diff` + `migrate resolve --applied` para fijar la base desde el estado actual de Supabase; de
ahí en adelante, todo cambio pasa por `migrate dev` / `migrate deploy`.

### 2. Constraints de base de datos como defensa en profundidad

**Por qué se difirió:** las invariantes ya las garantiza la aplicación ([ADR 0001](../decisions/0001-concurrencia-for-update.md));
aplicarlas sin migraciones crearía diferencias entre el esquema versionado y la base real.

```sql
-- Nunca stock negativo, ni siquiera por un bug futuro que se salte el lock de la aplicación.
ALTER TABLE lotes_inventario
  ADD CONSTRAINT chk_cantidad_disponible_no_negativa CHECK (cantidad_disponible >= 0);

-- Solo un turno ABIERTA a la vez, garantizado por la base (hoy solo por advisory lock).
CREATE UNIQUE INDEX ux_cajas_turnos_una_abierta
  ON cajas_turnos (estado) WHERE estado = 'ABIERTA';
```

> Antes de aplicar el primer `CHECK`, confirmar que sigue siendo cierto: desde el ciclo 2026-11 se puede vender sin stock
> registrado, pero eso crea una deuda de stock (`pendientes_stock`), no lotes en negativo.

### 3. Tablas de libro inmutables a nivel de base

**Por qué se difirió:** es un `REVOKE` sobre un rol de aplicación propio, que todavía no existe (hoy el backend entra como
dueño de las tablas). En la aplicación estas tablas ya son de solo inserción. Aplicarlo solo a las tablas de libro de
verdad inmutables — **no** a `ventas`, `cajas_turnos`, `lotes_inventario`, `movimientos_financieros`,
`compras_inventario` ni `ajustes_inventario`, que la aplicación actualiza legítimamente (anular, cerrar, FIFO, anular sin
borrar del [ADR 0012](../decisions/0012-anular-sin-borrar.md)):

```sql
REVOKE UPDATE, DELETE ON detalle_venta_lotes              FROM app_role;
REVOKE UPDATE, DELETE ON detalle_devoluciones             FROM app_role;
REVOKE UPDATE, DELETE ON historial_precios_presentaciones FROM app_role;
```

### 4. Enums en el esquema para los campos de estado

`ventas.estado`, `cajas_turnos.estado`, `usuarios.rol`, etc. son `String` validados solo por los DTOs (`@IsIn`).

## Seguridad

### 5. Cookie del JWT `httpOnly`

**Por qué se difirió:** hoy la cookie la pone el frontend (`js-cookie`), que no puede marcarla `httpOnly`; pasarla al
backend cambia el contrato de autenticación. Ya lleva `Secure` (con HTTPS) y `SameSite=Lax`
([ADR 0008](../decisions/0008-cookie-flags.md)). Lo que falta mitiga el robo del token por XSS.
**Cuándo:** al revisar la autenticación cliente-servidor.

## Escalabilidad (solo si hace falta)

### 6. Store compartido (Redis) para el rate-limit

**Por qué se difirió:** el backend corre en una sola instancia; Redis sería infraestructura sin uso.
**Cuándo:** si el backend pasa a más de una instancia, porque el conteo en memoria dejaría de ser compartido.

### 7. Server Components (H13)

Todas las páginas del panel son Client Components con fetch en el navegador. Aprovechar RSC es rediseñar la carga de
datos de cada pantalla: un proyecto propio, no un ajuste. Solo si el rendimiento en la tienda lo pide.
