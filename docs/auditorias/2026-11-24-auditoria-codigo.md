# Auditoría de código (lógica y correctitud) — 2026-11-24

- **Fecha:** 2026-11-24
- **Commit auditado:** `311edc470ae8c39562825abef58679b3688e2114` (`master`, "merge(ciclo-2026-11): estado de fases 0 y 1")
- **Alcance:** backend `erp-tienda-backend/src/` completo (servicios, controllers, DTOs, filtro de excepciones, `common/`), `prisma/schema.prisma`, `scripts/`, `query_test.ts`, `Dockerfile`; frontend `erp-tienda-frontend/` (POS, inventario, movimientos, gastos, estadísticas, login, stores, `lib/api.ts`, diálogos).
- **Método:** lectura estática de solo lectura, trazando cada flujo de punta a punta (DTO → servicio → columna de BD → JSON → pantalla). Dos comprobaciones sueltas sin tocar BD: serialización JSON de `Prisma.Decimal` (sale como `string`) y aritmética de `Decimal`/float de los ejemplos. **No se ejecutaron flujos contra una BD ni tests**; "Confirmado" significa que el flujo completo se trazó en el código, no que se reprodujo en vivo. Los 135 avisos de `lint:check` son ruido de tipos en tests; no esconden bugs.
- **Exclusiones:** lo ya conocido (anulación con devoluciones y su carrera, zona horaria de reportes, "023 uds" en Movimientos, "Ingresos del período" sin devoluciones en Movimientos, nombre faltante en el desglose, hidratación de `ThemeToggle`, contraseña fija del seed, "Semana" de 8 días) y todo `docs/roadmap/hardening-backlog.md`.

> **Informe congelado; el estado vivo se lleva en `docs/roadmap/`.**

Leyenda de severidad: 🔴 antes de la primera venta real · 🟡 importante · ⚪ menor. Confianza: **Confirmado** (flujo completo trazado) · **Probable** (depende de entorno o de un caso no reproducido).

## Resumen ejecutivo

El núcleo transaccional (FIFO, turno bloqueado antes de insertar, anulación, devoluciones, saldo de bóveda derivado) está bien resuelto y es coherente con el ADR 0001. Los problemas están en la **frontera**: lo que la API devuelve como `string` (todo `Decimal`) y el frontend trata como `number`, validaciones de entrada que dejan pasar valores que la columna no guarda, y reglas de fondos que no siguen el principio "apoyar, no imponer".

Dos hallazgos son bloqueantes para la primera venta real, ambos del mismo origen (los `Decimal` llegan como texto): el **stock del POS y de Inventario se muestra concatenado** ("0105" en vez de 15) y **no se puede editar el precio de ninguna presentación** desde la UI (el backend rechaza el `factor_conversion` que el frontend reenvía como texto). El resto son carreras de baja probabilidad pero baratas de arreglar ahora, redondeo latente (la UI hoy solo vende enteros), reportes que no netean devoluciones y mensajes que una cajera no entiende.

## Tabla resumen

| ID | Sev. | Título | Confianza |
|---|---|---|---|
| COD-01 | 🔴 | Stock de POS e Inventario se calcula concatenando strings | Confirmado |
| COD-02 | 🔴 | Editar el precio de una presentación falla (`factor_conversion` viaja como string) | Confirmado |
| COD-03 | 🟡 | Transacciones con el timeout por defecto (5 s) y errores de Prisma sin mapear → "Internal server error" | Probable |
| COD-04 | 🟡 | Rate-limit por IP detrás de un proxy: todos comparten el mismo cupo (login: 5/min en total) | Probable |
| COD-05 | 🟡 | Tras vender, el POS no refresca stock; precios cacheados 3 min y el total nunca se reconcilia con el del servidor | Confirmado |
| COD-06 | 🟡 | Reintento tras un fallo de red duplica la venta (sin idempotencia) | Probable |
| COD-07 | 🟡 | Devolución con la misma línea repetida en un request supera lo vendido | Confirmado |
| COD-08 | 🟡 | Movimiento de caja no revalida que el turno siga ABIERTO bajo lock | Confirmado |
| COD-09 | 🟡 | Ajuste de inventario lee el lote sin `FOR UPDATE`: puede dejar stock negativo | Confirmado |
| COD-10 | 🟡 | Reglas de fondos incoherentes: egresos bloquean, anulación/devolución dejan caja negativa y el cierre inventa un "sobrante" | Confirmado |
| COD-11 | 🟡 | Redondeo: Σ líneas ≠ total de la venta; devoluciones parciales reembolsan de más; floats en el cierre de caja | Confirmado (latente) |
| COD-12 | 🟡 | DTOs numéricos sin tope ni decimales de la columna (overflow → 500, ajustes de $0.00) | Probable |
| COD-13 | 🟡 | La UI no puede vender ni crear cantidades fraccionarias (`parseInt` en factor, carrito de 1 en 1) | Confirmado |
| COD-14 | 🟡 | Estadísticas: el P&L visible no suma (omite devoluciones) y Productos top no netea devoluciones | Confirmado |
| COD-15 | 🟡 | Movimientos: turno CERRADA_FORZADA se muestra "en curso" y no entra al descuadre | Confirmado |
| COD-16 | 🟡 | Abrir caja con dinero de la bóveda no tiene UI y la instrucción en pantalla apunta a algo que hace lo contrario | Confirmado |
| COD-17 | 🟡 | POS: cualquier error se interpreta como "no hay caja"; cierre OK + reapertura fallida deja la pantalla en un estado obsoleto | Confirmado |
| COD-18 | 🟡 | Usuarios: el token sobrevive al borrado/cambio de rol, errores tragados y `DELETE` devuelve el hash | Confirmado |
| COD-19 | 🟡 | Cuentas por pagar no se pueden pagar y activos fijos no tienen API: el patrimonio arrastra datos que nadie puede corregir | Confirmado |
| COD-20 | 🟡 | Mensajes de error con IDs técnicos, en inglés o genéricos | Confirmado |
| COD-21 | 🟡 | Listados sin paginación (ventas, turnos con todos sus movimientos, productos con todos sus lotes) | Probable |
| COD-22 | ⚪ | Entradas que el controller lee fuera del DTO o no valida (`justificacion_nula`, `+id`, `limit`, fecha de contingencia) | Confirmado |
| COD-23 | ⚪ | Strings: `codigo_barras` con espacio, no se puede borrar un código, faltan `MaxLength` (→ 500) | Confirmado |
| COD-24 | ⚪ | Código muerto o riesgoso: `query_test.ts`, `scripts/*.sql`, `Dockerfile`, endpoints sin uso | Confirmado |
| COD-25 | ⚪ | Edición de producto y de precio no atómica (varios PATCH; historial fuera de transacción) | Confirmado |

