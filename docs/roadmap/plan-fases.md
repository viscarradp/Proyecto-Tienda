# Plan de Endurecimiento Post-Auditoría — Estado y Hoja de Ruta

> **Propósito de este documento:** que cualquiera (incluyendo un asistente de IA sin memoria de conversaciones anteriores) pueda retomar este trabajo en cualquier momento sabiendo exactamente qué se hizo, por qué, qué falta, y qué decisiones ya están tomadas vs. cuáles siguen abiertas.
>
> **Origen:** `AUDITORIA-TECNICA.md` (raíz del repo), sección 5 "Plan de Acción Inmediato". Este documento es el tracker vivo de ese plan; `AUDITORIA-TECNICA.md` queda congelado como el informe original.
>
> **Última actualización:** 2026-07-02.

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

**Rama:** `feature/fase0-hardening` (pusheada a `origin`, **no mergeada a `master` todavía** — pendiente de decisión del usuario sobre cuándo mergear).

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
- [ ] **Decidir cuándo mergear `feature/fase0-hardening` a `master`.** No se ha hecho todavía — requiere confirmación del usuario.
- [ ] Nada más. Todos los hallazgos H1-H4, H7, H15, H16 de la auditoría están resueltos y verificados.

---

## Fase 1 — Base de Datos y Operaciones — ⏳ PENDIENTE

**Hallazgos que resuelve:** H5 (índices), H6 (migraciones — parcialmente diferido por decisión explícita, ver abajo), H8 (trazabilidad de autor, severidad Media pero agrupada aquí por tocar el mismo tipo de archivos).

### Alcance original (de `AUDITORIA-TECNICA.md`)
1. Añadir `@@index` a todas las FKs y a `fecha`/`estado`/`tipo_movimiento` en `schema.prisma`.
2. Establecer baseline de migraciones versionadas de Prisma.
3. Aplicar constraints de BD (`CHECK cantidad_disponible >= 0`, índice único parcial para "un solo turno ABIERTA") como defensa en profundidad adicional al bloqueo de aplicación de la Fase 0.
4. Añadir `usuario_id` a `ventas`, `movimientos_financieros`, `cajas_turnos`, `ajustes_inventario`.
5. Filtro global de excepciones (traducir errores de Prisma como `P2002` a respuestas HTTP claras).

### ⚠️ Re-evaluar antes de empezar: impacto de "sin migraciones todavía"
La decisión de **no adoptar migraciones hasta producción** (ver [`../decisions/0002-sin-migraciones-hasta-produccion.md`](../decisions/0002-sin-migraciones-hasta-produccion.md)) se tomó **durante Fase 0**, después de que el plan original de Fase 1 fuera escrito. Esto significa que el punto 2 (baseline de migraciones) y el punto 3 (constraints de BD) **quedan explícitamente pospuestos hasta producción** — ya están documentados como tal en [`hardening-backlog.md`](hardening-backlog.md) ítems 1 y 2, con el SQL exacto a aplicar cuando corresponda.

El punto 1 (índices) **sí se puede aplicar ahora sin migraciones**, vía `npx prisma db push` directamente sobre Supabase (igual que se hace hoy para cualquier cambio de schema en este proyecto). Es la única pieza de Fase 1 que no depende de la decisión de migraciones.

**Antes de ejecutar Fase 1, preguntar al usuario:**
- ¿Aplicar los índices ahora vía `db push` (opción rápida, consistente con el flujo actual), o esperar al baseline de migraciones para aplicar todo junto (índices + constraints) en un solo paso ordenado?
- ¿Es buen momento para el punto 4 (`usuario_id`)? Requiere decidir si el sistema ya maneja más de un usuario/cajero activo en la práctica (si sigue siendo un solo operador, la urgencia es menor).

### No iniciado
Ningún archivo de código se ha tocado para esta fase todavía.

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
| 1 | ¿Cuándo mergear `feature/fase0-hardening` a `master`? | Fase 0 está completa y verificada, pero no se ha mergeado | Baja — no bloquea seguir trabajando en nuevas ramas sobre esta |
| 2 | GCP vs. AWS para el backend | El usuario está reconsiderando GCP; Supabase se mantiene para la BD en ambos casos | Baja — el código ya es agnóstico de proveedor |
| 3 | Método de aplicar índices en Fase 1 | `db push` ahora vs. esperar baseline de migraciones | Media — bloquea el inicio de Fase 1 |
| 4 | ¿Cuándo entra el proyecto a "producción"? | Dispara la adopción de migraciones (ADR 0002) y las constraints de BD diferidas | Baja por ahora, pero es la señal que reactiva varios ítems del backlog |

---

## Referencias

- [`AUDITORIA-TECNICA.md`](../../AUDITORIA-TECNICA.md) — informe original de auditoría (congelado, no editar retroactivamente).
- [`../decisions/`](../decisions/) — ADRs 0001-0004, el porqué de cada decisión de Fase 0.
- [`hardening-backlog.md`](hardening-backlog.md) — lista granular de deuda técnica diferida con el SQL/código exacto a aplicar.
- [`../security.md`](../security.md), [`../operations/configuration.md`](../operations/configuration.md), [`../architecture/`](../architecture/), [`../domain/`](../domain/) — estado actual del sistema (se actualizan a medida que avanzan las fases).
