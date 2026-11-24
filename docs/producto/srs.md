# Documento de Especificación de Requerimientos (SRS) — v3.1

> **Estado (2026-11-24):** este documento **refleja el sistema construido**. La v3.0 (2026-07-08) incorporó la
> [auditoría técnica](../auditorias/2026-07-02-auditoria-tecnica.md), la
> [auditoría de negocio/contable](../auditorias/2026-07-04-auditoria-negocio-contable.md) y los Bloques 1–3 de endurecimiento;
> esta **v3.1** suma el **Ciclo 2026-11** (4 auditorías, 7 decisiones de la dueña y los lotes L1–L8): venta por monto y por peso,
> venta sin stock, alta rápida, política "registrar y avisar", permisos D-06, deudas con proveedores, respaldo nocturno.
> Fuente de verdad viva del **qué** y el **porqué**; el detalle está en [`../domain/`](../domain/caja-y-ventas.md) (reglas por tema),
> [`../architecture/`](../architecture/), [`../historial/`](../historial/) (proyectos terminados) y los [ADRs](../decisions/).
> Si el código contradice a este documento, gana el código y se actualiza aquí.

**Proyecto:** Sistema ERP (POS, Inventario FIFO y Contabilidad) para una tienda de colonia
**Ubicación:** El Salvador · **Usuaria:** dueña no-contadora; la meta es llevar el negocio
más fácil y saber si es rentable — no un ERP enterprise.
**Principios rectores:** **apoyar, no imponer** (ante la duda se registra y se avisa, no se bloquea) y **no sobreingeniería**.
**Fase actual:** construido y endurecido; pendiente de la primera venta real (ver
[`../roadmap/plan-fases.md`](../roadmap/plan-fases.md#antes-de-la-primera-venta-real)).

## 1. Visión general y arquitectura

### 1.1 Propósito

Gestión integral para la alta transaccionalidad de una tienda de colonia: automatizar el
Punto de Venta (POS), resolver el fraccionamiento de inventario (fardos↔unidades, y venta
por peso o por monto) con lotes **FIFO**, y producir números **reales y verificables** — utilidad,
patrimonio y flujo de efectivo — para responder la pregunta central de la dueña:
**"¿dónde está mi dinero y estoy ganando?"**.

### 1.2 Stack tecnológico (decidido)

* **Backend:** **NestJS 11 + Prisma 7** (TypeScript) sobre **PostgreSQL**. La "decisión pendiente
  Python vs Node" de la v2.0 ya no existe: hay un backend completo con transacciones, locks
  y ADRs. Relitigarlo sería tirar el activo más valioso del proyecto.
* **Frontend:** **Next.js 16 (React 19)**, mobile-first (la pantalla estrella es el POS).
* **Base de datos:** PostgreSQL en **Supabase** (plan gratuito + respaldo nocturno propio).
* **Despliegue:** **agnóstico de proveedor** — todo por variables de entorno (se evalúa GCP/Cloud Run
  para el API; Supabase para la BD). Imágenes de producción separadas de las de desarrollo y
  `GET /salud` como health check ([`../operations/deployment.md`](../operations/deployment.md),
  [`../operations/configuration.md`](../operations/configuration.md)).
* **Hardware en sitio:** laptop reutilizada + lector de código de barras (USB/Bluetooth).
* **Talón de Aquiles conocido:** 100% cloud → cada venta necesita internet. No se hace
  offline-first (sobreingeniería); en su lugar hay un **modo contingencia** diseñado
  (ver §2.1 y [`../domain/modo-contingencia.md`](../domain/modo-contingencia.md)).

## 2. Lógica de negocio y requerimientos

### 2.1 Módulo POS y control de caja

La caja (turno) es una entidad temporal que **audita a los cajeros**, no la cuenta del
negocio. Solo **efectivo**, a propósito (sin tarjeta, transferencia ni fiado a clientes — decisión de
producto). **Una sola gaveta:** un turno abierto a la vez (ARQ-03). Reglas en
[`../domain/caja-y-turnos.md`](../domain/caja-y-turnos.md) y
[`../domain/ventas-y-devoluciones.md`](../domain/ventas-y-devoluciones.md).

* **REQ-POS-01 (Ventas):** registro rápido por código de barras o botón. Cantidades
  **fraccionables** (`Decimal`, hasta 3 decimales): media libra de queso, granel. Motor FIFO con bloqueo
  pesimista (`FOR UPDATE`) que evita sobreventa concurrente ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
  El **total lo calcula el backend**; cada línea se redondea a 2 decimales antes de sumar.
* **REQ-POS-01a (Venta por monto, D-03):** cada línea se vende por **cantidad o por monto** ("dame $1 de queso"); con
  monto, el backend calcula la cantidad y el subtotal es exactamente el monto.
* **REQ-POS-01b (Vender sin stock, D-01):** si el sistema cree que no hay stock, **se vende igual y se avisa**; lo que falta
  queda como "deuda de stock" con costo estimado congelado y se cubre al entrar una compra o un conteo sobrante
  ([`../domain/inventario.md`](../domain/inventario.md)).
* **REQ-POS-01c (Alta rápida, D-02):** la cajera da de alta un producto fuera del catálogo con nombre + precio; queda
  "por revisar" en la categoría "Por revisar" hasta que la dueña lo complete.
* **REQ-POS-01d (Idempotencia):** `POST /ventas` acepta `Idempotency-Key`; un reintento tras un corte de red devuelve la
  venta ya creada sin duplicar stock ni efectivo.
* **REQ-POS-02 (Apertura, D-15):** cada turno es independiente; se ingresa el fondo inicial físico. Si difiere de lo que
  quedó al último cierre, la dueña o la cajera indican el **origen** de la diferencia (bóveda, aporte, retiro, "no sé") y
  siempre queda **registrada con su asiento, sin bloquear**. Reemplaza tanto los ajustes automáticos silenciosos de la v2.0 como
  el parámetro `desde_boveda`.
* **REQ-POS-03 ("Sacar dinero"):** un solo botón con cuatro opciones contablemente distintas: *Guardar en bóveda*
  (`RETIRO_BOVEDA`, traslado entre activos), *Pagar algo* (`EGRESO_OPERATIVO`, gasto del P&L; categoría opcional,
  por defecto "Otros"), *Retiro personal* (`RETIRO_PERSONAL`, **débito a patrimonio**) y *Traer de la bóveda*
  (`TRASLADO_DESDE_BOVEDA`). Reemplaza el concepto ambiguo de "sangría".
* **REQ-POS-04 (Cierre / Corte Z):** el sistema calcula el efectivo esperado; la cajera
  declara el contado. El **excedente se traslada a bóveda** (`TRASLADO_A_BOVEDA`) y el resto
  queda como fondo del próximo turno (con opción de reabrir automáticamente). El descuadre real se registra como
  `AJUSTE_FALTANTE`/`AJUSTE_SOBRANTE`.
* **REQ-POS-05 (Umbral de tolerancia):** un descuadre **≥ $1.00** (`TOLERANCIA_DESCUADRE`) exige
  justificación; por debajo, ajuste automático sin fricción. La diferencia **siempre** se registra
  (para detectar faltantes chiquitos diarios).
* **REQ-POS-06 (Cierre forzado):** un ADMIN puede cerrar un turno abandonado declarando el
  efectivo contado + justificación → estado `CERRADA_FORZADA`.
* **REQ-POS-07 (Contingencia):** una venta puede registrarse con su **fecha/hora real**
  (apagón) contra el turno actual; el backend rechaza fechas futuras y de más de 30 días atrás.
* **REQ-POS-08 (Trazabilidad):** cada turno (apertura y cierre), venta, **anulación**, movimiento, ajuste, devolución,
  cambio de precio, compra y abono guarda su autor; se sabe quién hizo qué y, en anulaciones y cierres forzados, con qué motivo.
* **REQ-POS-09 (Anulación y devolución):** la cajera anula una venta del turno abierto (con motivo) o la devuelve, total o
  parcialmente, con destino reingreso o merma. **Una venta con devoluciones no se anula** (se usa "Devolver el resto").
* **REQ-POS-10 (Avisos):** las operaciones que no se bloquean devuelven `avisos` legibles (sin stock registrado, gaveta o
  bóveda en negativo según el sistema, diferencia de apertura sin explicar).

### 2.2 Módulo de inventario (el core)

Separa el producto conceptual, su presentación comercial y su existencia física
([`../domain/inventario.md`](../domain/inventario.md)).

* **REQ-INV-01 (Unidad mínima):** el stock se rastrea en la unidad base más pequeña; la UI lo muestra en la unidad de la
  presentación ("7 six-pack + 2 sueltas").
* **REQ-INV-02 (Presentaciones):** un producto tiene varias presentaciones (código de barras
  y precio propios, **factor decimal**); la venta del fardo descuenta las unidades base equivalentes. Cada
  presentación lleva **historial de precios** (Bloque 3.C).
* **REQ-INV-03 (Lotes FIFO):** el stock se divide en lotes de compra; la venta descarga del
  más antiguo primero (`fecha_ingreso`, desempate determinista por `id`), congelando el costo
  real (COGS) en `detalle_venta_lotes`.
* **REQ-INV-04 (Mermas y ajustes):** merma (`MERMA_INVENTARIO`) descuenta del lote e impacta
  el P&L como pérdida, **sin depender de un turno abierto** (Bloque 2.A). Ajustes **positivos**
  (`CONTEO_SOBRANTE`, conteo físico) que **incrementan** el lote (Bloque 2.D). Solo la dueña los registra.
* **REQ-INV-05 (Carga inicial):** flujo guiado de "inventario inicial" — una compra con origen
  `CAPITAL_DUEÑOS` (aporte en especie, sin salida de caja).
* **REQ-INV-06 (Devoluciones):** una devolución de cliente **post-turno** ligada a la venta
  original revierte el costo FIFO al lote exacto y reembolsa del turno actual; por línea se
  elige **reingresar** al stock (revendible) o **merma** (descartado) — Bloque 3.B.
* **REQ-INV-07 (Deuda de stock):** lo vendido sin stock registrado queda en `pendientes_stock`; se cubre del lote más
  viejo a más nuevo cuando entra stock (compra o sobrante de conteo), se cancela o se devuelve al anular y se ajusta
  proporcionalmente en devoluciones.
* **REQ-INV-08 (Productos por revisar):** los productos de alta rápida se marcan `por_revisar` hasta que la dueña los
  revisa.

### 2.3 Módulo de compras y proveedores

* **REQ-COM-01 (Ingreso de mercadería):** registra la compra creando lotes con cantidad,
  costo exacto y fecha; el `monto_total` se calcula en el backend (no se confía en el cliente).
  Solo la dueña registra compras.
* **REQ-COM-02 (Origen de fondos):** una compra **pagada** exige origen: *Caja POS* (egreso del turno, `PAGO_PROVEEDOR`
  GAVETA→PROVEEDOR), *Bóveda* (BOVEDA→PROVEEDOR, sin turno) o *Capital dueños* (aporte en especie). No hay origen por
  defecto. Si el saldo del sistema no alcanza, **se registra y se avisa** ([ADR 0011](../decisions/0011-registrar-y-avisar.md)).
* **REQ-COM-03 (Compras a crédito, D-05):** una compra `AL_CREDITO` no mueve efectivo (origen `CREDITO`) y genera una deuda
  con saldo pendiente.
* **REQ-COM-04 (Deudas con proveedores):** lista de deudas por proveedor (pendientes o todas) y **pagar/abonar** desde la
  gaveta o la bóveda, con autor y nota; el abono no puede superar el saldo. Pagar una deuda no es un gasto del P&L.

### 2.4 Módulo de contabilidad y finanzas

Contabilidad administrativa real, no un simple flujo de caja
([`../domain/dinero-y-cuentas.md`](../domain/dinero-y-cuentas.md), [`../domain/reportes.md`](../domain/reportes.md)).

* **REQ-FIN-01 (Modelo origen→destino):** **todo** movimiento de efectivo declara
  `cuenta_origen` y `cuenta_destino` de un catálogo cerrado (`GAVETA`, `BOVEDA`, `DUEÑOS`,
  `GASTO`, `PROVEEDOR`). Es la "partida doble mínima": el efectivo se conserva por
  construcción. La **bóveda es derivada** del libro (se eliminó la tabla `caja_general`).
* **REQ-FIN-02 (Gastos operativos):** categorizados (por defecto "Otros"); pagables desde **gaveta o bóveda**.
* **REQ-FIN-03 (Capital y retiros):** inyección de capital (`INGRESO_CAPITAL`, con su asiento);
  retiro personal como distribución de patrimonio (no baja la utilidad, se reporta aparte).
* **REQ-FIN-04 (Arqueo de bóveda):** el ADMIN declara el efectivo físico contado en la bóveda;
  si difiere del derivado, registra un ajuste que lo reconcilia (respuesta *verificable*, no
  solo calculada).
* **REQ-FIN-05 (Estado de resultados):** utilidad bruta y **neta** reales en tiempo real:
  `ingreso − devoluciones − COGS(FIFO + estimado de ventas sin stock − reingresos) − gastos − mermas − faltantes + sobrantes`;
  los retiros de dueños se muestran aparte. Faltantes/sobrantes **sí** afectan la utilidad (señal
  de robo hormiga).
* **REQ-FIN-06 (Patrimonio):** foto de balance al instante:
  `Inventario + Efectivo(gaveta+bóveda) + Activos fijos − Deudas`. Los activos fijos se valúan
  a su valor estimado, **sin depreciación** (decisión consciente a esta escala).
* **REQ-FIN-07 (Flujo de efectivo):** entradas y salidas por cuenta (gaveta, bóveda) y período,
  derivadas del modelo origen/destino + ventas y devoluciones.
* **REQ-FIN-08 (Política de fondos, D-04):** ninguna salida de efectivo se rechaza por saldo insuficiente según el sistema:
  se registra y se avisa. `efectivo_esperado` y la bóveda pueden quedar negativos; el cierre y el arqueo los reconcilian.
* **REQ-FIN-09 (Día del negocio):** los reportes agrupan por día en la **zona horaria del negocio**
  (`ZONA_HORARIA_NEGOCIO`, default `America/El_Salvador`), no en UTC.

### 2.5 Módulo de usuarios y permisos (D-06, D-16)

Detalle en [`../domain/roles-y-permisos.md`](../domain/roles-y-permisos.md).

* **REQ-USR-01 (La cajera opera, la dueña controla):** la cajera vende, anula, devuelve, abre y cierra caja y paga gastos
  chicos desde la gaveta; solo la dueña hace retiro personal, aporte de capital, gastos y traslados desde la bóveda, arqueo,
  compras, precios y catálogo, ajustes de inventario, reportes, deudas con proveedores y usuarios.
* **REQ-USR-02 (Usuarios desactivables):** los usuarios no se borran, se desactivan (se conserva la autoría); no se puede
  desactivar a uno mismo ni dejar al sistema sin una dueña activa.
* **REQ-USR-03 (Validación por request):** el usuario y su rol se validan contra la base en cada request: desactivar o cambiar
  de rol aplica de inmediato.

## 3. Modelo de datos (entidades principales)

Detalle en [`../architecture/data-model.md`](../architecture/data-model.md).

* **Catálogo:** `productos` (con `por_revisar`), `categorias`, `presentaciones` (+ `historial_precios_presentaciones`).
* **Inventario:** `lotes_inventario` (stock físico, costo real, `fecha_ingreso` NOT NULL) y `pendientes_stock` (deuda de stock).
* **Caja/ventas:** `cajas_turnos` (con `CERRADA_FORZADA` y `cerrado_por_id`), `ventas` (con `clave_idempotencia` y
  `anulada_por_id`) / `detalle_ventas` / `detalle_venta_lotes` (puente costo FIFO), `devoluciones` / `detalle_devoluciones`.
* **Inventario ajustes:** `ajustes_inventario` (mermas y conteos).
* **Compras y deudas:** `compras_inventario` (con autor), `cuentas_por_pagar`, `abonos_cuentas_por_pagar`.
* **Finanzas:** `movimientos_financieros` (libro origen→destino; la bóveda se deriva de aquí),
  `categorias_gastos`, `activos_fijos`.
* **Seguridad:** `usuarios` (roles ADMIN/CAJERO, `activo`); autor (`usuario_id`) en las tablas transaccionales.
* **Nota:** la tabla `caja_general` de la v2.0 **ya no existe** — el saldo de bóveda se deriva.

## 4. Requisitos no funcionales

* **Concurrencia:** bloqueo pesimista (`FOR UPDATE` / advisory locks), orden turno → venta → lotes → pendientes y
  lock-antes-de-INSERT ([ADR 0001](../decisions/0001-concurrencia-for-update.md)).
* **Seguridad:** JWT (12 h) con roles validados contra la BD en cada request, rate-limiting, Helmet, CORS por allowlist,
  seed de admin por env, configuración de producción que falla cerrada
  ([`../architecture/security.md`](../architecture/security.md)).
* **Índices** por patrón de consulta real ([ADR 0005](../decisions/0005-indices-bd.md));
  filtro global de excepciones Prisma ([ADR 0006](../decisions/0006-filtro-excepciones-prisma.md)) y timeouts de
  transacción pensados para una BD remota.
* **Rendimiento a escala de tienda:** historial de Movimientos **paginado por cursor** (turnos y ventas), búsqueda de una
  venta por número, `GET /productos` solo con lotes con stock.
* **Testing/CI:** suite e2e sobre las invariantes críticas (FIFO, turnos, bóveda, P&L, devoluciones, contingencia, deuda
  de stock, permisos, deudas con proveedores, zona horaria, paginación) + CI en cada push
  ([ADR 0009](../decisions/0009-testing-docker-ci.md), [`../operations/testing.md`](../operations/testing.md)).
* **Disponibilidad y recuperación:** `GET /salud` para monitoreo y **respaldo nocturno cifrado** (`pg_dump` en GitHub
  Actions) con ensayo de restauración ([`../operations/respaldos.md`](../operations/respaldos.md)).
* **Precisión monetaria:** `Decimal` en dinero y cantidades (nunca floats), con topes de rango en los DTO.

## 5. Decisiones y alcance diferido (consciente)

* **Sin migraciones Prisma hasta producción** ([ADR 0002](../decisions/0002-sin-migraciones-hasta-produccion.md));
  hoy el schema se sincroniza con `db push`.
* **Constraints e inmutabilidad a nivel BD** (CHECK de stock, unicidad de turno abierto,
  `REVOKE UPDATE/DELETE` sobre tablas de libro): documentadas, se aplican con el baseline de
  producción ([`../roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md)).
* **Respaldo automatizado:** construido (scripts, workflow y guía); **falta activarlo** cargando los secretos y hacer el primer
  respaldo y ensayo de restauración reales (ver el checklist "Antes de la primera venta real" del plan).
* **Nivel 2 del backlog del ciclo (primer mes de uso):** fricción del mostrador (L9), "la dueña entiende sus números" (L10),
  inventario cómodo (L11), reversos sin ensuciar el P&L (L12), tests faltantes (L13), accesibilidad y celular (L14); decisiones
  D-07…D-14 (resumen diario, nota obligatoria en descuadre, vencimientos, stock bajo, conteo físico, recargas, fiado a clientes,
  margen mínimo) — ver [`../roadmap/backlog-ciclo-2026-11.md`](../roadmap/backlog-ciclo-2026-11.md).
* **Fuera de alcance salvo que el negocio lo pida:** depreciación de activos, módulo fiscal/DTE
  (El Salvador), multi-tienda (`tienda_id`), dos cajas simultáneas, offline-first real.

## 6. Historial de versiones

* **v3.1 (2026-11-24):** Ciclo 2026-11. Venta por monto y por peso, venta sin stock con deuda de stock, alta rápida "por
  revisar", idempotencia de ventas, redondeo por línea; política de fondos "registrar y avisar" (ADR 0011) y diferencia de
  apertura con origen; "Traer de la bóveda", categoría de gasto "Otros"; permisos D-06 (la cajera opera, la dueña controla),
  usuarios desactivables y validados en cada request, autoría de anulación, cierre y compras; compras a crédito y pago/abono de
  deudas con proveedores; paginación de Movimientos; reportes por día en la zona horaria del negocio; imágenes de producción,
  `/salud`, `TRUST_PROXY` y respaldo nocturno cifrado. Se corrigen la anulación de ventas con devoluciones y los reportes en UTC.
  La documentación se reorganiza (reglas por tema en `domain/`, proyectos terminados en `historial/`).
* **v3.0 (2026-07-08):** reescritura para reflejar el sistema construido (NestJS/Prisma) y los
  Bloques 1–3 (modelo de efectivo origen/destino, retiro personal, traslados, faltantes al
  P&L, umbral y cierre forzado, arqueo, ajustes positivos, patrimonio, flujo de efectivo,
  devoluciones, historial de precios, contingencia, trazabilidad de autor).
* **v2.0:** documento de diseño (quedó detrás del código); congelado en el historial de git.