Conteo: 🔴 2 · 🟡 19 · ⚪ 4.

---

## 🔴 Antes de la primera venta real

### COD-01 — Stock de POS e Inventario se calcula concatenando strings

- **Severidad:** 🔴 · **Confianza:** Confirmado
- **Evidencia:**
  - `erp-tienda-frontend/app/dashboard/pos/page.tsx:285` — `prod.lotes_inventario.reduce((s, l) => s + l.cantidad_disponible, 0)`
  - `erp-tienda-frontend/app/dashboard/inventario/page.tsx:126` — `reduce((sum, l) => sum + l.cantidad_disponible, 0)`
  - `erp-tienda-frontend/src/store/inventoryStore.ts:20-21` declara `cantidad_disponible: number`, pero `productos.service.ts:30-45` devuelve `Decimal(12,3)`, que `JSON.stringify` serializa como `"10"` (comprobado: `{"a":"12"}`).
- **Escenario:** producto con un lote de 10 → `0 + "10"` = `"010"`. Con lotes de 10 y 5 → `"0105"` (se ve 105). Con lotes de 1.5 y 2.5 → `"01.52.5"`, que no es número: `row.stock > 0` da `false` y la fila sale en rojo aunque haya stock.
- **Impacto:** es el mismo origen que el "023 uds" ya anotado en Movimientos, pero aquí afecta lo que la cajera consulta para vender y lo que la dueña usa para decidir compras. Además la columna "stock" está en unidades base: en una presentación "Fardo ×12" muestra 24 en vez de 2.
- **Corrección sugerida:** sumar con `Decimal`/`Number` explícito (`s + Number(l.cantidad_disponible)`) y tipar `cantidad_disponible`/`cantidad_inicial`/`factor_conversion` como `string` en `inventoryStore.ts` (así `tsc` marca todos los usos). Un único helper `toNumber()` sirve también para Movimientos. Mostrar el stock de presentaciones dividido por `factor_conversion`.

### COD-02 — Editar el precio de una presentación falla porque `factor_conversion` viaja como string

- **Severidad:** 🔴 · **Confianza:** Confirmado (Decimal → string verificado; no se ejecutó el PATCH)
- **Evidencia:**
  - `EditProductDialog.tsx:114` — `factor_conversion: pres.factor_conversion` (valor tal cual vino de la API: `"12"`).
  - `presentaciones/dto/create-presentacion.dto.ts:37` — `@IsNumber({ maxDecimalPlaces: 3 })`; `UpdatePresentacionDto` es `PartialType` y `main.ts:44-49` usa `ValidationPipe({ transform: true })` sin conversión implícita, así que `"12"` no pasa `IsNumber`.
  - El `precio_venta` sí se convierte (`parseFloat(pres.precio_venta)`, línea 115); el factor no. El tipo `Presentacion.factor_conversion: number` es el mismo desajuste de COD-01.
- **Escenario:** la dueña abre "Editar producto", cambia solo el precio de una presentación y guarda → `PATCH /presentaciones/:id` con `"factor_conversion":"12"` → 400 con un mensaje en inglés de class-validator ("factor_conversion must be a number conforming to the specified constraints"). Solo funciona si además toca el campo "Múltiplo" (ahí `parseInt` lo vuelve número).
- **Impacto:** no se pueden cambiar precios desde la pantalla, que es la operación más frecuente del dueño. Antes de ese fallo el `PATCH` de `/productos/:id` ya se aplicó (ver COD-25), así que el error deja la edición a medias.
- **Corrección sugerida:** enviar `Number(pres.factor_conversion)`; mejor, enviar solo los campos que cambiaron.

---

## 🟡 Importantes

### COD-03 — Transacciones con el timeout por defecto y errores de Prisma sin mapear

