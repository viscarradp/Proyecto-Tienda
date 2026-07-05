# 🔍 Auditoría Técnica Integral — ERP/POS Tienda Karlita

> **Alcance:** `erp-tienda-backend` (NestJS 11 · Prisma 7 · PostgreSQL/Supabase) + `erp-tienda-frontend` (Next.js 16 · React 19 · Tailwind 4 · Zustand 5 · shadcn/ui)
> **Método:** Auditoría multi-agente (10 dimensiones especializadas) + verificación adversarial de cada hallazgo contra el código real + revisión manual del núcleo de seguridad y lógica de negocio.
> **Fecha:** 2 de julio de 2026
> **Cobertura:** ~3.200 líneas backend · ~5.900 líneas frontend · 13 módulos NestJS · 15 tablas · 9 archivos `.md`.
> **Estado de verificación:** 51 hallazgos generados → **39 confirmados**, 2 plausibles, 2 refutados, 8 sin verificar (límite de sesión). Las severidades reflejan la corrección tras la verificación adversarial.

---

## 1. Resumen Ejecutivo

### Calificación general: **6.5 / 10** — Base sólida, requiere un sprint de endurecimiento antes de escalar.

Este es un proyecto **notablemente bien construido para su contexto** (ERP a medida desarrollado por un solo ingeniero). El backend es **seguro por defecto**, la contabilidad de dinero es correcta (`Prisma.Decimal` en todas partes), toda operación multi-tabla está en `$transaction`, y **8 de los 9 bugs** del histórico `BUGS-REPORT.md` **ya están corregidos** en el código actual. No hay superficie de inyección SQL (100% Prisma parametrizado) y la validación de entrada es en general robusta.

Sin embargo, el proyecto aspira explícitamente a "alta transaccionalidad" (según `CONTEXT-AGENTS.md`) y ahí está la brecha principal: **la integridad de datos bajo concurrencia no está garantizada**. Las transacciones corren en el nivel de aislamiento por defecto (Read Committed) sin bloqueos de fila ni invariantes de unicidad, lo que permite **sobreventa de stock (inventario negativo)** y **sobregiro de caja** cuando dos operaciones ocurren en paralelo — precisamente lo que la regla de dominio documentada ("las reglas matemáticas no toleran números negativos") prohíbe. A esto se suman debilidades de **endurecimiento operativo** (sin rate-limiting, credenciales admin por defecto, cero índices en BD, sin migraciones versionadas) y una **autorización de frontend puramente cosmética** (sin `middleware.ts`).

### Readiness para iniciar desarrollo activo: **Media-Alta**

| Aspecto | Estado |
|---|---|
| Arquitectura base | ✅ Sólida y consistente — se puede construir encima con confianza |
| Seguridad de autenticación/autorización | 🟢 Buena base (guards globales, JWT, bcrypt) · 🟡 falta hardening |
| Integridad de datos (dinero/stock) | 🔴 Riesgo real bajo concurrencia — **prioridad #1** |
| Base de datos (rendimiento/operaciones) | 🔴 Sin índices, sin migraciones — **prioridad #2** |
| Frontend (arquitectura Next 16) | 🟡 Funcional pero sin aprovechar RSC ni error boundaries |
| Documentación | 🟡 Buena pero desactualizada (drift) |
| DevOps (Docker/CI/tests) | 🔴 Inexistente |

**Veredicto:** La base es apta para continuar el desarrollo, pero se recomienda un **sprint de endurecimiento de ~1 semana** (ver §5) que resuelva concurrencia, índices, migraciones y credenciales antes de añadir nuevas funcionalidades. No es aún apto para un despliegue multi-cajero de producción sin ese sprint.

---

## 2. Análisis de Documentación vs. Realidad

El proyecto está **bien documentado para su tamaño** — `CONTEXT-AGENTS.md` es un documento maestro de arquitectura genuinamente valioso. El problema **no es ausencia de documentación sino drift** (deriva): los documentos describen un estado del proyecto anterior al actual.

