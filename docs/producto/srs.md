# Documento de Especificación de Requerimientos (SRS) — v3.0

> **Estado (2026-07-08):** este documento **refleja el sistema construido**. Reemplaza a
> la v2.0 (que describía una fase de diseño ya superada) e incorpora las decisiones de la
> [auditoría técnica](../auditorias/2026-07-02-auditoria-tecnica.md) y la
> [auditoría de negocio/contable](../auditorias/2026-07-04-auditoria-negocio-contable.md),
> más los Bloques 1–3 de endurecimiento. Fuente de verdad viva del **qué** y el **porqué**;
> el detalle de implementación está en [`../architecture/`](../architecture/),
> [`../domain/`](../domain/), [`../modelo-contable/`](../modelo-contable/) y los
> [ADRs](../decisions/). Si el código contradice a este documento, gana el código y se
> actualiza aquí.

**Proyecto:** Sistema ERP (POS, Inventario FIFO y Contabilidad) para una tienda de colonia
**Ubicación:** El Salvador · **Usuaria:** dueña no-contadora; la meta es llevar el negocio
más fácil y saber si es rentable — no un ERP enterprise.
**Fase actual:** construido y en endurecimiento; pre primera venta real.

## 1. Visión general y arquitectura

### 1.1 Propósito

Gestión integral para la alta transaccionalidad de una tienda de colonia: automatizar el
Punto de Venta (POS), resolver el fraccionamiento de inventario (fardos↔unidades, y venta
por peso) con lotes **FIFO**, y producir números **reales y verificables** — utilidad,
patrimonio y flujo de efectivo — para responder la pregunta central de la dueña:
**"¿dónde está mi dinero y estoy ganando?"**.

### 1.2 Stack tecnológico (decidido)

* **Backend:** **NestJS + Prisma** (TypeScript) sobre **PostgreSQL**. La "decisión pendiente
  Python vs Node" de la v2.0 ya no existe: hay un backend completo con transacciones, locks
  y ADRs. Relitigarlo sería tirar el activo más valioso del proyecto.
* **Frontend:** **Next.js (React)**, mobile-first (la pantalla estrella es el POS).
* **Base de datos:** PostgreSQL en **Supabase**.
* **Despliegue:** **agnóstico de proveedor** — todo por variables de entorno (se evalúa GCP
  para el API; Supabase para la BD). Ver [`../operations/configuration.md`](../operations/configuration.md).
* **Hardware en sitio:** laptop reutilizada + lector de código de barras (USB/Bluetooth).
* **Talón de Aquiles conocido:** 100% cloud → cada venta necesita internet. No se hace
  offline-first (sobreingeniería); en su lugar hay un **modo contingencia** diseñado
  (ver §2.1 y [`../domain/modo-contingencia.md`](../domain/modo-contingencia.md)).

## 2. Lógica de negocio y requerimientos

### 2.1 Módulo POS y control de caja

La caja (turno) es una entidad temporal que **audita a los cajeros**, no la cuenta del
negocio. Solo **efectivo**, a propósito (sin tarjeta, transferencia ni fiado — decisión de
producto, [`../domain/caja-y-ventas.md`](../domain/caja-y-ventas.md)).

* **REQ-POS-01 (Ventas):** registro rápido por código de barras o botón. Cantidades
  **fraccionables** (`Decimal`): media libra de queso, granel. Motor FIFO con bloqueo
  pesimista (`FOR UPDATE`) que evita sobreventa concurrente ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
* **REQ-POS-02 (Apertura):** cada turno es independiente; se ingresa el fondo inicial físico.
  Opcionalmente se toma fondo **de la bóveda** (`TRASLADO_DESDE_BOVEDA`). La apertura ya
  **no** inventa faltantes/inyecciones comparando contra el último cierre (fuga corregida en
  Bloque 1.E).
* **REQ-POS-03 ("Sacar dinero"):** un solo botón con tres opciones contablemente distintas:
  *Guardar en bóveda* (`RETIRO_BOVEDA`, traslado entre activos), *Pagar algo*
  (`EGRESO_OPERATIVO`, gasto del P&L) y *Retiro personal* (`RETIRO_PERSONAL`, **débito a
  patrimonio** — no es gasto ni infla la bóveda). Reemplaza el concepto ambiguo de "sangría".