- **Severidad:** 🟡 · **Confianza:** Probable
- **Evidencia:** ningún `$transaction` pasa `timeout`/`maxWait` (`grep` sin resultados en `src/`); `ventas.service.ts:48` abre la transacción de la venta. `prisma-exception.filter.ts:29-47` solo mapea P2002/P2003/P2025; el resto cae a "Internal server error".
- **Escenario:** la BD está en Supabase (`prisma.service.ts:102`). Una venta de N líneas hace ≈ 6 consultas por línea + 5 fijas (p. ej. 5 líneas ≈ 35 viajes). Con una latencia de 100–150 ms por viaje hacia Supabase (a medir) se roza el límite de 5 s por defecto de Prisma. Al pasarlo, Prisma revierte y lanza P2028; la cajera ve "Internal server error". Igual para P2034 (deadlock/serialización) y para cualquier error de rango numérico (COD-12).
- **Impacto:** ventas rechazadas en carritos grandes o en horas de latencia alta, con un mensaje sin sentido. La reversión es consistente (no hay datos corruptos), pero se combina con COD-06 (la cajera reintenta).
- **Corrección sugerida:** pasar `{ maxWait: 5000, timeout: 20000 }` a los `$transaction` de ventas/devoluciones/compras; mapear P2028/P2034 a un 503 con texto "El sistema está lento, intenta de nuevo; no se registró nada" y 22003/P2000 a 400 legible. Medir el tiempo real de una venta de 10 líneas contra la BD de producción.

### COD-04 — Rate-limit por IP detrás de un proxy

- **Severidad:** 🟡 · **Confianza:** Probable (depende del despliegue, que según `docs/` irá a Render/GCP detrás de balanceador)
- **Evidencia:** `app.module.ts:33-39` (60 req/min globales), `auth.controller.ts` (login 5/min por IP), `main.ts:12` crea la app sin `trust proxy`; `ThrottlerGuard` rastrea por `req.ip`.
- **Escenario:** tras un proxy, `req.ip` es la IP del balanceador para todos los clientes. Los 5 intentos de login por minuto y los 60 requests por minuto son **de toda la tienda**: la cajera falla al iniciar sesión porque la dueña acaba de entrar desde el celular; el POS (venta + recargas de caja/inventario) puede agotar el cupo global.
- **Impacto:** bloqueos aleatorios con 429 "ThrottlerException: Too Many Requests" en horas pico.
- **Corrección sugerida:** `app.set('trust proxy', 1)` (o el número de saltos real) en `main.ts` al desplegar; subir el límite global (60/min es poco para un POS con un cliente por IP) o excluir `GET` baratos.

### COD-05 — Tras vender, el POS no refresca el stock; precios cacheados y el total no se reconcilia

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `pos/page.tsx:271` llama `loadData()` → `fetchInventory()` sin `forceRefresh` (`:122`); `inventoryStore.ts:65-70` retorna sin consultar si `lastFetched` tiene < 3 min y hay productos. `cartStore.ts:52` calcula el total con el precio cacheado; `handleCheckout` (`:247-262`) envía solo `presentacion_id` y `cantidad`, y la respuesta del servidor (con su `total`) se descarta.
- **Escenario:** (1) la cajera vende 3 unidades; el catálogo sigue mostrando el stock anterior hasta 3 min (comentario del código: "Recargar datos para actualizar stock", pero no lo hace). (2) La dueña sube un precio desde otro dispositivo; la cajera cobra al cliente el total viejo que ve en pantalla, mientras el backend registra la venta con el precio nuevo → el efectivo esperado no coincide con lo cobrado.
- **Impacto:** stock mostrado incorrecto durante la operación y descuadres de centavos/dólares sin causa visible.
- **Corrección sugerida:** `fetchInventory(true)` tras vender y tras anular/devolver; mostrar el `total` devuelto por el servidor en el mensaje de éxito y avisar si difiere del total en pantalla.

### COD-06 — Reintento tras un fallo de red duplica la venta

- **Severidad:** 🟡 · **Confianza:** Probable
- **Evidencia:** `pos/page.tsx:259-262` (POST sin identificador de operación) y `:275-277` (en error el carrito se conserva); `ventas.service.ts:23` no deduplica.
- **Escenario:** el celular pierde la conexión justo cuando el servidor ya confirmó la venta; `fetch` lanza `TypeError`, la cajera ve el error, el carrito sigue lleno y vuelve a pulsar "Procesar pago" → segunda venta idéntica, doble descuento de stock y doble efectivo esperado.
- **Impacto:** dinero y stock duplicados, difíciles de detectar (parecen dos ventas legítimas).
- **Corrección sugerida:** generar un UUID por intento en el cliente (`Idempotency-Key` / campo en el DTO), guardarlo con una restricción única en `ventas` y devolver la venta existente si se repite; mientras tanto, ante un error de red recargar `/ventas` y avisar "puede que la venta sí se haya registrado".

### COD-07 — Devolución con la misma línea repetida supera lo vendido

