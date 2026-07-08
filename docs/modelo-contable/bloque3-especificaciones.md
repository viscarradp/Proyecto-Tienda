# Especificaciones — Bloque 3 (Con el sistema ya operando)

> **Estado:** Borrador para revisión conjunta · **Fecha:** 2026-07-08 · **Rama:** `feature/bloque3-operacion`
>
> Continúa el trabajo de [`bloque2-especificaciones.md`](bloque2-especificaciones.md).
> Origen: [auditoría de negocio/contable](../auditorias/2026-07-04-auditoria-negocio-contable.md) §10, **Bloque 3**.
> El avance se registra en [`02-bitacora.md`](02-bitacora.md).

## 1. Propósito

Los Bloques 1 y 2 se cerraron **antes del go-live**: el Bloque 1 arregló el *modelo*
del efectivo y el Bloque 2 la *confianza en los números*. El Bloque 3 son los ítems
que la auditoría clasificó como **"con el sistema ya operando"** (§10): no bloquean la
primera venta, pero completan el producto para el uso diario real —

- que exista un camino para la **devolución de un cliente** después de cerrado el turno,
- que la caída de internet **no devuelva la tienda al cuaderno** (modo contingencia),
- que el dashboard pueda responder **"¿cuánto vale mi negocio hoy?"** (patrimonio) y
  **"¿por dónde entró y salió el efectivo?"** (flujo de efectivo),
- y una tanda de **higiene** de bajo riesgo que la auditoría dejó anotada.

## 2. Decisiones tomadas

- **Ítem 13 — Devolución ligada a la venta original** (decisión del usuario, 2026-07-08):
  la devolución se hace **contra el ticket original** (anulación parcial fuera de turno),
  no como evento suelto. Reutiliza los `detalle_venta_lotes` de la venta para revertir el
  costo FIFO **al lote exacto** a su costo congelado. Máxima trazabilidad y P&L correcto.
  Por cada línea devuelta se elige el destino: **REINGRESO** (vuelve al lote, revendible)
  o **MERMA** (se descarta). El reembolso sale del **turno actual** (exige turno abierto).
- **Ítem 14 — Modo contingencia ligero** (decisión del usuario, 2026-07-08): **fecha/hora
  manual opcional en la venta** para registrar en lote lo vendido durante un apagón, sin
  sincronización offline (la auditoría descarta offline-first por sobreingeniería). La
  venta se contabiliza en el turno actual; su `fecha` refleja cuándo ocurrió de verdad.
- **Ítem 16 — Inmutabilidad a nivel BD: DIFERIDA a producción.** Las tablas contables ya
  son *append-only* a nivel de aplicación (anular/devolver crean estado nuevo; los
  movimientos no se editan). El `REVOKE UPDATE/DELETE` es un GRANT de rol de base de datos
  que **no se puede probar en este entorno** (no hay Supabase real ni roles separados aquí),
  igual que el backup 2.E y coherente con [ADR 0002](../decisions/0002-sin-migraciones-hasta-produccion.md).
  Se documenta el SQL exacto; no se ejecuta.
- **Ítem 16 — Convención de signos: YA RESUELTA en el Bloque 1.C.** La tabla `caja_general`
  (que guardaba `monto` con signo) se eliminó; hoy solo existe `movimientos_financieros.monto`
  (siempre positivo + `tipo_movimiento` + `cuenta_origen`/`cuenta_destino`). No hay dos
  convenciones que unificar — solo se verifica y se deja constancia.
- **Ítem 17 (depreciación, DTE/impuestos, multi-tienda): FUERA DE ALCANCE** salvo que el
  negocio lo pida (decisión explícita de la auditoría §10 y §9). Se documenta como no-hecho
  consciente.

## 3. Alcance por ítem

### Ítem 15 — Patrimonio y flujo de efectivo en el dashboard (§8)