| # | Documento | Brecha detectada | Severidad |
|---|---|---|---|
| D1 | `BUGS-REPORT.md` | **8 de 9 bugs ya están corregidos** en el código (BUG 1 tiene `@ArrayMinSize(1)`; BUG 5 tiene el guard exacto de turno abierto con comentario `// ── BUG 5`; BUG 6 lanza error sin fallback; BUG 7 tiene `@unique`; BUG 8 incluye `PAGO_PROVEEDOR`/merma; BUG 3 recalcula monto). BUG 9 está parcialmente corregido (valida fondos pero con una race TOCTOU y un comentario que afirma falsamente un row-lock). Un desarrollador nuevo perdería días "arreglando" lo ya arreglado. | 🟡 Media |
| D2 | `CONTEXT-AGENTS.md` §5, §10 | Afirma que **"la autenticación en el cliente no existe aún"** y lista como *próximos pasos* (login, consumo de catálogo, checkout) trabajo que **ya está completamente implementado**. El doc quedó congelado en la fase de maquetación. | 🟡 Media |
| D3 | `GEMINI_FRONT.md` | Mandata **"Mobile-First obligatorio, Bottom Navigation"**, pero el proyecto **pivotó a un layout de escritorio con sidebar** (documentado en `CONTEXT-AGENTS.md` §3 e implementado en `dashboard/layout.tsx`). Contradicción interna entre documentos. | 🟢 Baja |
| D4 | `README.md` (raíz) | Instruye `npx prisma migrate dev` (L149), pero **no existe carpeta de migraciones** y el schema fue introspectado de Supabase — ese comando crearía conflictos. Además ejemplo de `JWT_SECRET="cambia-esto-en-produccion"` (L65) es débil, y "CORS habilitado para desarrollo local" subestima que refleja *cualquier* origen. | 🟡 Media |
| D5 | `erp-tienda-backend/README.md` y `erp-tienda-frontend/README.md` | **Ambos son el boilerplate por defecto** (starter de NestJS / `create-next-app`). Cero documentación específica del proyecto. El README del frontend dice puerto `3000` cuando corre en `3001`. | 🟢 Baja |
| D6 | `GEMINI.md` (backend) | El estándar documentado *"atrapa errores de Prisma (P2002) y devuélvelos como HTTP claras"* **no se cumple** en `usuarios.create()` (un `nombre` duplicado produce 500, no 409). La regla de dominio *"no toleran números negativos"* se contradice con la brecha de concurrencia (ver H1). | 🟢 Baja |
| D7 | `CONTEXT-AGENTS.md` §3 | Afirma *"Inmutabilidad Financiera: ventas no tienen endpoints UPDATE/DELETE"*, pero **`PATCH /ventas/:id/anular`** sí muta el estado y revierte stock/caja (es compensatorio, pero la afirmación literal ya no es exacta). | ⚪ Info |

**Recomendación transversal:** archivar `BUGS-REPORT.md` como histórico (o marcar cada bug como ✅ RESUELTO con referencia al commit), actualizar `CONTEXT-AGENTS.md` §5/§10 al estado real, reconciliar `GEMINI_FRONT.md` con el pivot a desktop, y reemplazar los dos READMEs boilerplate por documentación real de setup/arquitectura.

---

## 3. Hallazgos Críticos / Errores Encontrados

> Ordenados por severidad **corregida tras verificación adversarial**. Cada hallazgo indica archivo:línea, impacto y corrección.

### 🔴 Severidad ALTA

