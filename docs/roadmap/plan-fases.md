# Plan de Endurecimiento Post-Auditoría — Estado y Hoja de Ruta

> **Propósito de este documento:** que cualquiera (incluyendo un asistente de IA sin memoria de conversaciones anteriores) pueda retomar este trabajo en cualquier momento sabiendo exactamente qué se hizo, por qué, qué falta, y qué decisiones ya están tomadas vs. cuáles siguen abiertas.
>
> **Origen:** `AUDITORIA-TECNICA.md` (raíz del repo), sección 5 "Plan de Acción Inmediato". Este documento es el tracker vivo de ese plan; `AUDITORIA-TECNICA.md` queda congelado como el informe original.
>
> **Última actualización:** 2026-07-03 (Fase 1 mergeada a `master`).

---

## Cómo usar este documento

1. Lee la sección **"Reglas del proyecto"** primero — son restricciones de diseño no negociables que el usuario fijó explícitamente.
2. Revisa qué Fase está `✅ COMPLETADA`, `🔄 EN PROGRESO` o `⏳ PENDIENTE`.
3. Si vas a retomar una fase pendiente, lee su sección completa antes de escribir código — cada una enlaza a los hallazgos de la auditoría y a los ADRs relevantes.
4. Actualiza este archivo (estado, commits, decisiones) cada vez que avances una fase. Es un documento vivo, no un registro histórico congelado (para eso está `AUDITORIA-TECNICA.md`).

---

## Reglas del proyecto (fijadas por el usuario, aplican a todas las fases)

1. **Escalabilidad ante todo.**
2. **Soluciones escalables sobre soluciones rápidas y momentáneas.**
3. **No sobreingeniería.** El usuario final es una persona no-empresaria (dueña de una tienda de colonia) que solo quiere llevar su negocio de forma más fácil y saber si es rentable. Las soluciones deben ser proporcionales a ese contexto, no a un escenario enterprise/multi-tenant.
4. **Documentar todo en `docs/`**, de forma que se pueda leer rápido y que cualquiera pueda darle mantenimiento sin importar quién continúe el proyecto.

Restricciones operativas específicas (confirmadas con el usuario el 2026-07-02):
- **Sin migraciones de Prisma todavía** — el proyecto está en desarrollo activo, sin instancias de producción. Ver [`../decisions/0002-sin-migraciones-hasta-produccion.md`](../decisions/0002-sin-migraciones-hasta-produccion.md). Cuando se entre a producción, SÍ se adoptan migraciones.
- **Despliegue agnóstico de proveedor**: originalmente se consideró AWS; ahora el usuario está evaluando **GCP** para el backend, manteniendo **Supabase** para la base de datos. Ninguna decisión de código debe atarse a un proveedor específico — todo pasa por variables de entorno (ver [`../operations/configuration.md`](../operations/configuration.md)).
- **Git**: trabajar siempre en ramas `feature/*`, nunca directo en `master`; pushear a `origin`. (Confirmado como preferencia general del usuario, no solo para este trabajo.)

---

## Fase 0 — Concurrencia y Seguridad — ✅ COMPLETADA (2026-07-02)

**Rama:** `feature/fase0-hardening` — mergeada a `master` con `--no-ff` (commit `9a563a1`) y pusheada a `origin/master` el 2026-07-02.

**Hallazgos de la auditoría que resuelve:** H1, H2, H3, H4, H7, H15, H16 (ver `AUDITORIA-TECNICA.md` sección 3).

### Bloque A — Concurrencia (bloqueo pesimista)
Commit: `4dc95bd fix(backend): bloqueo pesimista para evitar sobreventa y sobregiro de caja`

- `ventas.service.ts create()`: `FOR UPDATE` sobre los lotes candidatos en el motor FIFO (antes: `findMany` sin lock → sobreventa posible).
- `ventas.service.ts anular()`: `FOR UPDATE` sobre el turno de caja antes de validar `estado === 'ABIERTA'`.
- `compras.service.ts create()`: `FOR UPDATE` sobre el turno abierto (rama `CAJA_POS`); advisory lock `caja_general_ledger` (rama `CAJA_GENERAL`, porque el saldo es un agregado `SUM()`, no una fila).
- `movimientos_financieros.service.ts create()`: `FOR UPDATE` sobre el turno antes de validar fondos en egresos. Se eliminó un comentario que afirmaba falsamente que el `SELECT` ya aplicaba row-lock.
- `cajas_turnos.service.ts abrir()`: advisory lock `caja_turno_abrir` (no hay fila que bloquear antes de crear el primer turno).
- `cajas_turnos.service.ts cerrar()`: `FOR UPDATE` sobre el turno (evita doble cierre / doble ajuste financiero — hallazgo adicional encontrado durante la implementación, no estaba en la auditoría original).
- Nuevo módulo compartido: `erp-tienda-backend/src/common/concurrency.ts` (tipos `CajaTurnoRow`/`LoteInventarioRow` para `$queryRaw`, helper `acquireAdvisoryLock`).
- **Decisión de diseño:** bloqueo pesimista (`FOR UPDATE` / advisory lock) elegido sobre `Serializable`+reintento y sobre actualización optimista. Detalle completo y alternativas descartadas en [`../decisions/0001-concurrencia-for-update.md`](../decisions/0001-concurrencia-for-update.md).

