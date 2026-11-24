# Dinero y cuentas

> Reglas vigentes (ciclo 2026-11). Verificadas contra `movimientos_financieros`, `caja_general`, `compras`,
> `cuentas_por_pagar` y `common/cuentas-efectivo.ts`. Turnos: [`caja-y-turnos.md`](caja-y-turnos.md).

## Modelo origen → destino

Todo movimiento de efectivo declara `cuenta_origen` y `cuenta_destino` de un **catálogo cerrado**:

| Cuenta | Qué es |
|---|---|
| `GAVETA` | Efectivo real del mostrador. Su saldo es `efectivo_esperado` del turno abierto (o el remanente del último cierre si no hay turno). |
| `BOVEDA` | Efectivo real guardado aparte. **No es una tabla**: su saldo se **deriva** del libro, `Σ(monto con destino=BOVEDA) − Σ(monto con origen=BOVEDA)`. |
| `DUEÑOS` | Contraparte: capital que aporta o retira la dueña (patrimonio). |
| `GASTO` | Contraparte: dinero que sale del negocio como gasto o pérdida (afecta la utilidad). |
| `PROVEEDOR` | Contraparte: pagos por mercadería (no afecta la utilidad: el costo entra por el FIFO). |

`monto` es siempre positivo; el sentido lo da el par origen→destino. Así el efectivo se conserva por construcción
(partida doble mínima) y se eliminó la antigua tabla `caja_general`. Las **ventas** y las **devoluciones** no viven en
el libro: mueven `efectivo_esperado` directamente (ver [`ventas-y-devoluciones.md`](ventas-y-devoluciones.md)).

### Tipos de movimiento vigentes (`movimientos_financieros.tipo_movimiento`)

| Tipo | Origen → destino | Nace de | Efecto en `efectivo_esperado` |
|---|---|---|---|
| `INGRESO_CAPITAL` | DUEÑOS → GAVETA | Apertura con "aporte de la dueña"; `POST /movimientos-financieros` (solo dueña; no está en "Sacar dinero") | Suma |
| `INGRESO_CAPITAL` | DUEÑOS → BOVEDA | `POST /caja-general/inyeccion` (solo dueña, sin turno) | Ninguno |
| `TRASLADO_DESDE_BOVEDA` | BOVEDA → GAVETA | "Traer de la bóveda" (solo dueña); apertura con "de la bóveda" | Suma |
| `RETIRO_BOVEDA` | GAVETA → BOVEDA | "Guardar en bóveda" durante el turno | Resta |
| `TRASLADO_A_BOVEDA` | GAVETA → BOVEDA | Cierre de turno (`monto_a_boveda`); apertura con diferencia "en la bóveda" | Ninguno (el cierre ya contó el efectivo; solo baja el remanente) |
| `EGRESO_OPERATIVO` | GAVETA → GASTO | "Pagar algo"; la cajera solo desde la gaveta | Resta |
| `EGRESO_OPERATIVO` | BOVEDA → GASTO | Gasto con `origen_fondos=BOVEDA` (solo dueña, sin turno) | Ninguno |
| `RETIRO_PERSONAL` | GAVETA → DUEÑOS | "Retiro personal" (solo dueña); apertura con "retiro de la dueña" | Resta |
| `PAGO_PROVEEDOR` | GAVETA → PROVEEDOR | Compra `CAJA_POS`; abono desde la gaveta | Resta |
| `PAGO_PROVEEDOR` | BOVEDA → PROVEEDOR | Compra `CAJA_GENERAL`; abono desde la bóveda | Ninguno |
| `AJUSTE_FALTANTE` | GAVETA → GASTO | Cierre con faltante; apertura sin explicar | Ninguno (ya contado) |
| `AJUSTE_SOBRANTE` | GASTO → GAVETA | Cierre con sobrante; apertura sin explicar | Ninguno (ya contado) |
| `AJUSTE_BOVEDA_FALTANTE` | BOVEDA → GASTO | Arqueo con faltante | Ninguno |
| `AJUSTE_BOVEDA_SOBRANTE` | GASTO → BOVEDA | Arqueo con sobrante | Ninguno |
| `MERMA_INVENTARIO` | (sin cuentas) | Ajuste de inventario negativo | Ninguno: no es efectivo |

