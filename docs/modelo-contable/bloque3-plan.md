# Plan de Implementación — Bloque 3

> **Estado:** Borrador · **Fecha:** 2026-07-08 · **Rama:** `feature/bloque3-operacion`
>
> *Qué/porqué* en [`bloque3-especificaciones.md`](bloque3-especificaciones.md); avance en [`02-bitacora.md`](02-bitacora.md).

## Estrategia

Sub-fases progresivas, cada una backend (+ frontend donde aplica), verificadas con
`build` + `lint:check` + e2e, y merge `--no-ff` a `master`. El `db push` a Supabase
real es paso manual del usuario. Mismo patrón que los Bloques 1 y 2.

Orden elegido: primero lo aditivo y sin schema (3.A), luego la feature grande con schema
(3.B), después la higiene (3.C), la contingencia liviana (3.D) y por último la
reconciliación documental (3.E, refleja todo lo construido).

## Sub-fases

### 3.A — Patrimonio + flujo de efectivo  (ítem 15)
- `reportes.service`: `getPatrimonio()` (inventario + efectivo[gaveta+bóveda] + activos −
  deudas) y `getFlujoEfectivo(desde, hasta)` (entradas/salidas por cuenta + ventas).
- `reportes.controller`: `GET /reportes/patrimonio`, `GET /reportes/flujo-efectivo`.
- Frontend: tarjetas de patrimonio y flujo de efectivo en Estadísticas.
- Sin cambios de schema.
- **Aceptación:** patrimonio coherente con los libros; flujo de bóveda cuadra con el saldo derivado.

### 3.B — Devolución de cliente post-turno  (ítem 13)
- Schema: tablas `devoluciones` + `detalle_devoluciones` (+ back-relations, índices).
- `devoluciones.service`/`module`/`controller`: `POST /ventas/:id/devolucion`. Reversión
  FIFO exacta al lote (REINGRESO) o pérdida (MERMA); reembolso del turno actual bajo lock.
- `reportes.getEstadoResultados`: ingreso neto − devoluciones; COGS − costo revertido (REINGRESO).
- `reportes.getFlujoEfectivo`: devoluciones como salida de gaveta (conecta con 3.A).
- Frontend: botón "Devolver" + diálogo de líneas/cantidad/destino en el historial de ventas.
- **Aceptación:** devolución parcial reingresa al lote exacto y reembolsa; MERMA no reingresa; sobre-devolución → 400.

### 3.C — Higiene: FIFO determinista + historial de precios  (ítem 16)
- `ventas.service`: `ORDER BY fecha_ingreso ASC, id ASC`; schema `fecha_ingreso` NOT NULL.
- `cajas_turnos.service.getUltimoCierre`: incluir `CERRADA_FORZADA`.
- Schema: tabla `historial_precios_presentaciones`; `presentaciones.service.update` captura
  el cambio de `precio_venta`; endpoint de lectura.
- Frontend: historial de precios en el detalle de la presentación.
- Doc: SQL de `REVOKE` (inmutabilidad diferida); nota de convención de signos ya unificada.
- **Aceptación:** FIFO desempata por id; cambiar precio deja fila de historial.

### 3.D — Modo contingencia (fecha manual en venta)  (ítem 14)
- `CreateVentaDto.fecha?` (ISO, no futura); `ventas.service.create` la usa si viene.
- Frontend: toggle "venta durante un apagón" + selector de fecha/hora en el POS.
- Doc: proceso manual de contingencia en `docs/domain/`.
- **Aceptación:** venta con fecha pasada se registra con esa fecha, en el turno actual, sube el esperado.

### 3.E — SRS v3.0 (meta-hallazgo)
- Reescribir `docs/producto/srs.md` reflejando lo construido (NestJS, modelo origen/destino,
  bóveda derivada, retiros de dueños, faltantes al P&L, umbral, arqueo, devoluciones,
  patrimonio, contingencia) y las decisiones de las tres auditorías/bloques.
- Solo documentación; sin código.
- **Aceptación:** el SRS ya no describe un sistema que no existe.

## Seguimiento

| Sub-fase | Estado |
|---|---|
| 3.A · Patrimonio + flujo de efectivo | ✅ Completada |
| 3.B · Devolución post-turno | ⬜ Pendiente |
| 3.C · Higiene (FIFO + historial precios) | ⬜ Pendiente |
| 3.D · Modo contingencia (fecha manual) | ⬜ Pendiente |
| 3.E · SRS v3.0 | ⬜ Pendiente |

## Fuera de alcance (documentado, no implementado)

- Ítem 17: depreciación, DTE/impuestos, multi-tienda — solo si el negocio lo pide.
- Inmutabilidad a nivel BD (REVOKE): diferida a producción con SQL listo.
