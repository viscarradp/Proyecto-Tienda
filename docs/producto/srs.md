# Documento de Especificación de Requerimientos (SRS) — v3.2

> Visión y requisitos de alto nivel. El detalle de cada regla está en [`../domain/`](../domain/caja-y-ventas.md) (índice por
> tema), [`../architecture/`](../architecture/) y los [ADRs](../decisions/). Si el código contradice a este documento, gana
> el código y se actualiza aquí. Estado del proyecto y qué sigue: [`../roadmap/plan-fases.md`](../roadmap/plan-fases.md).

**Proyecto:** Sistema ERP (POS, Inventario FIFO y Contabilidad) para una tienda de colonia
**Ubicación:** El Salvador · **Usuaria:** dueña no-contadora; la meta es llevar el negocio
más fácil y saber si es rentable — no un ERP enterprise.
**Principios rectores:** **apoyar, no imponer** (ante la duda se registra y se avisa, no se bloquea) y **no sobreingeniería**.

## 1. Visión general y arquitectura

### 1.1 Propósito

Gestión integral para la alta transaccionalidad de una tienda de colonia: automatizar el
Punto de Venta, resolver el fraccionamiento de inventario (fardos↔unidades, venta por peso o por monto) con lotes **FIFO**
y producir números **reales y verificables** —utilidad, patrimonio y flujo de efectivo— para responder la pregunta central
de la dueña: **"¿dónde está mi dinero y estoy ganando?"**.

### 1.2 Stack tecnológico

* **Backend:** NestJS 11 + Prisma 7 (TypeScript) sobre PostgreSQL.
* **Frontend:** Next.js 16 (React 19), mobile-first (la pantalla estrella es Vender, el punto de venta).
* **Despliegue:** backend en **Render**, frontend en **Vercel** y base de datos en **Supabase**, con respaldo nocturno propio.
  Todo se configura por variables de entorno y `GET /salud` es el health check
  ([`../operations/deployment.md`](../operations/deployment.md), [`../operations/configuration.md`](../operations/configuration.md)).
* **Hardware en sitio:** laptop en modo kiosco con Linux Mint ([`../operations/laptop-pos.md`](../operations/laptop-pos.md)) y
  lector de código de barras (USB/Bluetooth).
* **Talón de Aquiles conocido:** 100% en la nube, cada venta necesita internet; no hay offline-first y se cubre con un
  proceso de contingencia ([`../domain/modo-contingencia.md`](../domain/modo-contingencia.md)).

## 2. Requerimientos

Pantallas: **Mi negocio** (entrada de la dueña), **Vender**, **Inventario**, **Gastos y deudas**, **Ventas y turnos** y
**Usuarios**.

### 2.1 Punto de venta y control de caja

Solo **efectivo**, a propósito, y **una sola gaveta** (un turno abierto a la vez). Detalle en
[`../domain/ventas-y-devoluciones.md`](../domain/ventas-y-devoluciones.md) y [`../domain/caja-y-turnos.md`](../domain/caja-y-turnos.md).

* **REQ-POS-01 (Ventas):** registro rápido por código de barras o botón, con cantidades fraccionables. El total lo calcula
  el backend y el FIFO evita la sobreventa concurrente ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
* **REQ-POS-01a (Venta por monto):** cada línea se vende por cantidad o por monto ("dame $1 de queso").
* **REQ-POS-01b (Vender sin stock):** si el sistema cree que no hay stock, se vende igual y se avisa; la falta queda como
  "deuda de stock" ([`../domain/inventario.md`](../domain/inventario.md)).
* **REQ-POS-01c (Alta rápida):** la cajera da de alta un producto con nombre + precio; queda "por revisar" hasta que la
  dueña lo complete.
* **REQ-POS-01d (Idempotencia):** un reintento tras un corte de red no duplica la venta.
* **REQ-POS-02 (Apertura):** se ingresa el fondo físico; si difiere de lo que quedó al último cierre, se indica el origen de
  la diferencia y siempre queda registrada, sin bloquear.
* **REQ-POS-03 ("Sacar dinero"):** un botón con cuatro opciones: guardar en la bóveda, pagar algo, sacar para mí y traer de
  la bóveda ([`../domain/dinero-y-cuentas.md`](../domain/dinero-y-cuentas.md)).