- **Severidad:** 🟡 · **Confianza:** Confirmado (solo alcanzable por API; la UI arma una entrada por línea)
- **Evidencia:** `ventas.service.ts:414-436`: `yaDevuelto` se calcula desde `detalle.detalle_devoluciones` leído **antes** del bucle (`:424`) y nunca se acumula lo pedido dentro del mismo request. `create-devolucion.dto.ts` no impide `detalle_venta_id` repetidos.
- **Escenario:** línea vendida con cantidad 3; request `detalles: [{id:L, cantidad:2}, {id:L, cantidad:2}]` → ambas pasan (`2 ≤ 3`), se reembolsa 4 unidades y, con `REINGRESO`, se devuelven 4 al lote.
- **Impacto:** reembolso en efectivo y stock inflados por encima de lo vendido; el P&L neto queda mal.
- **Corrección sugerida:** acumular por `detalle_venta_id` dentro del bucle (mapa `pedidoEnEsteRequest`) o rechazar ids duplicados en el DTO (`@ArrayUnique`).

### COD-08 — Movimiento de caja no revalida el estado del turno bajo lock

- **Severidad:** 🟡 · **Confianza:** Confirmado (ventana de milisegundos)
- **Evidencia:** `movimientos_financieros.service.ts:77` lee el turno ABIERTA fuera de la transacción y `:122-126` solo bloquea `WHERE id = ...` sin volver a comprobar `estado`. Contraste: `ventas.service.ts:63-67` sí revalida.
- **Escenario:** `cerrar()` confirma entre ambas lecturas → el egreso se inserta con `caja_turno_id` de un turno CERRADA y `efectivo_esperado` de un turno ya cuadrado cambia, falseando `diferencia`.
- **Impacto:** cuadre histórico inmutable alterado (justo lo que el ADR 0001 dice proteger). Probabilidad baja con una sola cajera.
- **Corrección sugerida:** `SELECT id, estado, efectivo_esperado ... FOR UPDATE` y lanzar el mismo error de "no hay turno abierto" si `estado <> 'ABIERTA'`. Mejor aún, localizar el turno dentro de la transacción con `WHERE estado='ABIERTA' FOR UPDATE` como hace `compras`.

### COD-09 — Ajuste de inventario lee el lote sin `FOR UPDATE`

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `ajustes_inventario.service.ts:23` (`tx.lotes_inventario.findUnique`, sin lock), validación en `:33` y `decrement` en `:50`.
- **Escenario:** lote con 6 unidades. Mientras el admin registra una merma de 5, una venta (que sí bloquea el lote) descuenta 3 y confirma; el ajuste validó con 6, espera en el `UPDATE`, y al continuar deja `6 − 3 − 5 = −2`. Lo mismo con dos ajustes simultáneos.
- **Impacto:** `cantidad_disponible` negativa (no hay `CHECK`; el backlog lo difiere), el FIFO la ignora (`> 0`) pero el valor del inventario del patrimonio baja de más.
- **Corrección sugerida:** `SELECT ... FROM lotes_inventario WHERE id = ... FOR UPDATE` dentro de la transacción y validar contra esa lectura; o `UPDATE ... WHERE cantidad_disponible >= x` con conteo de filas.

### COD-10 — Reglas de fondos incoherentes: unas bloquean, otras dejan la caja negativa

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:**
  - Bloquean: `movimientos_financieros.service.ts:148-153`, `compras.service.ts:110-116` ("Fondos insuficientes"), y se duplica en el cliente (`gastos/page.tsx:127-130`, `pos/page.tsx:195-200`).
  - No bloquean: `ventas.service.ts:336` (anular: `decrement: venta.total`) y `:488` (devolver: `decrement: totalReembolsado`).
- **Escenario:** turno con fondo $0. Venta de $50 → esperado $50. La cajera paga un gasto de $50 (permitido, queda $0). El cliente devuelve la venta → esperado $−50 sin ningún aviso. Al cerrar, cuenta $0 → `diferencia = +50` → se registra `AJUSTE_SOBRANTE` de $50 que **sube la utilidad** (`reportes.service.ts` suma `sobrantes`). En sentido contrario, un egreso real de $20 pagado con dinero que aún no estaba registrado se **bloquea**.
- **Impacto:** va en contra del principio de producto "apoyar, no imponer" (memoria del proyecto: registrar y avisar antes que bloquear) y produce sobrantes/faltantes ficticios en el P&L.
- **Corrección sugerida:** unificar el criterio: permitir el movimiento, registrarlo y devolver un `advertencia` ("la caja quedó en −$50, revisa el conteo") que la UI muestre; quitar los bloqueos duros de egresos/compras desde caja (o hacerlos confirmables). Si se mantienen, aplicar el mismo control a anulación y devolución.

### COD-11 — Redondeo: Σ líneas ≠ total; devoluciones parciales; floats en el cierre

- **Severidad:** 🟡 · **Confianza:** Confirmado (latente: hoy la UI solo vende cantidades enteras, ver COD-13; aparece en cuanto se venda por peso)
- **Evidencia:**
  - `ventas.service.ts:103-112`: `subtotal_venta = cantidad × precio` (más de 2 decimales) se guarda en `detalle_ventas.subtotal Decimal(10,2)` (se redondea por línea) mientras `total_venta_acumulado` (`:104`) suma los valores **sin** redondear y se guarda en `ventas.total Decimal(10,2)` (`:197`).
  - `ventas.service.ts:441-443`: el reembolso de cada línea es `round(subtotal_guardado × proporción)`, sin descontar lo ya reembolsado.
  - `pos/page.tsx:202,222`: `fondoSiguiente = efectivoParsed - bovedaParsed` en float; `cartStore.ts:52` suma floats.