### Bloque B — Credenciales
Commit: `d932e29 fix(backend): eliminar credencial admin hardcodeada del seed inicial`

- `usuarios.service.ts onModuleInit()`: la contraseña del admin semilla ya no es `admin123` hardcodeada. Ahora viene de `INITIAL_ADMIN_PASSWORD` (env). Si la variable falta y la tabla está vacía, no se crea ningún usuario (con warning claro, sin credenciales en el log).
- Detalle en [`../decisions/0003-admin-seed-por-env.md`](../decisions/0003-admin-seed-por-env.md).

### Bloque C — Hardening HTTP
Commit: `2508f39 feat(backend): rate-limiting, Helmet, CORS por allowlist y Swagger gated`

- `@nestjs/throttler`: límite global 60 req/min/IP (`APP_GUARD`, corre incluso sobre rutas `@Public`); límite estricto de 5/min en `POST /auth/login` vía `@Throttle`.
- `helmet` global en `main.ts` (con CSP relajada solo cuando Swagger está activo).
- CORS: `origin` desde `CORS_ORIGINS` (env, allowlist) en vez de `origin: true`; `credentials: false` (el JWT viaja por header, no por cookie cross-origin).
- Swagger: montado solo si `NODE_ENV !== 'production'` o `ENABLE_SWAGGER=true`.
- `.env.example` creado en backend y frontend, documentando todas las variables.
- Detalle y alternativas descartadas en [`../decisions/0004-hardening-http.md`](../decisions/0004-hardening-http.md).

### Bloque D — Documentación (`docs/`)
Commit: `191d90f docs: crear carpeta docs/ con arquitectura, dominio, seguridad y ADRs`

Se creó la carpeta `docs/` completa desde cero: `README.md` (índice), `architecture/overview.md`, `architecture/data-model.md`, `domain/caja-y-ventas.md`, `security.md`, `operations/configuration.md`, `decisions/0001-0004` (ADRs), `roadmap/hardening-backlog.md`.

### Verificación real (no solo revisión de código)
Se levantó un PostgreSQL 16 desechable vía Docker, se sembraron datos mínimos, se arrancó el backend compilado, y se ejercitaron los 4 escenarios de concurrencia con `curl` en paralelo:

| Escenario | Resultado |
|---|---|
| FIFO (ventas concurrentes) | 7/8 ventas aceptadas = exactamente el stock disponible (21/21), 0 sobreventa |
| Egresos concurrentes | 2/8 aceptados dentro del saldo, resto con 400 limpio, 0 sobregiro |
| Apertura de turno concurrente | 1/5 aceptado, resto 409 |
| Cierre de turno concurrente | 1/3 aceptado, resto 409, un solo ajuste financiero (no triplicado) |

**Hallazgo importante durante la verificación:** se encontró un **deadlock real de PostgreSQL (`40P01`)** en `movimientos_financieros.service.ts`, no anticipado por la revisión de código. Causa: adquirir `FOR UPDATE` *después* de un `INSERT` con FK a la misma fila (el `INSERT` toma un lock `FOR KEY SHARE` implícito que compite con el `FOR UPDATE` posterior — dos transacciones pueden terminar esperándose circularmente). Corregido en el mismo bloque de trabajo:

Commit: `832e3e0 fix(backend): evitar deadlock por orden de bloqueo vs INSERT con FK`

- Regla aplicada: **siempre bloquear (`FOR UPDATE`/advisory lock) ANTES de insertar cualquier fila que referencie esa fila por FK**, nunca después.
- Corregido en `movimientos_financieros.service.ts` (donde se detectó) y preventivamente en `ventas.service.ts create()` (mismo patrón de riesgo, no confirmado empíricamente pero estructuralmente idéntico).
- `compras.service.ts`, `cajas_turnos.service.ts` y `ventas.service.ts anular()` ya tenían el orden correcto — no requirieron cambios.
- Documentado en detalle en [`../decisions/0001-concurrencia-for-update.md`](../decisions/0001-concurrencia-for-update.md), sección "Gotcha descubierto en pruebas".
- Re-verificado tras el fix: mismos 4 escenarios, cero deadlocks en el log del servidor.