* **REQ-POS-04 (Cierre / Corte Z):** el sistema calcula el efectivo esperado; la cajera
  declara el contado. El **excedente se traslada a bóveda** (`TRASLADO_A_BOVEDA`) y el resto
  queda como fondo del próximo turno. El descuadre real se registra como `AJUSTE_FALTANTE`/
  `AJUSTE_SOBRANTE`.
* **REQ-POS-05 (Umbral de tolerancia):** un descuadre **≥ $1.00** (configurable) exige
  justificación; por debajo, ajuste automático sin fricción. La diferencia **siempre** se
  registra (para detectar faltantes chiquitos diarios). Reemplaza la exigencia hostil "por
  $0.01" de la v2.0.
* **REQ-POS-06 (Cierre forzado):** un ADMIN puede cerrar un turno abandonado declarando el
  efectivo contado + justificación → estado `CERRADA_FORZADA`.
* **REQ-POS-07 (Contingencia):** una venta puede registrarse con su **fecha/hora real**
  (apagón) contra el turno actual; el backend rechaza fechas futuras.
* **REQ-POS-08 (Trazabilidad):** cada turno, venta, movimiento y ajuste guarda el
  `usuario_id` autor (con dos cajeras, se sabe en el turno *de quién* pasó algo).

### 2.2 Módulo de inventario (el core)

Separa el producto conceptual, su presentación comercial y su existencia física.

* **REQ-INV-01 (Unidad mínima):** el stock se rastrea en la unidad base más pequeña.
* **REQ-INV-02 (Presentaciones):** un producto tiene varias presentaciones (código de barras
  y precio propios); la venta del fardo descuenta las unidades base equivalentes. Cada
  presentación lleva **historial de precios** (Bloque 3.C).
* **REQ-INV-03 (Lotes FIFO):** el stock se divide en lotes de compra; la venta descarga del
  más antiguo primero (`fecha_ingreso`, desempate determinista por `id`), congelando el costo
  real (COGS) en `detalle_venta_lotes`.
* **REQ-INV-04 (Mermas y ajustes):** merma (`MERMA_INVENTARIO`) descuenta del lote e impacta
  el P&L como pérdida, **sin depender de un turno abierto** (Bloque 2.A). Ajustes **positivos**
  (`CONTEO_SOBRANTE`, conteo físico) que **incrementan** el lote (Bloque 2.D).
* **REQ-INV-05 (Carga inicial):** flujo guiado de "inventario inicial" — una compra con origen
  `CAPITAL_DUEÑOS` (aporte en especie, sin salida de caja).
* **REQ-INV-06 (Devoluciones):** una devolución de cliente **post-turno** ligada a la venta
  original revierte el costo FIFO al lote exacto y reembolsa del turno actual; por línea se
  elige **reingresar** al stock (revendible) o **merma** (descartado) — Bloque 3.B.

### 2.3 Módulo de compras y proveedores

* **REQ-COM-01 (Ingreso de mercadería):** registra la compra creando lotes con cantidad,
  costo exacto y fecha; el `monto_total` se calcula en el backend (no se confía en el cliente).
* **REQ-COM-02 (Origen de fondos):** *Caja POS* (egreso del turno, `PAGO_PROVEEDOR`
  GAVETA→PROVEEDOR), *Bóveda* (BOVEDA→PROVEEDOR, sin turno) o *Capital dueños* (aporte en
  especie). Cada rama valida fondos bajo lock.
* **REQ-COM-03 (Cuentas por pagar):** compras `AL_CREDITO` generan una deuda con saldo
  pendiente (gestionable a futuro).

### 2.4 Módulo de contabilidad y finanzas

Contabilidad administrativa real, no un simple flujo de caja.

* **REQ-FIN-01 (Modelo origen→destino):** **todo** movimiento de efectivo declara
  `cuenta_origen` y `cuenta_destino` de un catálogo cerrado (`GAVETA`, `BOVEDA`, `DUEÑOS`,
  `GASTO`, `PROVEEDOR`). Es la "partida doble mínima": el efectivo se conserva por
  construcción. La **bóveda es derivada** del libro (se eliminó la tabla `caja_general`).
* **REQ-FIN-02 (Gastos operativos):** categorizados; pagables desde **gaveta o bóveda**.
* **REQ-FIN-03 (Capital y retiros):** inyección de capital (`INGRESO_CAPITAL`, con su asiento);
  retiro personal como distribución de patrimonio (no baja la utilidad, se reporta aparte).