`POST /movimientos-financieros` solo acepta cinco tipos: `INGRESO_CAPITAL`, `RETIRO_BOVEDA`, `EGRESO_OPERATIVO`,
`RETIRO_PERSONAL` y `TRASLADO_DESDE_BOVEDA`; el resto los generan el cierre, la apertura, el arqueo, las compras, los
abonos y las mermas. Todo movimiento guarda su autor (`usuario_id`) y un movimiento de gaveta exige turno abierto.

El POS agrupa esto en un solo botón **"Sacar dinero"** con cuatro opciones contablemente distintas: *Guardar en bóveda*,
*Pagar algo*, *Retiro personal* y *Traer de la bóveda*. Reemplaza el concepto ambiguo de "sangría".

### Gastos

Un gasto es un `EGRESO_OPERATIVO`. La **categoría es opcional** (NEG-13): un egreso sin categoría cae en **"Otros"**
(`categorias_gastos`, se crea sola si no existe, tipo `OPERATIVO`). Es un dato de análisis, no un control. Crear,
editar o borrar categorías es de la dueña; la cajera solo las lee.

## Política de fondos: registrar y avisar (D-04, [ADR 0011](../decisions/0011-registrar-y-avisar.md))

**Ninguna salida de efectivo se rechaza porque el saldo que cree el sistema no alcance**: gasto, retiro, guardar en
bóveda, traer de la bóveda, compra `CAJA_POS` o `CAJA_GENERAL`, gasto desde bóveda y abono a un proveedor. Se registra
igual y la respuesta trae `avisos: string[]` ("Según el sistema la gaveta quedó en −$5.00. Puede que falte registrar una
venta o el fondo. Revísalo al cerrar."). Motivo: si hay un hueco en el registro, la cajera igual pagó con el dinero que
tenía en la mano; rechazar el gasto solo logra que se pague **sin registro** y que aparezca un faltante falso al cerrar.

Consecuencias:

- `efectivo_esperado` y el saldo de bóveda **pueden quedar negativos**. Es una señal de "falta registrar algo", no un
  estado inválido; el cierre de turno y el arqueo de bóveda lo reconcilian.
- Los **locks se conservan** (turno `FOR UPDATE`, advisory `boveda_ledger`, orden turno → bóveda) para que dos salidas
  concurrentes lean un saldo coherente.
- **Sí hay reglas que bloquean**, porque son reglas reales y no de saldo: turno abierto para tocar la gaveta, no abonar
  más de lo que se debe, no superar el efectivo declarado al trasladar a la bóveda, justificación en descuadres altos,
  y los permisos por rol.

## Bóveda

- **Saldo:** `GET /caja-general/saldo` (ambos roles) devuelve el saldo derivado; el libro completo
  (`GET /caja-general`) y las operaciones de aporte y arqueo son solo de la dueña.
- **Inyección** (`POST /caja-general/inyeccion`, solo dueña): aporte de capital directo a la bóveda. Un asistente en
  Estadísticas permite declarar "efectivo guardado hoy" al empezar a usar el sistema, mientras la bóveda no tenga
  movimientos.
- **Arqueo** (`POST /caja-general/arqueo`, solo dueña): la dueña declara el efectivo físico contado; se compara con el
  saldo derivado y, si difiere, se registra `AJUSTE_BOVEDA_FALTANTE` o `AJUSTE_BOVEDA_SOBRANTE` que deja el derivado igual
  al físico. Con diferencia ≥ la tolerancia ($1.00, `TOLERANCIA_DESCUADRE`) la justificación es obligatoria. Responde
  `{ saldo_esperado, saldo_declarado, diferencia, saldo_actual }`. Convierte "¿dónde está mi dinero?" en una respuesta
  verificable, no solo calculada. Los ajustes de bóveda entran al estado de resultados como faltantes/sobrantes.

## Compras y de dónde sale el dinero (solo dueña)

`estado_pago` es `PAGADO` o `AL_CREDITO`.

- **`PAGADO`** exige `origen_fondos` (el formulario no trae uno por defecto): `CAJA_POS` (sale de la gaveta del turno
  abierto; `PAGO_PROVEEDOR` GAVETA→PROVEEDOR, baja `efectivo_esperado`), `CAJA_GENERAL` (sale de la bóveda, no exige turno;
  BOVEDA→PROVEEDOR) o `CAPITAL_DUEÑOS` (aporte en especie: entra mercadería sin mover efectivo ni registrar movimiento).
  Los fondos se bloquean y validan **antes** de crear lotes (orden de locks, ADR 0001) y, si no alcanzan, se avisa.
- **`AL_CREDITO`** (D-05: a veces se compra fiado): no mueve efectivo y no tiene origen de fondos; el campo se ignora y se
  guarda `CREDITO`. Crea una deuda en `cuentas_por_pagar` por el monto de la compra.
- `monto_total` lo calcula el backend desde los lotes; el del cliente se ignora.

## Cuentas por pagar y abonos (solo dueña)

- `GET /cuentas-por-pagar?estado=pendientes|todas` lista las deudas con proveedor, fecha, monto, saldo y sus abonos
  (lo más viejo primero; con `todas`, las pendientes antes que las saldadas).
- `POST /cuentas-por-pagar/:id/abonos` con `{ monto, origen: GAVETA | BOVEDA, nota? }` registra un `PAGO_PROVEEDOR`
  (`GAVETA→PROVEEDOR` con turno abierto, que baja `efectivo_esperado`; o `BOVEDA→PROVEEDOR`), baja `saldo_pendiente` y guarda
  el abono (`abonos_cuentas_por_pagar`) enlazado a su movimiento, con autor.
- **El abono no puede superar el saldo** (regla real, 400; "Esta deuda ya está pagada" si el saldo es 0). Por fondos
  insuficientes no se bloquea: se registra y se avisa.
- Pagar una deuda de mercadería **no es un gasto**: el estado de resultados no cambia (el costo ya entró por el FIFO). En
  el patrimonio bajan por igual las deudas y el efectivo.

## Traslados entre gaveta y bóveda: cuál usar

| Quiero… | Usar | Cuándo |
|---|---|---|
| Guardar efectivo de la gaveta en la bóveda en medio del día | `RETIRO_BOVEDA` | Durante el turno (la cajera puede) |
| Mandar el excedente a la bóveda al cerrar | `monto_a_boveda` del cierre → `TRASLADO_A_BOVEDA` | Al cerrar |
| Traer efectivo de la bóveda a la gaveta | `TRASLADO_DESDE_BOVEDA` | Durante el turno (solo dueña) |

## Corregir errores (anular)

**Anular = marcar, nunca borrar** ([ADR 0012](../decisions/0012-anular-sin-borrar.md)): el registro queda con `anulado`,
`anulado_en`, `anulado_por_id` y `motivo_anulacion`, y su efecto se revierte. Lo anulado **no cuenta** en el estado de
resultados, el flujo de efectivo ni el saldo de bóveda; los listados lo siguen mostrando, tachado. Solo la dueña
(ADMIN), siempre con `motivo`. Doble anulación y falta de motivo dan 400; la cajera, 403.

- `PATCH /movimientos-financieros/:id/anular` `{ motivo }`: solo `EGRESO_OPERATIVO`, `RETIRO_PERSONAL` e
  `INGRESO_CAPITAL`. Si tocó la **gaveta**, solo mientras su turno siga `ABIERTA` (un turno cerrado es un cuadre
  inmutable, 400) y `efectivo_esperado` vuelve atrás. Si tocó la **bóveda**, en cualquier momento. No se anulan el
  aporte/retiro de la apertura de turno (marca `es_apertura`), los traslados, ajustes, pagos a proveedor ni mermas: se corrigen anulando su
  origen (compra, merma) o con el cierre/arqueo.
- `PATCH /compras/:id/anular`: ver [`inventario.md`](inventario.md#corregir-errores-anular). Revierte el `PAGO_PROVEEDOR`
  (a la gaveta solo si su turno sigue abierto; o a la bóveda) y salda la deuda si fue al crédito sin abonos.
- Orden de locks (ADR 0001): turno o bóveda → lotes → cuenta por pagar. Los movimientos de una compra o merma guardan
  `compra_id` / `ajuste_id`.