### Pendiente de Fase 0

- Nada. Todos los hallazgos H1-H4, H7, H15, H16 de la auditoría están resueltos, verificados y mergeados a `master`. Fase 0 cerrada.

---

## Fase 1 — Base de Datos y Operaciones — ✅ COMPLETADA (2026-07-03)

**Rama:** `feature/fase1-indices-excepciones` — mergeada a `master` con `--no-ff` y pusheada a `origin/master` el 2026-07-03.

**Hallazgos que resuelve:** H5 (índices). El filtro de excepciones no era un
hallazgo numerado de la auditoría, pero estaba en `hardening-backlog.md`
como ítem "Menores" y se resolvió en el mismo bloque de trabajo por tocar el
mismo tipo de riesgo (respuestas HTTP incorrectas).

### Decisión de alcance tomada antes de empezar

El plan original agrupaba tentativamente 5 puntos en Fase 1. Antes de
ejecutar, se re-evaluó con el usuario:

- **Migraciones baseline y constraints de BD** (puntos 2 y 3 originales):
  quedan explícitamente pospuestos hasta producción — decisión ya tomada en
  Fase 0 ([`../decisions/0002-sin-migraciones-hasta-produccion.md`](../decisions/0002-sin-migraciones-hasta-produccion.md)),
  documentados con el SQL exacto en [`hardening-backlog.md`](hardening-backlog.md) ítems 1-2.
- **`usuario_id` / trazabilidad de autor** (punto 4 original, hallazgo H8):
  se decidió **diferir** — es un cambio más invasivo (schema + 5 services +
  un decorator `@CurrentUser()` nuevo) que no se justifica mientras el
  negocio opere con un solo cajero activo. Queda en
  [`hardening-backlog.md`](hardening-backlog.md) ítem 4.
- **Alcance final de Fase 1:** solo índices (punto 1) + filtro global de
  excepciones (punto 5) — ambos de bajo riesgo y alto valor.

### Qué se hizo

1. **16 índices añadidos a `schema.prisma`** (`@@index`), cada uno
   justificado por un patrón de consulta real verificado en el código (no
   especulativo) — incluye 4 índices compuestos donde la evidencia mostraba
   dos columnas siempre filtradas juntas (`lotes_inventario(producto_id,
   fecha_ingreso)` para el motor FIFO, `cajas_turnos(estado, fecha_cierre)`,
   `ventas(estado, fecha)`, `movimientos_financieros(tipo_movimiento,
   fecha)`). Detalle completo por índice en
   [`../decisions/0005-indices-bd.md`](../decisions/0005-indices-bd.md).
2. **`PrismaExceptionFilter` global** (`src/common/filters/prisma-exception.filter.ts`,
   registrado vía `APP_FILTER`): traduce `P2002`→409, `P2003`→400, `P2025`→404
   en vez del 500 genérico, para los servicios que no tenían manejo local
   propio. Detalle en [`../decisions/0006-filtro-excepciones-prisma.md`](../decisions/0006-filtro-excepciones-prisma.md).

### Verificación real

Contra un PostgreSQL 16 desechable (Docker), igual que en Fase 0:

- `npx prisma validate` / `format`: schema válido.
- `npx prisma db push`: sincroniza sin errores.
- `pg_indexes`: los 16 índices existen con las columnas correctas.
- `EXPLAIN` sobre la consulta exacta del motor FIFO: el planner usa
  `Bitmap Index Scan` sobre el nuevo índice compuesto (no *sequential scan*).
- HTTP end-to-end: `POST /usuarios` con `nombre` duplicado → `409` limpio
  (antes `500`); `DELETE /productos/:id` con una presentación asociada →
  `400` limpio (antes `500`). Log del servidor sin excepciones sin manejar.

### ⚠️ Paso manual pendiente: aplicar contra Supabase real

Este entorno de desarrollo **no tiene las credenciales de la Supabase real**
(no hay `.env`), así que el cambio de schema se verificó en una base
desechable pero **no se aplicó a la base de datos real del proyecto**.
Ejecutar manualmente cuando se retome el trabajo:

```bash
cd erp-tienda-backend
npx prisma db push
```

Es una operación aditiva seguro (`CREATE INDEX`), sin pérdida de datos.

### Pendiente de Fase 1

- [ ] Correr `npx prisma db push` contra la Supabase real (paso manual, ver arriba — no depende de mergear la rama).
- Índices y filtro de excepciones están completos, verificados y mergeados a `master`. Fase 1 cerrada salvo el paso manual de arriba.