- **Escenario:**
  - Venta: 3 líneas de 0.5 × $0.99 → cada subtotal 0.495 se guarda 0.50 (suma de líneas $1.50); el total 1.485 se guarda $1.49. Los reportes divergen: `getProductosTop` suma `detalle.subtotal` ($1.50) y `getEstadoResultados` suma `ventas.total` ($1.49).
  - Devolución: línea 0.7 × $0.99 → subtotal guardado $0.69; devolver 0.35 y luego 0.35 reembolsa 0.345→$0.35 + $0.35 = $0.70 > $0.69.
  - Cierre: `150.3 − 50` da `100.30000000000001` y se manda como `fondo_inicial` (hoy pasa porque ese DTO no limita decimales; al añadir `maxDecimalPlaces: 2` por COD-12 rompería la reapertura automática). `0.1 × 3` en el carrito da `0.30000000000000004` y `cambio = pago >= total` (`CheckoutSection.tsx:46`) trata un pago exacto de $0.30 como insuficiente.
- **Impacto:** diferencias de uno o dos centavos entre ticket, total, reportes y reembolsos; ruido en conciliaciones.
- **Corrección sugerida:** redondear cada subtotal a 2 decimales **antes** de acumular (`toDecimalPlaces(2)`) y guardar el total como suma de líneas redondeadas; en devoluciones, para la última porción usar `subtotal − ya_reembolsado`; en el cliente, trabajar en centavos enteros (`Math.round(x*100)`) para total, cambio y fondo siguiente.

### COD-12 — DTOs numéricos sin tope ni decimales de la columna

- **Severidad:** 🟡 · **Confianza:** Probable (el código de error exacto de Postgres no se ejecutó)
- **Evidencia:** `@IsNumber()` sin `maxDecimalPlaces` ni `@Max` en `create-caja_turno.dto.ts:9` (`fondo_inicial`), `close-caja_turno.dto.ts:9` (`efectivo_declarado`), `create-movimientos_financiero.dto.ts:22` (`monto`), `create-compra.dto.ts:24` (`costo_unitario_adquisicion`), `create-presentacion.dto.ts:43` (`precio_venta`); cantidades con `maxDecimalPlaces: 3` pero sin `@Max` (`create-venta.dto.ts:18`, `create-compra.dto.ts:29`, `create-devolucion.dto.ts`, `create-ajustes_inventario.dto.ts`). Columnas: dinero `Decimal(10,2)` (máx. 99 999 999.99), costo `Decimal(10,4)`, cantidades `Decimal(12,3)`.
- **Escenario:** (a) un monto con un cero de más (`1000000000`) o una cantidad enorme desborda la columna → error de PostgreSQL 22003 → "Internal server error" (COD-03). (b) `efectivo_declarado = 99.996` con esperado 100: `desc_abs = 0.004 > 0.001` (`cajas_turnos.service.ts:205`) crea un `AJUSTE_FALTANTE` cuya columna `monto` guarda `0.00`. (c) `monto = 10.123` se guarda 10.12 pero `efectivo_esperado` se decrementa con 10.123 en la misma operación (consistente solo por redondeo posterior). (d) `costo_unitario_adquisicion = 0.33333` se guarda 0.3333 pero `monto_total` de la compra (`compras.service.ts:37-45`) se calcula con 0.33333.
- **Impacto:** 500 sin explicación y movimientos de $0.00 que ensucian el libro; costos con más precisión en el monto que en el lote.
- **Corrección sugerida:** `@IsNumber({ maxDecimalPlaces: 2 })` + `@Max` en dinero, `maxDecimalPlaces: 4` en costo, `@Max(999999999)` en cantidades; en `compras.service.ts` calcular el monto con el costo ya redondeado a 4 decimales y el total a 2.

### COD-13 — La UI no puede vender ni crear cantidades fraccionarias

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `ProductDialog.tsx:155` y `:348` (`parseInt(...) || 1`), `EditProductDialog.tsx:226` (`parseInt(e.target.value) || 1`, `min="1"`); `CartLines.tsx:462,474` y `cartStore.ts:29` (solo ±1 por vez, sin campo de cantidad). El backend acepta 3 decimales.
- **Escenario:** crear "Media libra" con `factor_conversion = 0.5` → el campo es `type=number min=1`, `parseInt("0.5")` = 0 → se guarda 1. Vender 0.75 lb de un producto a granel es imposible: el carrito solo sube de 1 en 1.
- **Impacto:** el requisito de "media libra/granel" que sustenta todo el modelo `Decimal(12,3)` no es operable desde la pantalla; hoy solo se alcanza por API.
- **Corrección sugerida:** `Number()` con `step="0.001"` y `min="0.001"` en los formularios; campo de cantidad editable (decimal) en `CartLines`.