* **REQ-FIN-04 (Arqueo de bóveda):** el ADMIN declara el efectivo físico contado en la bóveda;
  si difiere del derivado, registra un ajuste que lo reconcilia (respuesta *verificable*, no
  solo calculada).
* **REQ-FIN-05 (Estado de resultados):** utilidad bruta y **neta** reales en tiempo real:
  `ingreso − devoluciones − COGS(FIFO) − gastos − mermas − faltantes + sobrantes`; los retiros
  de dueños se muestran aparte. Faltantes/sobrantes **sí** afectan la utilidad (señal de robo
  hormiga) — corregido en Bloque 2.A.
* **REQ-FIN-06 (Patrimonio):** foto de balance al instante:
  `Inventario + Efectivo(gaveta+bóveda) + Activos fijos − Deudas`. Los activos fijos se valúan
  a su valor estimado, **sin depreciación** (decisión consciente a esta escala).
* **REQ-FIN-07 (Flujo de efectivo):** entradas y salidas por cuenta (gaveta, bóveda) y período,
  derivadas del modelo origen/destino + ventas y devoluciones.

## 3. Modelo de datos (entidades principales)

* **Catálogo:** `productos`, `categorias`, `presentaciones` (+ `historial_precios_presentaciones`).
* **Inventario:** `lotes_inventario` (stock físico, costo real, `fecha_ingreso` NOT NULL).
* **Caja/ventas:** `cajas_turnos` (con `CERRADA_FORZADA`), `ventas` / `detalle_ventas` /
  `detalle_venta_lotes` (puente costo FIFO), `devoluciones` / `detalle_devoluciones`.
* **Inventario ajustes:** `ajustes_inventario` (mermas y conteos).
* **Compras:** `compras_inventario`, `cuentas_por_pagar`.
* **Finanzas:** `movimientos_financieros` (libro origen→destino; la bóveda se deriva de aquí),
  `categorias_gastos`, `activos_fijos`.
* **Seguridad:** `usuarios` (roles ADMIN/CAJERO); `usuario_id` en las tablas transaccionales.
* **Nota:** la tabla `caja_general` de la v2.0 **ya no existe** — el saldo de bóveda se deriva.

## 4. Requisitos no funcionales

* **Concurrencia:** bloqueo pesimista (`FOR UPDATE` / advisory locks), orden
  lock-antes-de-INSERT ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
* **Seguridad:** JWT con roles, rate-limiting, Helmet, CORS por allowlist, seed de admin por
  env ([`../architecture/security.md`](../architecture/security.md)).
* **Índices** por patrón de consulta real ([ADR 0005](../decisions/0005-indices-bd.md));
  filtro global de excepciones Prisma ([ADR 0006](../decisions/0006-filtro-excepciones-prisma.md)).
* **Testing/CI:** suite e2e sobre las invariantes críticas (FIFO, turnos, bóveda, P&L,
  devoluciones, contingencia) + CI en cada push ([ADR 0009](../decisions/0009-testing-docker-ci.md)).
* **Precisión monetaria:** `Decimal` en dinero y cantidades (nunca floats).

## 5. Decisiones y alcance diferido (consciente)

* **Sin migraciones Prisma hasta producción** ([ADR 0002](../decisions/0002-sin-migraciones-hasta-produccion.md));
  hoy el schema se sincroniza con `db push`.
* **Constraints e inmutabilidad a nivel BD** (CHECK de stock, unicidad de turno abierto,
  `REVOKE UPDATE/DELETE` sobre tablas de libro): documentadas, se aplican con el baseline de
  producción ([`../roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md)).
* **Backup automatizado (`pg_dump`) + hosting sin cold starts:** pendiente antes de la primera
  venta real (Bloque 2.E, diferido por decisión de nube/secrets).
* **Fuera de alcance salvo que el negocio lo pida:** depreciación de activos, módulo fiscal/DTE
  (El Salvador), multi-tienda (`tienda_id`), offline-first real.

## 6. Historial de versiones

* **v3.0 (2026-07-08):** reescritura para reflejar el sistema construido (NestJS/Prisma) y los
  Bloques 1–3 (modelo de efectivo origen/destino, retiro personal, traslados, faltantes al
  P&L, umbral y cierre forzado, arqueo, ajustes positivos, patrimonio, flujo de efectivo,
  devoluciones, historial de precios, contingencia, trazabilidad de autor).
* **v2.0:** documento de diseño (quedó detrás del código); congelado en el historial de git.