---

## Fase 2 — Frontend y Robustez — ⏳ PENDIENTE

**Hallazgos que resuelve:** H10 (middleware.ts), H11 (cookie JWT), H13 (Server Components), H14 (reset de Zustand), H27 (error/loading boundaries), H29 (Toaster no montado), H30 (accesibilidad), H32 (selectores de Zustand).

### Alcance
1. `middleware.ts` en Next.js para proteger `/dashboard/*` a nivel de servidor (hoy la protección es 100% cliente, sobre una cookie `user` en texto plano que no es el JWT).
2. Acciones `reset()` en `cartStore` e `inventoryStore`, invocadas en logout (hoy el estado sobrevive entre sesiones de distintos cajeros en una terminal compartida).
3. Flags `Secure` + `SameSite` en la cookie del JWT; alinear expiración cookie (24h) con expiración JWT real (12h).
4. Montar `<Toaster>` (ya existe el componente, nunca se renderiza) y reemplazar los `alert()` nativos del POS.
5. `error.tsx` / `loading.tsx` / `not-found.tsx` — no existe ninguno en todo el App Router.
6. Selectores granulares de Zustand (`useShallow`) en vez de desestructurar el store completo, para evitar re-renders innecesarios.

### No iniciado
Ningún archivo de código se ha tocado para esta fase todavía.

---

## Fase 3 — Higiene del Proyecto — ⏳ PENDIENTE (continuo, sin fecha límite dura)

### Alcance
1. **Actualizar/limpiar documentación obsoleta de la raíz** — ver auditoría de `.md` de la raíz (sección siguiente de esta sesión; si existe, ver `docs/roadmap/plan-fases.md` historial de conversación o el resultado de esa auditoría específica).
2. **Testing real**: hoy no hay más que el scaffolding por defecto de NestJS (`app.controller.spec.ts`). Prioridad: tests de integración para el motor FIFO y el cierre de caja, idealmente con casos de concurrencia (complementando las pruebas manuales de humo de Fase 0).
3. **Docker + CI/CD**: `docker-compose` para levantar todo con un comando; CI (lint + test + build) en GitHub Actions. Ya estaba en el roadmap original del `README.md`.
4. **Decisión de negocio pendiente**: ¿el sistema debe soportar medios de pago no-efectivo (tarjeta, transferencia)? Hoy toda venta se asume en efectivo (ver [`../domain/caja-y-ventas.md`](../domain/caja-y-ventas.md)). No es un bug, es un supuesto de alcance que puede necesitar revisión con el dueño del negocio.

### No iniciado
Ningún archivo de código se ha tocado para esta fase todavía.

---

## Decisiones abiertas con el usuario (no bloquean el progreso, pero deben resolverse en algún momento)

| # | Decisión | Contexto | Urgencia |
|---|---|---|---|
| 1 | GCP vs. AWS para el backend | El usuario está reconsiderando GCP; Supabase se mantiene para la BD en ambos casos | Baja — el código ya es agnóstico de proveedor |
| 2 | ¿Cuándo entra el proyecto a "producción"? | Dispara la adopción de migraciones (ADR 0002) y las constraints de BD diferidas | Baja por ahora, pero es la señal que reactiva varios ítems del backlog |

**Resueltas:**

- ¿Cuándo mergear `feature/fase0-hardening` a `master`? → Resuelto el 2026-07-02, mergeado con `--no-ff` (commit `9a563a1`).
- Método de aplicar índices en Fase 1 → Resuelto el 2026-07-03: se preparan y verifican en este entorno (Postgres desechable), pero el `db push` final contra Supabase real lo corre el usuario manualmente (sin credenciales en este entorno). Ver sección de Fase 1 arriba.
- ¿Incluir `usuario_id` en Fase 1? → Resuelto el 2026-07-03: diferido, queda en `hardening-backlog.md` ítem 4.

---

## Referencias

- [`AUDITORIA-TECNICA.md`](../../AUDITORIA-TECNICA.md) — informe original de auditoría (congelado, no editar retroactivamente).
- [`../decisions/`](../decisions/) — ADRs 0001-0004, el porqué de cada decisión de Fase 0.
- [`hardening-backlog.md`](hardening-backlog.md) — lista granular de deuda técnica diferida con el SQL/código exacto a aplicar.
- [`../security.md`](../security.md), [`../operations/configuration.md`](../operations/configuration.md), [`../architecture/`](../architecture/), [`../domain/`](../domain/) — estado actual del sistema (se actualizan a medida que avanzan las fases).