### COD-14 — Reportes de ingresos no cuadran con las devoluciones

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `stats/page.tsx:50,327,528-531` muestra "Ingreso bruto" y "Costo FIFO" seguidos de "Utilidad bruta", pero la interfaz `EstadoResultados` (`:49-64`) ni siquiera declara `devoluciones`, que el backend sí devuelve (`reportes.service.ts:177-186`). `getProductosTop` (`reportes.service.ts:397-403`) suma `detalle.subtotal`, `unidades` y costo FIFO sin restar `detalle_devoluciones`.
- **Escenario:** mes con $1 000 de ventas y $100 devueltos con costo $60 reingresado: la pantalla muestra Ingreso $1 000, Costo (neto) $540 y Utilidad bruta $360, que no es 1 000 − 540; en "Productos top" el producto devuelto conserva ingreso, unidades y margen completos.
- **Impacto:** la dueña no puede reconciliar el P&L a ojo y el ranking/margen por producto sobreestima lo devuelto.
- **Corrección sugerida:** agregar una fila "Devoluciones" al P&L; en `getProductosTop` restar por línea lo devuelto (cantidad, `subtotal_reembolsado`, `costo_revertido` de REINGRESO).

### COD-15 — Movimientos: turno CERRADA_FORZADA se muestra "en curso" y se excluye del descuadre

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `movimientos/page.tsx:168` (`filter(t => t.estado === 'CERRADA')` para `descuadreTotal`) y `:377` (`turno.estado === 'CERRADA' ? ...cierre/descuadre... : "Turno en curso"`).
- **Escenario:** el admin fuerza el cierre de un turno abandonado (la situación de mayor sospecha) → la tarjeta dice "Turno en curso", sin efectivo declarado ni descuadre, y su faltante no suma al "Desc." del encabezado.
- **Impacto:** los cierres forzados, los más importantes de auditar, quedan invisibles en la pantalla de control.
- **Corrección sugerida:** tratar `CERRADA` y `CERRADA_FORZADA` igual en ambos puntos y mostrar una etiqueta "Cierre forzado".

### COD-16 — Abrir caja con dinero de la bóveda no tiene UI

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `desde_boveda` solo existe en `create-caja_turno.dto.ts:20` y `cajas_turnos.service.ts:24-90`; ninguna pantalla lo envía (`grep` en el frontend: 0 resultados). `pos/page.tsx:629-630` dice "Si sacaste dinero de la bóveda para el fondo, regístralo con 'Sacar dinero'", pero `SacarDineroDialog` mueve de la gaveta a bóveda/gasto/retiro (sentido contrario) y exige turno abierto.
- **Escenario:** la dueña saca $50 de la bóveda para completar el fondo, abre con $150 (fondo anterior $100) y sigue la instrucción: "Sacar dinero → Guardar en bóveda" mete $50 *a* la bóveda. El saldo derivado de la bóveda queda $100 más alto que el real (arqueo mostrará faltante).
- **Impacto:** la bóveda y el patrimonio se descuadran por un flujo normal que el sistema no puede registrar.
- **Corrección sugerida:** añadir al diálogo de apertura el campo "Tomado de la bóveda" (envía `desde_boveda`) y corregir el texto.

### COD-17 — POS: cualquier error se toma como "no hay caja"; cierre OK + reapertura fallida deja estado obsoleto

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `pos/page.tsx:128-143` (`catch {` sin distinguir 404 de red/500 → `setCajaActiva(null)`); `:209-238`: tras el `PATCH /cerrar` exitoso, si el `POST /abrir` de `:220-223` falla, el `catch` solo muestra un toast y no recarga ni cierra el diálogo.
- **Escenario A:** un fallo de red momentáneo en `/cajas-turnos/activa` hace aparecer "Debes abrir un turno de caja antes de vender" con la caja ya abierta; "Abrir caja" devuelve 409.
- **Escenario B:** cierra el turno, la reapertura automática falla (red) → la pantalla sigue mostrando "Caja abierta" con el turno ya cerrado; reintentar el cierre da "Este turno de caja ya se encuentra cerrado" y las ventas fallan con "No hay turno de caja abierto".
- **Impacto:** confusión en el punto de venta; solo se sale recargando la página.
- **Corrección sugerida:** distinguir 404 del resto en `loadCaja` (mostrar "No pude verificar la caja, reintenta"); en el `catch` del cierre llamar `loadCaja()` y cerrar el diálogo, informando "El turno quedó cerrado; abre uno nuevo".

### COD-18 — Usuarios: token vigente tras borrar o cambiar de rol; errores tragados; `DELETE` devuelve el hash

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `jwt.strategy.ts:27-33` (`validate` no consulta la BD); `usuarios.service.ts:115,125` (`catch {` convierte cualquier error en "Usuario con ID … no encontrado"); `:122` (`return await this.prisma.usuarios.delete(...)` devuelve la fila completa, con `password_hash`); `auth.module.ts` (token de 12 h).
- **Escenario:** (1) se borra a una cajera con sesión abierta: durante 12 h su token sigue válido y cada `POST /ventas` falla en el FK `usuario_id` (P2003 → "La operación viola una relación…"). (2) Un admin degradado a CAJERO conserva permisos de admin hasta que expire el token. (3) Renombrar a un usuario con un nombre existente responde "Usuario no encontrado" en vez de "ya existe". (4) La respuesta de `DELETE /usuarios/:id` incluye el hash de la contraseña. (5) Se puede borrar o degradar al único ADMIN.
- **Impacto:** cuentas dadas de baja que siguen operando y ventas que fallan con mensajes sin sentido.
- **Corrección sugerida:** en `validate` comprobar que el usuario existe (y usar el rol de la BD); en `update`/`remove` capturar solo P2025/P2002; devolver `excludePasswordHash`; impedir eliminar o degradar al último ADMIN.