- **`GET /reportes/patrimonio`** (ADMIN) — foto de balance al instante:
  ```
  patrimonio_neto = inventario + efectivo(gaveta + bóveda) + activos_fijos − deudas
  ```
  - `inventario` = Σ `lotes_inventario.cantidad_disponible × costo_unitario_adquisicion`
    (valuación al costo FIFO congelado del lote).
  - `efectivo.gaveta` = si hay turno `ABIERTA` → su `efectivo_esperado`; si no → el fondo
    remanente del último cierre (`efectivo_declarado − Σ TRASLADO_A_BOVEDA` del último turno
    `CERRADA` **o** `CERRADA_FORZADA`).
  - `efectivo.boveda` = `saldoBovedaDerivado` (`Σ destino=BOVEDA − Σ origen=BOVEDA`).
  - `activos_fijos` = Σ `activos_fijos.valor_estimado` (**sin depreciación** — decisión
    consciente a esta escala, §8.4 de la auditoría).
  - `deudas` = Σ `cuentas_por_pagar.saldo_pendiente`.
- **`GET /reportes/flujo-efectivo?desde&hasta`** (ADMIN) — entradas y salidas de efectivo
  por cuenta en el período, "casi gratis" gracias al modelo origen/destino del Bloque 1:
  - Por cada cuenta de efectivo real (`GAVETA`, `BOVEDA`): `entradas` (Σ `monto` donde
    `cuenta_destino` = cuenta), `salidas` (Σ `monto` donde `cuenta_origen` = cuenta), `neto`.
  - Las **ventas** entran a `GAVETA` pero **no** viven en `movimientos_financieros` (suben
    `efectivo_esperado` directamente) → se suman aparte como entrada a gaveta.
  - Las **devoluciones** (ítem 13) restan de `GAVETA` → se restan aparte como salida (se
    conecta cuando aterrice 3.B).
- **Frontend**: Estadísticas muestra la tarjeta de **patrimonio** (desglose de activos y
  deudas) y un resumen de **flujo de efectivo** por cuenta del período.

### Ítem 13 — Devolución de cliente post-turno (§6)

- **`POST /ventas/:id/devolucion`** (body `{ detalles: [{ detalle_venta_id, cantidad,
  destino: 'REINGRESO' | 'MERMA' }], justificacion }`). Exige **turno abierto**.
- **Schema** (nuevas tablas, `db push`):
  - `devoluciones`: `id, venta_id (FK), caja_turno_id (FK), usuario_id (FK), fecha,
    total_reembolsado, justificacion`.
  - `detalle_devoluciones`: `id, devolucion_id (FK), detalle_venta_id (FK), cantidad,
    destino, subtotal_reembolsado, costo_revertido`.
- **Reversión FIFO exacta**: por cada línea devuelta se recorren sus `detalle_venta_lotes`
  y se re-acredita la cantidad a los **lotes exactos** a su `costo_aplicado` congelado.
  - `REINGRESO`: `lotes_inventario.cantidad_disponible += cantidad` (el producto vuelve al
    anaquel, revendible al mismo costo).
  - `MERMA`: no se reingresa stock; el costo revertido queda como pérdida (el producto se
    descartó — el negocio ya pagó ese costo).
  - Validación: `cantidad_devuelta ≤ cantidad_vendida − ya_devuelta` por línea.
- **Reembolso de efectivo**: decrementa `efectivo_esperado` del turno actual (mismo patrón
  que `anular`); **no** crea un `movimiento_financiero` (la devolución vive en su propia
  tabla, como la anulación vive en `ventas.estado`). Requiere `FOR UPDATE` sobre el turno
  y orden lock-antes-de-INSERT ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
- **`reportes.getEstadoResultados`**: el ingreso neto **resta** `devoluciones.total_reembolsado`
  del período; el costo de ventas **resta** el `costo_revertido` de las líneas `REINGRESO`
  (el stock volvió, su costo no fue "vendido"). Las líneas `MERMA` solo revierten ingreso
  (el costo se queda como pérdida real). Se expone `devoluciones` como métrica.
- **Frontend**: en el historial de ventas, cada venta gana un botón **"Devolver"** que abre
  un diálogo con sus líneas, cantidad a devolver por línea y el destino (reingresar/merma).

### Ítem 16 — Higiene de bajo riesgo (§6, §9)

- **Desempate FIFO determinista**: el motor usa `ORDER BY fecha_ingreso ASC` sin desempate
  → dos lotes del mismo instante se consumen en orden no determinista. Se cambia a
  `ORDER BY fecha_ingreso ASC, id ASC` y `lotes_inventario.fecha_ingreso` pasa a **NOT NULL**
  (un `NULL` iría al final del orden; hoy tiene `@default(now())`).