* **REQ-POS-04 (Cierre):** el sistema calcula el efectivo esperado, la cajera declara el contado, el excedente va a la
  bóveda y el resto queda como fondo del próximo turno.
* **REQ-POS-05 (Tolerancia):** un descuadre de $1.00 o más exige justificación; la diferencia siempre se registra.
* **REQ-POS-06 (Cierre forzado):** la dueña cierra un turno abandonado, con justificación.
* **REQ-POS-07 (Contingencia):** una venta del cuaderno se registra con su fecha y hora reales.
* **REQ-POS-08 (Trazabilidad):** todo registro guarda su autor y, en anulaciones y cierres forzados, el motivo.
* **REQ-POS-09 (Anulación y devolución):** la cajera anula ventas del turno abierto o las devuelve (total o parcial) con
  destino reingreso o merma; una venta con devoluciones no se anula.
* **REQ-POS-10 (Avisos):** lo que no se bloquea devuelve `avisos` legibles.

### 2.2 Inventario

* **REQ-INV-01 (Unidad mínima):** el stock se rastrea en la unidad base; la pantalla lo muestra en la unidad de la presentación.
* **REQ-INV-02 (Presentaciones):** varias presentaciones por producto, con código de barras, precio y factor decimal propios,
  e historial de precios.
* **REQ-INV-03 (Lotes FIFO):** la venta descarga del lote más antiguo y congela el costo real.
* **REQ-INV-04 (Mermas y conteos):** la cajera registra mermas con motivo obligatorio; los conteos (hacia abajo y hacia
  arriba) son solo de la dueña. Las mermas bajan la utilidad y no dependen de un turno abierto.
* **REQ-INV-05 (Carga inicial):** el inventario inicial se registra como una compra con origen `CAPITAL_DUEÑOS`.
* **REQ-INV-06 (Devoluciones):** la devolución vuelve al lote exacto o se descarta como merma, y se reembolsa del turno actual.
* **REQ-INV-07 (Deuda de stock):** lo vendido sin stock se cubre cuando entra una compra o un conteo sobrante.
* **REQ-INV-08 (Por revisar):** los productos de alta rápida se marcan hasta que la dueña los revisa.

### 2.3 Compras y proveedores

Solo la dueña registra compras ([`../domain/dinero-y-cuentas.md`](../domain/dinero-y-cuentas.md)).

* **REQ-COM-01 (Ingreso de mercadería):** la compra crea lotes con cantidad, costo y fecha; el monto total lo calcula el backend.
* **REQ-COM-02 (Origen de fondos):** una compra pagada exige origen (gaveta, bóveda o capital de la dueña); si el saldo no
  alcanza, se registra y se avisa ([ADR 0011](../decisions/0011-registrar-y-avisar.md)).
* **REQ-COM-03 (Compras a crédito):** no mueven efectivo y generan una deuda con saldo pendiente.
* **REQ-COM-04 (Deudas con proveedores):** lista de deudas y abonos desde la gaveta o la bóveda; el abono no supera el saldo.
* **REQ-COM-05 (Bot de Telegram):** la dueña registra una compra escribiendo o mandando la foto de la factura; el bot
  interpreta, muestra el borrador y solo guarda cuando ella confirma ([`../domain/bot.md`](../domain/bot.md)).

### 2.4 Contabilidad y finanzas

Detalle en [`../domain/dinero-y-cuentas.md`](../domain/dinero-y-cuentas.md) y [`../domain/reportes.md`](../domain/reportes.md).

* **REQ-FIN-01 (Origen→destino):** todo movimiento de efectivo declara cuenta de origen y de destino (`GAVETA`, `BOVEDA`,
  `DUEÑOS`, `GASTO`, `PROVEEDOR`); la bóveda se deriva del libro.