### COD-19 — Cuentas por pagar no se pueden pagar; activos fijos no tienen API

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:** `compras.service.ts:78-85` crea `cuentas_por_pagar` con `saldo_pendiente = monto`; es el único escritor (`grep cuentas_por_pagar src/` solo da compras y `reportes.service.ts:260`). No hay módulo ni endpoint de pago. `reportes.service.ts:254` suma `activos_fijos`, que no tiene controller ni UI.
- **Escenario:** compra a crédito de $300 → deuda $300 para siempre; al pagar al proveedor no hay dónde registrarlo y el patrimonio neto queda $300 por debajo del real indefinidamente. Los activos fijos siempre valen $0.
- **Impacto:** el patrimonio (§8.4) mezcla una deuda imposible de saldar y un componente que no se puede capturar.
- **Corrección sugerida:** endpoint de abono (`PAGO_PROVEEDOR` desde gaveta/bóveda que reduzca `saldo_pendiente` con lock) o dejar de ofrecer "Al crédito" en la UI hasta que exista; igual criterio para activos fijos.

### COD-20 — Mensajes de error con IDs técnicos, en inglés o genéricos

- **Severidad:** 🟡 · **Confianza:** Confirmado
- **Evidencia:**
  - IDs técnicos: `ventas.service.ts:136` ("Stock insuficiente para el producto ID 12. Faltan 2.000 unidades base."), `:90` ("Presentación con ID …"), `:419` y `:432` ("La línea 45 …"), `ajustes_inventario.service.ts` ("Lote con ID …").
  - Genéricos: `prisma-exception.filter.ts:38-41` ("La operación viola una relación con otro registro existente", p. ej. borrar un producto o una categoría de gasto con historial; `productos.service.ts` y `categorias_gastos.service.ts` no la mapean).
  - Inglés: `lib/api.ts:40` muestra `errorBody.message` tal cual (class-validator: "cantidad must not be less than 0.001"; Nest: "Forbidden resource", "Internal server error"); un fallo de red muestra "Failed to fetch".
- **Escenario:** vender más unidades de las que hay: la cajera lee "producto ID 12… unidades base". Devolver lo que ya se devolvió: "No se puede devolver 2.000 de la línea 45: vendidas 3.000, ya devueltas 2.000"; además `DevolucionDialog.tsx:153` permite escribir hasta lo vendido, sin saber lo ya devuelto.
- **Impacto:** contradice el principio de producto; la cajera no sabe qué hacer.
- **Corrección sugerida:** incluir el nombre del producto en el mensaje de stock ("No alcanza «Arroz 1 lb»: quedan 3"), traducir/envolver los mensajes de validación, `catch` de red con "Sin conexión con el servidor", y devolver en `/ventas` las cantidades ya devueltas para limitar el máximo en el diálogo.

### COD-21 — Listados sin paginación

- **Severidad:** 🟡 · **Confianza:** Probable (crece con el uso)
- **Evidencia:** `ventas.service.ts:205` (`findAll` trae todas las ventas con detalles y presentaciones); `cajas_turnos.service.ts:258-268` (`include: { movimientos_financieros: true }` de **todos** los turnos); `productos.service.ts:30-45` (todos los lotes, incluso agotados); `Movimientos` pide todo (`movimientos/page.tsx:114-117`) aunque el filtro por defecto sea "últimos 7 turnos"; `POS` y `Inventario` cargan el catálogo completo.
- **Escenario:** ~100 ventas/día → ~36 000 ventas con detalle al año, cargadas completas en cada visita a Movimientos; los lotes agotados se acumulan y el catálogo del POS crece sin límite.
- **Impacto:** pantallas cada vez más lentas en el celular de la tienda y más presión sobre las transacciones (COD-03).
- **Corrección sugerida:** `take`/rango de fechas en `findAll` de ventas y turnos, devolver solo lotes con `cantidad_disponible > 0` en el catálogo del POS.

---

## ⚪ Menores

### COD-22 — Entradas que el controller lee fuera del DTO o no valida

- **Severidad:** ⚪ · **Confianza:** Confirmado
- **Evidencia:** `ventas.controller.ts:42-47` (`@Body('justificacion_nula')` sin DTO: un número u objeto llega a Prisma como `String` y da 500; solo espacios se acepta como justificación válida), `:36,47,56` y otros controllers (`usuarios`, `ajustes_inventario`, `movimientos_financieros`) usan `+id` sin `ParseIntPipe` (`/ventas/abc` → `NaN` → error de validación de Prisma, 500; `ventas.findOne` devuelve `null` con 200 si no existe); `movimientos_financieros.controller.ts:32` y `reportes.controller.ts:40` (`parseInt(limit)` con `NaN` → `take: NaN` / `slice(0, NaN)`); `create-venta.dto.ts` acepta `fecha` sin límite inferior (una venta de contingencia fechada en 2019 o anterior a la apertura del turno cae en otro período de los reportes).
- **Impacto:** 500 en lugar de 400/404 y datos de contingencia mal fechados por un typo.
- **Corrección sugerida:** DTO para anular (`@IsString @IsNotEmpty @MaxLength` con `trim`), `ParseIntPipe` en todos los `:id`, `@Query` con DTO (`@IsInt @Min(1) @Max(200)`), y rechazar `fecha` anterior a, p. ej., 7 días.

