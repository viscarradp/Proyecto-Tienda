# Caja y turnos

> Reglas vigentes (ciclo 2026-11). Verificadas contra `cajas_turnos.service.ts`.
> Principio rector: **apoyar, no imponer** — una diferencia se registra y se avisa, no bloquea.
> Dinero entre cuentas: [`dinero-y-cuentas.md`](dinero-y-cuentas.md). Quién puede qué: [`roles-y-permisos.md`](roles-y-permisos.md).

## Una sola gaveta, un turno a la vez

- Solo puede haber **un turno `ABIERTA`** (decisión ARQ-03: una sola gaveta). Abrir otro con uno abierto da 409.
  Aperturas simultáneas se serializan con un advisory lock (`caja_turno_abrir`, [ADR 0001](../decisions/0001-concurrencia-for-update.md)).
- Toda venta, devolución, movimiento de gaveta y pago desde la gaveta exige turno abierto. La compra pagada con
  la bóveda, el arqueo y los aportes a la bóveda **no** lo exigen.
- Estados: `ABIERTA`, `CERRADA`, `CERRADA_FORZADA`.
- El turno guarda quién lo abrió (`usuario_id`) y quién lo cerró (`cerrado_por_id`).

## Abrir (`POST /cajas-turnos/abrir`)

Entrada: `fondo_inicial`, y opcionales `origen_diferencia` (`BOVEDA` | `APORTE` | `RETIRO` | `NO_SE`) y `nota`.

El **remanente** es lo que quedó en la gaveta al último cierre: `efectivo_declarado − TRASLADO_A_BOVEDA` de ese
turno (0 si nunca hubo un cierre; el cierre forzado también cuenta). Si `fondo_inicial ≠ remanente`, la diferencia
**siempre se registra y nunca bloquea la apertura** (D-15, [ADR 0011](../decisions/0011-registrar-y-avisar.md)):

| Sentido | `origen_diferencia` | Asiento (origen→destino) |
|---|---|---|
| Sobra | `BOVEDA` | `TRASLADO_DESDE_BOVEDA` (BOVEDA→GAVETA) |
| Sobra | `APORTE` | `INGRESO_CAPITAL` (DUEÑOS→GAVETA) |
| Sobra | `NO_SE`, ausente o `RETIRO` | `AJUSTE_SOBRANTE` (GASTO→GAVETA), "sin explicar" |
| Falta | `BOVEDA` | `TRASLADO_A_BOVEDA` (GAVETA→BOVEDA) |
| Falta | `RETIRO` | `RETIRO_PERSONAL` (GAVETA→DUEÑOS) |
| Falta | `NO_SE`, ausente o `APORTE` | `AJUSTE_FALTANTE` (GAVETA→GASTO), "sin explicar" |

Detalles:

- El turno nuevo arranca con `efectivo_esperado = fondo_inicial`; el asiento solo **explica** el salto
  remanente → fondo y no vuelve a tocar el esperado.
- El `TRASLADO_A_BOVEDA` de la apertura se guarda **sin `caja_turno_id`** para que el cierre de ese turno no lo
  reste otra vez del remanente.
- Una opción que no corresponde al sentido (p. ej. `APORTE` cuando falta dinero) cae en el ajuste sin explicar.
- La respuesta trae `avisos: string[]` (diferencia sin explicar, bóveda en negativo).
- En el primer turno de la historia el remanente es 0, así que todo el fondo es "diferencia": la pantalla
  preselecciona "Aporte de la dueña". Un ajuste sin explicar suma a faltantes/sobrantes del estado de resultados.

## Cerrar (`PATCH /cajas-turnos/:id/cerrar`)

Entrada: `efectivo_declarado` (conteo físico total), `monto_a_boveda` (opcional) y `observaciones`.

1. `diferencia = efectivo_declarado − efectivo_esperado`.
2. **Tolerancia:** `TOLERANCIA_DESCUADRE` (default **$1.00**, configurable por env). Con `|diferencia| ≥ tolerancia`
   las observaciones son obligatorias (400 si faltan). Por debajo, el ajuste es automático y sin fricción.
3. La diferencia **siempre se registra** (aunque sea de centavos, si pasa de $0.001) como `AJUSTE_FALTANTE`
   (GAVETA→GASTO) o `AJUSTE_SOBRANTE` (GASTO→GAVETA) atado al turno. Así se detecta el patrón de faltantes chiquitos.
4. `monto_a_boveda > 0` registra `TRASLADO_A_BOVEDA` (GAVETA→BOVEDA); no puede superar el efectivo declarado.
   Lo que no se traslada queda en la gaveta como fondo del próximo turno.
5. Guarda `fecha_cierre`, `efectivo_declarado`, `diferencia`, `observaciones`, `cerrado_por_id`.

Un turno cerrado es **inmutable**: su `diferencia` es un cuadre histórico. Anular una venta de un turno cerrado
está bloqueado, y una devolución se reembolsa siempre desde el turno **actual** (ver
[`ventas-y-devoluciones.md`](ventas-y-devoluciones.md)). El cierre toma lock `FOR UPDATE` del turno: un doble clic
no duplica el ajuste (el segundo recibe 409).

El POS ofrece **"Reabrir automáticamente"** al cerrar: tras un cierre exitoso abre el turno siguiente con
`fondo_inicial = declarado − traslado a bóveda` (solo si ese fondo es mayor que 0). Es una llamada normal a
`/abrir` desde el frontend, no una regla del servidor; si falla, la pantalla avisa que la caja ya se cerró y
consulta el estado real.

> Pendiente (no construido): conteo "a ciegas" al cerrar — hoy se muestra el efectivo esperado antes de contar
> (VIVO-09, [backlog](../roadmap/backlog-ciclo-2026-11.md)).

## Cierre forzado (`PATCH /cajas-turnos/:id/cerrar-forzado`, solo ADMIN)

Para un turno que la cajera dejó abierto. La dueña declara el efectivo contado y **debe** dar una justificación
(siempre, sin importar el monto). El turno queda `CERRADA_FORZADA`; se registra el ajuste y el traslado igual
que en un cierre normal, y el turno se ve como tal en Movimientos.

## Lectura

- `GET /cajas-turnos/activa` (404 si no hay turno abierto), `GET /cajas-turnos/ultimo-cierre` (trae `fondo_siguiente`).
- `GET /cajas-turnos`: historial **paginado por cursor** (`antes_de=<id>`, `limit` 7 por defecto, máx. 50), devuelve
  `{ items, hay_mas }` con el nombre de quien abrió y cerró.
- `GET /cajas-turnos/:id` y `/:id/resumen` (ventas completadas —las anuladas solo se cuentan aparte—, devoluciones hechas en el turno, ventas netas, egresos, pagos a proveedores, mermas, ingresos de capital y traslados).