* **REQ-FIN-02 (Gastos):** categorizados (por defecto "Otros"); pagables desde la gaveta o la bóveda.
* **REQ-FIN-03 (Capital y retiros):** aportes de capital y retiros de la dueña; el retiro no baja la utilidad.
* **REQ-FIN-04 (Arqueo de bóveda):** la dueña declara el efectivo contado y el sistema registra la diferencia.
* **REQ-FIN-05 (Estado de resultados):** utilidad bruta y neta reales, con faltantes y sobrantes incluidos.
* **REQ-FIN-06 (Patrimonio):** foto al instante de inventario + efectivo + activos fijos − deudas, sin depreciación.
* **REQ-FIN-07 (Flujo de efectivo):** entradas y salidas por cuenta y período.
* **REQ-FIN-08 (Política de fondos):** ninguna salida de efectivo se rechaza por saldo insuficiente: se registra y se avisa.
* **REQ-FIN-09 (Día del negocio):** los reportes agrupan por día en la zona horaria del negocio (`ZONA_HORARIA_NEGOCIO`).
* **REQ-FIN-10 (Mi negocio):** la pantalla de entrada de la dueña responde primero "¿gané o perdí?" y "qué hacer", y luego
  muestra cuánto dinero hay en la gaveta y la bóveda y cuánto se debe ([`../domain/reportes.md`](../domain/reportes.md)).

### 2.5 Usuarios y permisos

Detalle en [`../domain/roles-y-permisos.md`](../domain/roles-y-permisos.md).

* **REQ-USR-01 (La cajera opera, la dueña controla):** la cajera vende, anula ventas, devuelve, abre y cierra caja, paga
  gastos chicos desde la gaveta y registra mermas con motivo. Lo demás es de la dueña: retiro personal, aporte de capital,
  movimientos de la bóveda, compras, precios y catálogo, conteos de inventario, reportes, deudas con proveedores, usuarios y
  anular compras, movimientos o mermas.
* **REQ-USR-02 (Usuarios desactivables):** no se borran, se desactivan; no se puede desactivar a uno mismo ni dejar el
  sistema sin una dueña activa.
* **REQ-USR-03 (Validación por request):** usuario y rol se validan contra la base en cada request.

## 3. Modelo de datos

Entidades y relaciones en [`../architecture/data-model.md`](../architecture/data-model.md): catálogo, inventario por lotes,
ventas y devoluciones, caja y dinero (`movimientos_financieros` como libro origen→destino), compras y deudas, ajustes de
inventario, usuarios y bot de Telegram.

## 4. Requisitos no funcionales

* **Concurrencia:** bloqueo pesimista y orden de locks turno → venta → lotes → pendientes ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
* **Seguridad:** JWT con roles validados contra la base, rate-limiting, Helmet, CORS por allowlist, configuración de
  producción que falla cerrada ([`../architecture/security.md`](../architecture/security.md)).
* **Rendimiento a escala de tienda:** historial paginado por cursor e índices por patrón de consulta
  ([ADR 0005](../decisions/0005-indices-bd.md)).
* **Pruebas:** suite e2e sobre las invariantes críticas y CI en cada push ([`../operations/testing.md`](../operations/testing.md)).
* **Recuperación:** respaldo nocturno cifrado con ensayo de restauración ([`../operations/respaldos.md`](../operations/respaldos.md)).
* **Precisión monetaria:** `Decimal` en dinero y cantidades, nunca floats.

## 5. Decisiones y alcance diferido

* **Sin migraciones Prisma hasta producción** ([ADR 0002](../decisions/0002-sin-migraciones-hasta-produccion.md)).
* **Constraints e inmutabilidad a nivel de base** (CHECK de stock, unicidad de turno abierto, `REVOKE UPDATE/DELETE` sobre
  tablas de libro): se aplican con el baseline de producción ([`../roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md)).
* **Fuera de alcance salvo que el negocio lo pida:** depreciación de activos, módulo fiscal/DTE (El Salvador), multi-tienda,
  dos cajas simultáneas, offline-first real, fiado a clientes y pagos con tarjeta o transferencia.
* Lo que sigue por construir está en [`../roadmap/backlog-ciclo-2026-11.md`](../roadmap/backlog-ciclo-2026-11.md#1-pendiente).

## 6. Historial de versiones

* **v3.2 — 2026-11-26:** el SRS queda como visión y requisitos de alto nivel, sin duplicar `domain/`; suma el bot de Telegram, Mi negocio y la laptop en modo kiosco, y corrige el despliegue (Render, Vercel, Supabase) y los permisos de mermas.