### COD-23 — Strings: código de barras con espacio, imposible borrar un código, faltan `MaxLength`

- **Severidad:** ⚪ · **Confianza:** Confirmado
- **Evidencia:** `ProductDialog.tsx:152,347` (`pres.codigo_barras || undefined` no hace `trim`: `" "` se guarda como código único); `EditProductDialog.tsx:113` (`codigo_barras?.trim() || undefined` → un campo vaciado se omite del PATCH y el código **no se borra**); `create-presentacion.dto.ts:22` no usa `@IsNotEmpty` en el código (la API acepta `""` y el segundo `""` responde "El código de barras ya existe"); sin `@MaxLength` en `create-compra.dto.ts:43` (`proveedor`, `VarChar(150)`) ni `create-usuario.dto.ts:6` (`nombre`, `VarChar(100)`) → error de longitud de Postgres (500).
- **Impacto:** la cajera no puede liberar un código mal escrito, y un espacio accidental bloquea el siguiente producto sin código.
- **Corrección sugerida:** `trim()` + `|| null` en el servicio (enviando `null` explícito para borrar), `@Transform` de strings vacíos a `undefined` en el DTO y `@MaxLength` acorde a cada columna.

### COD-24 — Código muerto o riesgoso

- **Severidad:** ⚪ · **Confianza:** Confirmado
- **Evidencia:**
  - `erp-tienda-backend/query_test.ts:2` — `new PrismaClient()` sin `adapter` (Prisma 7 lo exige) y se compila a `dist/query_test.js` porque `tsconfig.build.json` no lo excluye. No se usa.
  - `scripts/rollback_test_data.sql` borra de `caja_general` (tabla eliminada en 1.C: el script falla y la transacción queda abortada) y filtra por `id >= 99000`, que algún día coincidirá con datos reales; no limpia `devoluciones`/`detalle_devoluciones`/`ajustes_inventario`/`historial_precios_presentaciones`. `fase2_auditoria.sql` y `audit_results.txt` consultan tipos obsoletos (`'INGRESO'`/`'EGRESO'`, `caja_general`).
  - `Dockerfile:24` — `prisma db push --accept-data-loss && npm run start:dev`: si ese contenedor apunta a la BD real, un cambio de esquema puede borrar columnas/datos sin pedir confirmación, y corre en modo watch.
  - Endpoints sin consumidor en el frontend: `GET /cajas-turnos/:id/resumen` (además cuenta ventas ANULADAS en `total_ventas`/`count_ventas`, `cajas_turnos.service.ts:301-307`), `GET /ventas/:id`, `GET /ajustes-inventario`, `GET /compras/:id`, `DELETE` de productos/presentaciones; el rol `VENDEDOR` aparece en guards y navegación pero `CreateUsuarioDto` solo permite `ADMIN|CAJERO`.
- **Impacto:** nadie debería ejecutar esos scripts contra producción; el resumen de turno daría cifras erróneas el día que alguien lo use.
- **Corrección sugerida:** borrar `query_test.ts` y los scripts SQL obsoletos (o moverlos a `docs/` marcados como históricos), usar `prisma migrate deploy` + `start:prod` en el contenedor de producción, y filtrar `estado: 'COMPLETADA'` en `getResumen` o eliminarlo.

### COD-25 — Edición de producto y de precio no atómica

- **Severidad:** ⚪ · **Confianza:** Confirmado
- **Evidencia:** `EditProductDialog.tsx:92-119` hace un `PATCH /productos/:id` y luego un `PATCH` por presentación; `presentaciones.service.ts:50-64` actualiza el precio y **después**, fuera de transacción, inserta el historial leyendo `actual` antes del `update`.
- **Escenario:** si falla un PATCH intermedio (p. ej. COD-02), el producto ya cambió pero el diálogo no refresca (`onSuccess` no se llama). Dos ediciones simultáneas de precio pueden registrar un `precio_anterior` que no fue el real; si el insert del historial falla, el cambio de precio queda sin rastro.
- **Impacto:** historial de precios incompleto y pantallas desactualizadas tras un error parcial.
- **Corrección sugerida:** envolver `update` + historial en `$transaction` (leyendo el precio actual dentro, con `FOR UPDATE`); en el diálogo llamar `onSuccess()` también si hubo cambios parciales.

---

## Observaciones sin hallazgo

Revisadas y sin defecto de lógica encontrado: `abrir()` con advisory lock y revalidación; `cerrar()`; `anular()`/`devolver()` (orden turno → venta); `saldoBovedaDerivado` y su advisory lock en todos los escritores que validan fondos; mapeo `GAVETA/BOVEDA` de `compras`; `getEfectivoGaveta` y `getFlujoEfectivo`; límites de día en zona horaria; el guard de rutas por rol del dashboard (solo UX, el backend autoriza); aritmética `efectivo_esperado ± monto` (con una base de 2 decimales el redondeo por operación es consistente con el de la columna, por eso COD-11 no reporta deriva acumulada de caja).