#### H1 — Race condition en descarga FIFO: sobreventa e inventario negativo
- **Ubicación:** [`ventas.service.ts:73-119`](erp-tienda-backend/src/ventas/ventas.service.ts#L73-L119)
- **Problema:** El motor FIFO lee los lotes con `findMany({ where: { cantidad_disponible: { gt: 0 } } })` y luego calcula `Math.min(requerido, lote.cantidad_disponible)` sobre el **valor leído en memoria**, decrementando después. La transacción usa Read Committed (default de Prisma/pg) **sin `SELECT ... FOR UPDATE` ni `isolationLevel: Serializable`**. Dos ventas concurrentes del mismo producto leen el mismo saldo, ambas deciden descargar, y `cantidad_disponible` puede quedar **negativo**. Confirmado: `grep` de `FOR UPDATE|Serializable|isolationLevel` en todo `src/` → sin resultados.
- **Impacto:** Sobreventa de stock inexistente y corrupción del costo FIFO/margen en reportes. Es el riesgo de integridad más grave para un ERP transaccional.
- **Matiz (verificación):** El schema documenta que `lotes_inventario` "contains check constraints" (introspección de Supabase); **no se pudo confirmar** si existe un `CHECK (cantidad_disponible >= 0)` en la BD. Si existe, la sobreventa se convierte en un error de transacción ruidoso (una venta falla) en lugar de stock negativo silencioso — pero sigue siendo un defecto de concurrencia no manejado.
- **Corrección:** Bloquear los lotes con `SELECT ... FOR UPDATE` vía `$queryRaw` dentro de la tx, **o** elevar a `isolationLevel: Prisma.TransactionIsolationLevel.Serializable` con reintento ante conflicto. Añadir `CHECK (cantidad_disponible >= 0)` en la BD como red de seguridad, y hacer el decremento condicional (`updateMany({ where: { id, cantidad_disponible: { gte: n } } })` verificando el `count`).

#### H2 — Race condition en validación de fondos (egresos y compras): sobregiro de caja
- **Ubicación:** [`compras.service.ts:89-137`](erp-tienda-backend/src/compras/compras.service.ts#L89-L137), [`movimientos_financieros.service.ts:67-87`](erp-tienda-backend/src/movimientos_financieros/movimientos_financieros.service.ts#L67-L87)
- **Problema:** Se lee `efectivo_esperado` (con `findFirst`/`findUnique`, **sin lock**) y luego se decrementa. Un comentario en el código afirma explícitamente que *"la lectura dentro de la tx aplica row-lock"* — **esto es falso**: un `SELECT` normal en Read Committed no bloquea filas. Dos egresos concurrentes sobre el mismo turno pueden dejar la caja en negativo.
- **Impacto:** Sobregiro de caja (`efectivo_esperado` negativo), descuadre financiero.
- **Corrección:** Mismo patrón que H1 (bloqueo/serializable/decremento condicional). **Eliminar el comentario engañoso** que afirma un lock inexistente.

#### H3 — Sin rate-limiting en `/auth/login`: fuerza bruta de credenciales
- **Ubicación:** [`auth.controller.ts:10-15`](erp-tienda-backend/src/auth/auth.controller.ts#L10-L15), `main.ts`
- **Problema:** El endpoint público de login no tiene throttling, límite de intentos ni backoff. No hay `@nestjs/throttler` ni `Helmet` instalados.
- **Impacto:** Ataque de fuerza bruta / credential stuffing sin fricción. (Mitigado parcialmente por el coste de CPU de `bcrypt`, que limita el throughput, pero no lo impide.)
- **Corrección:** Instalar `@nestjs/throttler` con un `ThrottlerGuard` estricto sobre `/auth/login` (p.ej. 5 intentos/min/IP) + `Helmet` global.

#### H4 — Usuario admin semilla con contraseña por defecto conocida (`admin`/`admin123`)
- **Ubicación:** [`usuarios.service.ts:13-25`](erp-tienda-backend/src/usuarios/usuarios.service.ts#L13-L25)
- **Problema:** `onModuleInit` crea automáticamente `admin` con contraseña fija `admin123` cuando la tabla está vacía, e **imprime las credenciales en logs**. No hay mecanismo que fuerce el cambio ni que lo desactive en producción. La credencial es de conocimiento público (está en el código fuente / Git).
- **Impacto:** Acceso ADMIN trivial en cualquier despliegue nuevo o si nunca se cambió la contraseña. `CONTEXT-AGENTS.md` §7 racionaliza el seeding pero no advierte del riesgo.
- **Corrección:** Generar una contraseña aleatoria y mostrarla una sola vez, **o** exigir cambio de contraseña en el primer login, **o** gatear el seeding a `NODE_ENV !== 'production'`. Nunca loguear credenciales.

#### H5 — Cero índices en la base de datos sobre FKs y columnas de filtro
- **Ubicación:** [`schema.prisma`](erp-tienda-backend/prisma/schema.prisma) (todo el archivo — ni un solo `@@index`)
- **Problema:** En PostgreSQL las columnas FK **no** se indexan automáticamente. Columnas del hot-path de ventas y de todos los reportes están sin índice: `lotes_inventario.producto_id`, `detalle_ventas.venta_id`/`presentacion_id`, `detalle_venta_lotes.detalle_venta_id`/`lote_id`, `ventas.caja_turno_id`/`fecha`, `movimientos_financieros.caja_turno_id`/`tipo_movimiento`/`fecha`.
- **Impacto:** Full-table scans que se degradan a medida que crece el histórico. El FIFO de cada venta y cada reporte hacen scans que hoy son imperceptibles pero se volverán lentos con volumen (el proyecto se describe como "alta transaccionalidad").
- **Corrección:** Añadir `@@index` a todas las FKs y a `fecha`/`estado`/`tipo_movimiento`. Índices compuestos donde aplique (p.ej. `lotes_inventario` en `(producto_id, fecha_ingreso)` para el orden FIFO).

#### H6 — Sin carpeta `prisma/migrations`: esquema, RLS y CHECK no versionados ni reproducibles
- **Ubicación:** [`schema.prisma:10-11`](erp-tienda-backend/prisma/schema.prisma#L10-L11) (comentarios de introspección en cada modelo)
- **Problema:** No existe `prisma/migrations` (confirmado). El schema fue obtenido con `db pull` desde Supabase; los comentarios *"This model contains row level security"* y *"contains check constraints and requires additional setup for migrations"* indican que **RLS y CHECK constraints viven en la BD pero fuera del control de Prisma/Git**. El estado real de la BD no es reproducible desde el repo.
- **Impacto:** Schema drift, imposibilidad de recrear el entorno de forma fiable, riesgo alto en la migración planificada a AWS. Aquí el `datasource` sin `url` es correcto (patrón driver-adapter), no un defecto.
- **Corrección:** Adoptar un flujo de migraciones versionadas (baseline con `prisma migrate diff` + `migrate resolve`), y modelar RLS/CHECK como migraciones SQL versionadas. Crítico **antes** de la migración a AWS.

---

### 🟡 Severidad MEDIA

#### H7 — Invariante "un solo turno de caja ABIERTA" sin constraint: race permite dos turnos abiertos
- **Ubicación:** [`cajas_turnos.service.ts:16-45`](erp-tienda-backend/src/cajas_turnos/cajas_turnos.service.ts#L16-L45)
- **Problema:** `abrir()` valida con `findFirst({ where: { estado: 'ABIERTA' } })` y luego crea — TOCTOU sin unique constraint ni lock. Dos aperturas concurrentes crean dos turnos abiertos. Además `ventas.create` y otros usan `findFirst` no determinístico para "la caja abierta".
- **Corrección:** Índice único parcial en Postgres `CREATE UNIQUE INDEX ... WHERE estado = 'ABIERTA'`, y capturar el conflicto.

#### H8 — Sin trazabilidad de autor en operaciones financieras
- **Ubicación:** [`ventas.service.ts:29-34`](erp-tienda-backend/src/ventas/ventas.service.ts#L29) y análogos en `cajas_turnos` (abrir/cerrar), `movimientos_financieros`, `ventas.anular`, `ajustes_inventario`.
- **Problema:** El JWT ya transporta `payload.sub` → `req.user.userId`, pero **ningún endpoint sensible persiste quién ejecutó la operación**. Ventas, movimientos, aperturas/cierres de caja y anulaciones no registran usuario.
- **Impacto:** Para un sistema cuyo objetivo declarado es "eliminar descuadres" y con "auditoría estricta" (`CONTEXT-AGENTS.md` §3), la ausencia de responsable por operación es una brecha de auditoría seria.
- **Corrección:** Añadir `usuario_id` (FK) a `ventas`, `movimientos_financieros`, `cajas_turnos` y `ajustes_inventario`; propagarlo desde `req.user` vía un decorador `@CurrentUser()`.

#### H9 — Endpoint financiero `POST /caja-general/inyeccion` sin DTO: evade el ValidationPipe
- **Ubicación:** [`caja_general.controller.ts:22-29`](erp-tienda-backend/src/caja_general/caja_general.controller.ts#L22-L29)
- **Problema:** El body se declara como tipo inline `@Body() body: { monto: number; descripcion?: string }`. El `ValidationPipe` global solo valida clases con metadatos de class-validator; con un tipo inline (borrado en runtime) **no aplica whitelist, forbidNonWhitelisted, `@Min`, ni coerción `transform`**. Un `monto` negativo o string pasa sin validar a una operación de caja.
- **Mitigante:** Está tras `@Roles('ADMIN')` + guards globales, por lo que no es explotable por anónimos. Es un defecto de integridad de entrada, no de autenticación.
- **Corrección:** Crear `InyectarCapitalDto` con `@IsNumber()`/`@IsPositive()`/`@Min`.

#### H10 — Protección de rutas del frontend 100% del lado cliente y sobre la cookie equivocada
- **Ubicación:** [`dashboard/layout.tsx:37-48`](erp-tienda-frontend/app/dashboard/layout.tsx#L37-L48)
- **Problema:** **No existe `middleware.ts`** (confirmado). La única "protección" es un `useEffect` que redirige si falta la cookie `user` — que es JSON en texto plano **editable por el usuario** y **no es el JWT**. El contenido protegido se monta y luego (quizá) redirige. El gating por rol CAJERO es solo ocultamiento visual de botones.
- **Mitigante importante:** La autorización de **datos** sí la impone el backend (guards globales + `@Roles('ADMIN')` en `usuarios` y `reportes`), así que un atacante sin JWT válido **no obtiene datos** — solo ve el shell de la UI. El impacto es de defensa-en-profundidad y UX (flash de contenido), no fuga de datos.
- **Corrección:** Añadir `middleware.ts` que verifique la presencia/validez del token y proteja `/dashboard/*` a nivel de servidor; no confiar en la cookie `user` para autorizar.

#### H11 — JWT en cookie no-`httpOnly` sin flags `Secure`/`SameSite`
- **Ubicación:** [`login/page.tsx:51`](erp-tienda-frontend/app/auth/login/page.tsx#L51), [`lib/api.ts:13-21`](erp-tienda-frontend/lib/api.ts#L13-L21)
- **Problema:** `Cookies.set("token", ..., { expires: 1, path: "/" })` — cookie legible por JavaScript (js-cookie no puede poner `httpOnly`), sin `Secure` ni `SameSite`. Robable por XSS.
- **Mitigante:** Patrón común en SPAs; el CSRF está mitigado porque el token viaja por header `Authorization` puesto manualmente (no automático por el navegador). La ventana de abuso de un token robado es **12h** (el JWT expira en `12h`, no las 24h de la cookie).
- **Corrección:** Añadir al menos `Secure` + `SameSite=Strict`. Idealmente migrar a cookie `httpOnly` gestionada por el backend, o aceptar el patrón Bearer documentando el riesgo. Alinear expiración cookie (24h) con JWT (12h).

#### H12 — La venta asume que todo el importe es efectivo
- **Ubicación:** [`ventas.service.ts:139-145`](erp-tienda-backend/src/ventas/ventas.service.ts#L139-L145)
- **Problema:** No existe concepto de medio de pago (efectivo/tarjeta/transferencia) en la venta ni en el DTO. **Toda venta incrementa `efectivo_esperado` por el total completo.** Si un cliente paga con tarjeta o transferencia, ese dinero no entra a la gaveta pero el sistema lo espera como efectivo → descuadre garantizado al cierre.
- **Corrección:** Añadir `metodo_pago` al DTO/venta e incrementar `efectivo_esperado` solo por la porción en efectivo. (Nota: `CONTEXT-AGENTS.md` §2 declara el alcance como "físico/efectivo", así que puede ser una decisión de alcance — validarlo con negocio.)

#### H13 — Cero aprovechamiento de Server Components; todo es Client Component
- **Ubicación:** [`dashboard/stats/page.tsx:1`](erp-tienda-frontend/app/dashboard/stats/page.tsx#L1) y las 5 páginas de dashboard + `dashboard/layout.tsx`
- **Problema:** Las 5 páginas de dashboard y el layout de dashboard declaran `'use client'` y hacen todo el fetch en el cliente vía `apiFetch` en `useEffect`. No hay ni un Server Component con data-fetching. (El root `app/layout.tsx` y `auth/layout.tsx` sí son Server Components.)
- **Impacto:** Se desperdicia el modelo RSC de Next 16: más JS al cliente, sin fetch en servidor, peor TTFB/SEO. Para un POS interno el impacto es menor, pero es deuda arquitectónica.
- **Corrección:** Migrar páginas de solo-lectura (stats, movimientos) a Server Components con fetch en servidor; mantener client solo donde hay interactividad (POS, carrito).

#### H14 — Zustand: el estado global no se resetea en logout (terminal compartida)
- **Ubicación:** [`dashboard/layout.tsx:50-54`](erp-tienda-frontend/app/dashboard/layout.tsx#L50-L54), [`cartStore.ts`](erp-tienda-frontend/src/store/cartStore.ts), [`inventoryStore.ts`](erp-tienda-frontend/src/store/inventoryStore.ts)
- **Problema:** `handleLogout` borra cookies y hace `router.push` (navegación SPA sin recarga). Los stores de Zustand viven en memoria y **no se resetean**. En una terminal de POS compartida entre cajeros, el siguiente usuario hereda el carrito y el inventario cacheado del anterior.
- **Corrección:** Exponer acciones `reset()` en ambos stores y llamarlas en el logout (o forzar recarga completa). Ver también H14b/H14c abajo.

---

### 🟢 Severidad BAJA (selección — lista completa en el apéndice)

| # | Hallazgo | Ubicación |
|---|---|---|
| H15 | CORS refleja cualquier origen con `credentials:true` (allowlist universal) | `main.ts:10` |
| H16 | Swagger UI expuesto sin auth en `/api`, sin condicionar a entorno | `main.ts:22-28` |
| H17 | Sin filtro global de excepciones (P2002 de `usuarios.create` → 500 en vez de 409) | `main.ts`, `usuarios.service.ts:34` |
| H18 | JWT sin claims `issuer`/`audience` ni validación de fortaleza del secreto | `auth.module.ts:18-29` |
| H19 | `@Param('id')` con `+id` sin `ParseIntPipe`: NaN → 500 en endpoints `findOne` | `usuarios.controller.ts:31`, otros |
| H20 | Query params `limit`/`desde`/`hasta` sin validar (negativos/fechas inválidas) | `reportes.controller.ts:33,53-78`, `movimientos_financieros.controller.ts:22-31` |
| H21 | Aritmética float en `abrir()` de caja antes de convertir a Decimal | `cajas_turnos.service.ts:32-47` |
| H22 | `onDelete: Restrict` latente puede bloquear borrados legítimos futuros | `schema.prisma:86,141,142` |
| H23 | `movimientos_financieros.caja_turno_id` nullable pese a asignarse siempre | `schema.prisma:135` |
| H24 | `handlePrismaError` (retorno `void`) rompe el tipado inferido del servicio | `categorias.service.ts:15-55`, `presentaciones` |
| H25 | Lógica/validación en controladores en vez de DTOs (anular, reportes) | `ventas.controller.ts:26-35` |
| H26 | Sin capa de serialización: se exponen entidades Prisma crudas con includes profundos | `ventas.service.ts:151-176` |
| H27 | Sin `error.tsx`/`loading.tsx`/`not-found.tsx` en todo el App Router | `app/` |
| H28 | `useBarcodeScanner` se re-suscribe en cada render (`allRows`/`filteredRows` sin `useMemo`) | `pos/page.tsx:245-294` |
| H29 | `<Toaster>` definido pero nunca montado; feedback vía `alert()` nativo (5 usos en POS) | `sonner.tsx:49`, `pos/page.tsx` |
| H30 | Accesibilidad: logout es `<div onClick>` (no operable por teclado); nav es `<span>` estilizado dentro de `<Link>` | `dashboard/layout.tsx:80-113` |
| H31 | Sin refresh token; `api.ts` propaga el `message` crudo del backend a la UI | `lib/api.ts:38-40`, `login/page.tsx` |
| H32 | Zustand: suscripción al store completo por desestructuración → re-renders innecesarios (sin selectores/`useShallow`) | `inventario/page.tsx:58`, `pos/page.tsx:60,64` |
| H33 | `cartStore.getTotal()` usa aritmética float en el cliente (solo display; backend recalcula) | `cartStore.ts:51-53` |
| H34 | RBAC: rol `VENDEDOR` autorizado en 3 controladores pero imposible de crear (`@IsIn(['ADMIN','CAJERO'])`) → rol muerto | `create-usuario.dto.ts:10` |
| H35 | UX/contrato: CAJERO alcanza la pantalla Gastos y dispara `POST /caja-general` (ADMIN) → 403 inevitable | `gastos/page.tsx:152-159` |
| H36 | Cobertura Swagger parcial: 7/13 controladores sin `@ApiTags`, 12/18 DTOs sin `@ApiProperty` | varios |
| H37 | El frontend depende de campos de respuesta (includes de Prisma) no descritos por ningún DTO de salida | `inventoryStore.ts:26-33` |
| H38 | `cartStore` sin `persist`: un refresh (F5) durante una venta vacía el carrito | `cartStore.ts` |

### ⚪ Refutados / Info (transparencia de la verificación)
- **Estados como String libre en vez de enum** (`schema.prisma`): *Refutado* como "rompe silenciosamente". Todos los campos con entrada de usuario están protegidos por `@IsIn` en sus DTOs + ValidationPipe global. Recomendable modelar enums/CHECK en BD como *hardening* futuro (Info), no es un bug activo.
- El único hallazgo con `file:1` / placeholders provino de dos agentes que devolvieron plantillas de prueba; se **descartaron** y sus dimensiones (docs-vs-realidad, Zustand) se re-auditaron manualmente para este informe.

---

## 4. Evaluación Técnica por Capas

### 4.1 Backend — NestJS 11 + Prisma 7

**Fortalezas (confirmadas):**
- ✅ **Seguro por defecto:** `APP_GUARD` global = `JwtAuthGuard` + `RolesGuard` ([`app.module.ts:44-51`](erp-tienda-backend/src/app.module.ts#L44-L51)); rutas públicas explícitas vía `@Public()`. `usuarios` y `reportes` correctamente restringidos a `@Roles('ADMIN')`.
- ✅ **Fronteras de módulos limpias:** cada dominio con controller/service/module/dto; `PrismaModule` global; `AuthModule` respeta encapsulación de `UsuariosService`.
- ✅ **Atomicidad:** toda operación multi-tabla usa `this.prisma.$transaction`.
- ✅ **Dinero correcto:** `Prisma.Decimal` en cálculos acumulados; el backend **recalcula** totales de venta y compra ignorando valores del cliente ([`compras.service.ts`](erp-tienda-backend/src/compras/compras.service.ts) recalcula `monto_total` desde lotes).
- ✅ **Validación robusta:** class-validator con `@IsIn`, `@Min`, `@ArrayMinSize`, `@ValidateNested`; ValidationPipe global con `whitelist`+`forbidNonWhitelisted`+`transform`.
- ✅ **Sin inyección SQL:** cero uso de `$queryRaw`/`$executeRaw`; todo por el query builder parametrizado.
- ✅ **JWT correcto:** secret obligatorio (lanza si falta), `expiresIn: 12h`, `ignoreExpiration: false`, bcrypt salt 10, exclusión consistente de `password_hash`, mensajes de login genéricos (anti-enumeración).

**Debilidades (prioridad):** concurrencia sin bloqueos (H1, H2, H7) · sin trazabilidad de autor (H8) · endurecimiento operativo (H3, H4, H15-H18) · un endpoint sin DTO (H9) · patrón `handlePrismaError` frágil (H24) · sin capa de serialización de respuestas (H26). **SRP:** `VentasService`/`ComprasService` acumulan inventario+caja+contabilidad en un método; candidatos a sub-servicios cuando crezcan.

### 4.2 Base de Datos — Prisma / PostgreSQL (Supabase)

- 🔴 **Rendimiento/escalabilidad:** cero índices secundarios (H5) — el problema estructural más impactante a mediano plazo.
- 🔴 **Operaciones:** sin migraciones versionadas; RLS y CHECK viven fuera del repo (H6) — bloqueante para la migración a AWS.
- 🟢 **Modelado:** dinero en `Decimal(10,2)`/`(10,4)` correcto; `@unique` natural en `categorias.nombre`, `usuarios.nombre`, `presentaciones.codigo_barras`; diseño relacional coherente (lotes, detalle_venta_lotes como puente contable FIFO).
- 🟡 **Detalles:** nullable innecesario (H23), `onDelete: Restrict` latente (H22), estados como String (Info).

### 4.3 Frontend — Next.js 16 + React 19 + Zustand

- 🟡 **App Router:** funcional pero sin RSC (H13), sin error/loading boundaries (H27), sin `middleware.ts` (H10). Página POS monolítica (718 líneas).
- 🟡 **Zustand:** `inventoryStore` tiene un patrón de caché con TTL (3 min) + fetch paralelo + guard de carga **bien hecho** (positivo). Debilidades: suscripción al store completo sin selectores → re-renders (H32); sin reset en logout (H14); `getTotal` en float (H33); `cartStore` sin persistencia (H38). No hay fugas de memoria ni suscripciones sin limpiar (los stores son singletons sin `subscribe` manual).
- 🟡 **Seguridad cliente:** JWT en cookie no-httpOnly (H11); guard de rutas cosmético (H10). El nombre de cookie `token` es consistente entre login/api/logout ✅.
- 🟢 **UI:** shadcn/ui + Tailwind 4 consistente; el flujo login→dashboard funciona; manejo de 401 centralizado en `api.ts` ✅.

### 4.4 Consistencia de Contrato API (Swagger ↔ Frontend)

El contrato está **mayormente alineado**: todas las rutas/métodos que consume el front existen en el back con los verbos correctos, y los payloads principales coinciden con los DTOs. Mismatches concretos: endpoint sin DTO (H9), UX rol CAJERO→Gastos→403 (H35), contrato de respuesta implícito por includes (H37), cobertura Swagger parcial (H36).

---

## 5. Plan de Acción Inmediato

> Recomendación: un **sprint de endurecimiento de ~1 semana** antes de escribir nuevas funcionalidades. Ordenado por retorno/riesgo.

### 🥇 Fase 0 — Integridad y seguridad (bloqueante, 2-3 días)
1. **[H1, H2, H7] Concurrencia:** envolver la descarga FIFO y los chequeos de fondos en bloqueos (`SELECT ... FOR UPDATE` o `isolationLevel: Serializable` con reintento). Añadir `CHECK (cantidad_disponible >= 0)` y decremento condicional. Índice único parcial para "un solo turno ABIERTA". Eliminar el comentario que miente sobre el row-lock.
2. **[H4] Credenciales:** eliminar/gatear el seed `admin/admin123`; forzar cambio de contraseña o generar una aleatoria; no loguear credenciales.
3. **[H3] Rate-limiting:** `@nestjs/throttler` sobre `/auth/login` + `Helmet` global.
4. **[H15, H16] Hardening:** restringir CORS a orígenes conocidos; condicionar Swagger a `NODE_ENV !== 'production'` (o protegerlo).

### 🥈 Fase 1 — Base de datos y operaciones (2-3 días)
5. **[H5] Índices:** añadir `@@index` a todas las FKs + `fecha`/`estado`/`tipo_movimiento`; compuestos para FIFO.
6. **[H6] Migraciones:** establecer baseline de migraciones versionadas y modelar RLS/CHECK como SQL versionado. **Prerrequisito de la migración a AWS.**
7. **[H8] Auditoría:** añadir `usuario_id` a ventas/movimientos/turnos/ajustes vía decorador `@CurrentUser()`.
8. **[H17] Excepciones:** filtro global de excepciones + traducir P2002 a 409 en `usuarios.create`.

### 🥉 Fase 2 — Frontend y robustez (2-3 días)
9. **[H10] `middleware.ts`** para proteger `/dashboard/*` a nivel de servidor.
10. **[H14, H32] Zustand:** acciones `reset()` en logout + selectores granulares/`useShallow`.
11. **[H11] Cookie JWT:** flags `Secure`+`SameSite`; alinear expiración.
12. **[H27, H29] UX resiliencia:** montar `<Toaster>`, reemplazar `alert()`, añadir `error.tsx`/`loading.tsx`.

### 🏁 Fase 3 — Higiene del proyecto (roadmap, continuo)
13. **[D1-D7] Documentación:** archivar/actualizar `BUGS-REPORT.md`, `CONTEXT-AGENTS.md`, READMEs; reconciliar `GEMINI_FRONT.md`.
14. **Testing:** no hay tests reales más allá del scaffolding (`app.controller.spec.ts`). Añadir tests de integración para el motor FIFO y el cierre de caja (idealmente con casos de concurrencia).
15. **DevOps:** `docker-compose` + CI (lint + test + build) en GitHub Actions — ya está en el roadmap del README y es un buen siguiente paso para el portafolio.
16. **[H12] Medio de pago:** decidir con negocio si se soportan pagos no-efectivo (afecta el cuadre de caja).

---

### Apéndice — Metodología

Auditoría ejecutada con 10 subagentes especializados en paralelo (documentación, arquitectura backend, seguridad/auth, inyección/validación, diseño de BD, lógica de negocio/concurrencia, arquitectura frontend, estado Zustand, seguridad frontend, contrato API), seguidos de un verificador adversarial por hallazgo que abrió el archivo citado e intentó *refutar* la afirmación. Las severidades de este informe son las **corregidas tras verificación**. Los hallazgos de las dimensiones "documentación" y "Zustand" (cuyos agentes fallaron devolviendo plantillas) fueron re-auditados manualmente y verificados de primera mano contra el código.
