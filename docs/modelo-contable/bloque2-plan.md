# Plan de Implementación — Bloque 2

> **Estado:** Borrador · **Fecha:** 2026-07-05 · **Rama:** `feature/bloque2-confianza-numeros`
>
> *Qué/porqué* en [`bloque2-especificaciones.md`](bloque2-especificaciones.md); avance en [`02-bitacora.md`](02-bitacora.md).

## Estrategia

Sub-fases progresivas, cada una backend (+ frontend donde aplica), verificadas con
`build` + `lint:check` + e2e, y merge `--no-ff` a `master`. El `db push` a Supabase
real es paso manual del usuario.

## Sub-fases

### 2.A — Faltantes/sobrantes al P&L + merma sin turno  (ítem 8)
- `reportes.getEstadoResultados`: métricas `faltantes`/`sobrantes` (caja + bóveda) y
  `utilidad_neta − faltantes + sobrantes`.
- `ajustes_inventario.service`: la merma siempre registra su movimiento (sin `if (cajaActiva)`).
- Frontend: métrica de faltantes en Estadísticas.
- **Aceptación:** un faltante baja la utilidad; una merma sin turno se asienta.

### 2.B — Umbral de tolerancia + cierre forzado ADMIN  (ítem 10)
- Constante `TOLERANCIA_DESCUADRE` (env, default 1.00) en `common/`.
- `cerrar`: registra siempre la diferencia; exige justificación si `|dif| ≥ umbral`.
- `cerrar-forzado` (ADMIN): declara efectivo + justificación → `CERRADA_FORZADA`.
- Frontend: POS exige justificación sobre el umbral; Movimientos permite forzar cierre (ADMIN).
- **Aceptación:** descuadre ≥ umbral sin nota → 400; cierre forzado marca el estado.

### 2.C — Arqueo de bóveda  (ítem 9)
- `POST /caja-general/arqueo` (ADMIN): declarado vs derivado → `AJUSTE_BOVEDA_*`.
- Frontend: acción de arqueo en Estadísticas.
- **Aceptación:** tras el arqueo, saldo derivado = declarado; queda el ajuste registrado.

### 2.D — Ajustes positivos de inventario  (ítem 12)
- `ajustes_inventario.service`: `CONTEO_SOBRANTE` incrementa el lote (sin P&L).
- Frontend: dirección quitar/agregar en el diálogo de ajuste.
- **Aceptación:** un ajuste positivo sube `cantidad_disponible`.

### 2.E — Backup (ítem 11) — ⏸️ DIFERIDO
Pendiente de decisión de hosting/almacenamiento + secrets. Documentado, no implementado.

## Seguimiento

| Sub-fase | Estado |
|---|---|
| 2.A · Faltantes al P&L + merma sin turno | ✅ Completada |
| 2.B · Umbral + cierre forzado | ⬜ Pendiente |
| 2.C · Arqueo de bóveda | ⬜ Pendiente |
| 2.D · Ajustes positivos de inventario | ⬜ Pendiente |
| 2.E · Backup | ⏸️ Diferido |