- **`getUltimoCierre` incluye `CERRADA_FORZADA`**: hoy solo mira `estado = 'CERRADA'`, así
  que si el último turno se cerró forzado (2.B), la apertura siguiente derivaría el fondo de
  un cierre más viejo. Gap detectado al mapear el modelo; se corrige aquí.
- **Historial de precios de presentaciones** (§9): hoy `precio_venta` se sobrescribe. Nueva
  tabla `historial_precios_presentaciones` (`presentacion_id, precio_anterior, precio_nuevo,
  fecha, usuario_id`); se captura al actualizar el precio; endpoint de lectura; el frontend
  muestra el historial en el detalle de la presentación. (El histórico de **ventas** ya
  sobrevive cambios de precio: `subtotal` se congela en `detalle_ventas` — §6 auditoría.)
- **Inmutabilidad a nivel BD**: **diferida** (ver §2). Se documenta el SQL de `REVOKE`.
- **Convención de signos**: **verificada** (ya unificada en 1.C — ver §2).

### Ítem 14 — Modo contingencia sin internet (§9)

- **`CreateVentaDto.fecha`** opcional (ISO 8601, **no futura**): si viene, la venta se
  registra con esa fecha/hora real; si no, usa `now()` (comportamiento actual). La venta
  **siempre** pertenece al turno `ABIERTA` y su efectivo entra al `efectivo_esperado` en el
  momento del registro (el dinero llega al sistema cuando se captura). Su `fecha` solo afecta
  a qué período la asigna el P&L — honesto: la venta ocurrió antes, el efectivo entró ahora.
- **Frontend**: en el POS, al confirmar la venta, un toggle **"Venta durante un apagón
  (registrar con su hora real)"** revela un selector de fecha/hora.
- **Documentación**: se describe el proceso manual de contingencia (hoja física durante el
  apagón + captura en lote al volver la conexión) en `docs/domain/`.

## 4. Restricciones (heredadas de Bloques 1–2)

- Sin migraciones Prisma (`db push`); el push a Supabase real es paso manual del usuario.
- Concurrencia: `FOR UPDATE`/advisory locks y orden lock-antes-de-INSERT ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
- Git: rama `feature/bloque3-operacion`, merge `--no-ff` a `master` por sub-fase.
- Tests e2e por cada invariante nuevo; `build` + `lint:check` verdes antes de cada merge.

## 5. Fuera de alcance

- **Ítem 17**: depreciación de activos fijos, módulo fiscal/DTE, multi-tienda — solo si el
  negocio lo pide (auditoría §9). Se documenta como decisión consciente.
- **Inmutabilidad a nivel BD** (parte del ítem 16): diferida a producción con el SQL listo.
- **Offline-first real** (sincronización, resolución de conflictos): descartado por la
  auditoría; el modo contingencia ligero (ítem 14) lo sustituye.

## 6. Criterios de aceptación

1. `GET /reportes/patrimonio` devuelve `inventario + efectivo + activos − deudas` coherente
   con los libros (bóveda derivada, gaveta según turno/último cierre).
2. `GET /reportes/flujo-efectivo` cuadra: para BÓVEDA, `entradas − salidas = saldo` derivado.
3. Una devolución parcial ligada a la venta reingresa la cantidad **al lote exacto** a su
   costo congelado y reembolsa desde el turno actual; el P&L neto refleja la reversión.
4. Una devolución con destino `MERMA` **no** reingresa stock pero sí reembolsa y revierte el
   ingreso; el costo queda como pérdida.
5. Devolver más de lo vendido (menos lo ya devuelto) se rechaza con 400.
6. El motor FIFO desempata por `id` con lotes del mismo `fecha_ingreso`; la columna es NOT NULL.
7. Cambiar el `precio_venta` de una presentación registra una fila en el historial.
8. Una venta con `fecha` manual pasada se registra con esa fecha, pertenece al turno actual y
   sube el `efectivo_esperado`.
9. `build` + `lint:check` + e2e verdes; la app frontend sigue funcional.
