# Especificaciones — Bloque 2 (Confianza en los números)

> **Estado:** Borrador para revisión conjunta · **Fecha:** 2026-07-05 · **Rama:** `feature/bloque2-confianza-numeros`
>
> Continúa el trabajo de [`00-especificaciones.md`](00-especificaciones.md) (Bloque 1).
> Origen: [auditoría de negocio/contable](../auditorias/2026-07-04-auditoria-negocio-contable.md) §10, **Bloque 2**.
> El avance se registra en [`02-bitacora.md`](02-bitacora.md).

## 1. Propósito

El Bloque 1 arregló el **modelo** del efectivo. El Bloque 2 son los ítems que **no
tocan el modelo pero condicionan la confianza en los números** antes del go-live:
que la utilidad no mienta (faltantes), que la bóveda sea verificable (arqueo), que
el cierre no moleste por centavos pero sí capture descuadres reales (umbral), y que
el inventario se pueda corregir hacia arriba (conteo físico).

## 2. Decisiones tomadas

- **Umbral de tolerancia del cierre:** **$1.00** (configurable por env
  `TOLERANCIA_DESCUADRE`). Debajo → ajuste automático sin fricción; desde $1.00 →
  justificación obligatoria. La diferencia **siempre** se registra.
- **Backup (ítem 11): DIFERIDO** hasta que se decida hosting/almacenamiento y haya
  secrets. Se documenta como pendiente; no se escribe un workflow que no se puede
  probar en este entorno.

## 3. Alcance por ítem

### Ítem 8 — Faltantes/sobrantes al P&L + merma sin turno (§4)
- **`reportes.getEstadoResultados`**: la utilidad neta resta faltantes y suma
  sobrantes (de caja y de bóveda): `utilidad_neta = utilidad_bruta − gastos − mermas
  − faltantes + sobrantes`. Se exponen `faltantes` y `sobrantes` como métricas.
- **`ajustes_inventario.service`**: quitar la dependencia `if (cajaActiva)` — la
  merma **siempre** registra su movimiento `MERMA_INVENTARIO` (`caja_turno_id`
  nullable ya lo permite), aunque no haya turno.
- **Frontend**: Estadísticas muestra "Faltantes/sobrantes de caja" del período.

### Ítem 9 — Arqueo de bóveda (§3 fuga D, parte restante)
- **`POST /caja-general/arqueo`** (ADMIN) `{ saldo_declarado, justificacion? }`:
  compara el saldo **declarado** (conteo físico de la bóveda) contra el **derivado**;
  si difieren, registra `AJUSTE_BOVEDA_FALTANTE` (BOVEDA→GASTO) o
  `AJUSTE_BOVEDA_SOBRANTE` (GASTO→BOVEDA) por la diferencia, dejando el derivado igual
  al físico. Umbral de justificación como en el cierre. Advisory lock de bóveda.
- **Frontend**: acción "Arqueo de bóveda" en Estadísticas (junto al saldo de bóveda).

### Ítem 10 — Umbral de tolerancia + cierre forzado ADMIN (§7)
- **`cerrar`**: la diferencia (conteo físico − esperado) **siempre** se registra si
  ≠ 0. Si `|diferencia| ≥ TOLERANCIA` y no hay `observaciones` → 400 (justificación
  obligatoria). Debajo del umbral: ajuste automático, sin exigir nota.
- **Cierre forzado**: `PATCH /cajas-turnos/:id/cerrar-forzado` (solo ADMIN) para el
  turno que la cajera dejó abierto: el ADMIN declara el efectivo contado + una
  justificación obligatoria; el turno queda `estado = 'CERRADA_FORZADA'` (mismo
  cálculo de descuadre/traslado que el cierre normal). `estado` es `VarChar` → sin
  cambio de schema.
- **Frontend**: el cierre del POS exige justificación sobre el umbral; los ADMIN
  pueden forzar el cierre de un turno abierto desde Movimientos.

### Ítem 12 — Ajustes positivos de inventario / conteo físico (§6)
- **`ajustes_inventario.service`**: soportar ajustes **positivos** (encontrar stock /
  conteo hacia arriba). Nuevo `tipo_ajuste = 'CONTEO_SOBRANTE'` que **incrementa**
  `cantidad_disponible` del lote (valorado a su propio costo). No genera un movimiento
  de P&L (el stock reingresa al inventario; el costo FIFO fluye al venderse).
- **Frontend**: el diálogo de ajuste permite elegir dirección (quitar / agregar).

## 4. Restricciones (heredadas del Bloque 1)

- Sin migraciones Prisma (`db push`); el push a Supabase real es paso manual del usuario.
- Concurrencia: `FOR UPDATE`/advisory locks y orden lock-antes-de-INSERT (ADR 0001).
- Git: rama `feature/bloque2-confianza-numeros`, merge `--no-ff` a `master` por sub-fase.
- Tests e2e por cada invariante nuevo.

## 5. Fuera de alcance

- **Ítem 11 (backup + hosting)**: diferido (necesita decisión de nube + secrets).
- Bloque 3 completo (devoluciones post-turno, modo contingencia, endpoint de
  patrimonio, historial de precios, inmutabilidad a nivel BD, depreciación, DTE,
  multi-tienda) y el meta-hallazgo (SRS v3.0).

## 6. Criterios de aceptación

1. La utilidad neta refleja faltantes (resta) y sobrantes (suma).
2. La merma se registra aunque no haya turno abierto.
3. Un arqueo de bóveda con diferencia deja el saldo derivado = físico y registra el ajuste.
4. Cerrar con descuadre ≥ $1.00 sin justificación se rechaza; por debajo se ajusta solo.
5. Un ADMIN puede forzar el cierre de un turno abandonado (`CERRADA_FORZADA`).
6. Un ajuste positivo incrementa el stock del lote.
7. `build`+`lint`+e2e verdes; la app frontend sigue funcional.
