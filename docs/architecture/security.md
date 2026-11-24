# Seguridad

## Autenticación

- JWT firmado con `JWT_SECRET` (obligatorio — el backend no arranca sin él; con `NODE_ENV=production` exige además
  ≥ 32 caracteres y rechaza los valores de ejemplo del repo), expira en **12 horas** (`auth.module.ts`).
- Login: `POST /auth/login` con `{ nombre, password }`. La contraseña se compara con `bcrypt` (salt rounds: 10) contra
  `usuarios.password_hash`. El mensaje de error es genérico ("Credenciales inválidas") tanto si el usuario no existe como si
  la contraseña es incorrecta, para no filtrar qué usuarios existen.
- El frontend guarda el JWT en una cookie (`token`, vía `js-cookie`) y lo envía en cada request como
  `Authorization: Bearer <token>`. Esta cookie **no es httpOnly** (limitación de `js-cookie`, que solo puede leer/escribir
  cookies accesibles por JavaScript) — ver `roadmap/hardening-backlog.md`. Desde Fase 2 sí lleva `Secure` + `SameSite=Lax` y su
  expiración (12h) está alineada a la del JWT real — ver [`../decisions/0008-cookie-flags.md`](../decisions/0008-cookie-flags.md).
- **El token solo identifica** (`sub`). En **cada request** `JwtStrategy.validate` consulta la base: el usuario debe existir y
  estar `activo`, y el rol que cuenta es el de la BD, no el del token. Desactivar a alguien o cambiarle el rol aplica **de
  inmediato** (401 / 403), sin esperar a que el token expire.

## Autorización

- Dos guards globales (`APP_GUARD` en `app.module.ts`) se aplican a **todo** endpoint por defecto:
  - `JwtAuthGuard`: exige un JWT válido, salvo que el endpoint tenga `@Public()` (hoy: `POST /auth/login`, `GET /salud`, y `GET /` y `GET /health`, que no tocan la BD).
  - `RolesGuard`: si el controlador/endpoint tiene `@Roles('ADMIN', ...)`, exige que el rol del usuario autenticado esté en esa lista.
- Roles: `ADMIN` (la dueña) y `CAJERO`. Todo 403 por rol responde "Esto lo hace la dueña (administradora)."
  (`RolesGuard` y `common/permisos.ts`). `POST /movimientos-financieros` decide por `tipo_movimiento` y `origen_fondos`
  (`exigirPermisoMovimiento`).
- **La matriz completa de permisos (D-06 "la cajera opera, la dueña controla"), los usuarios desactivables y la validación por
  request están en [`../domain/roles-y-permisos.md`](../domain/roles-y-permisos.md).**
- La autorización por rol en el **frontend es solo cosmética** (oculta botones/menús; `lib/navigation.ts`). La autorización real
  siempre la hace el backend — una cajera que manipule la UI o llame la API directamente sigue bloqueada por `RolesGuard`.
- `proxy.ts` protege `/dashboard/*` a nivel de servidor desde Fase 2 (antes la única protección era un `useEffect` en el
  cliente, que corría después de montar el contenido). Es una verificación liviana — no reemplaza al backend como autoridad
  de seguridad. Ver [`../decisions/0007-proxy-verificacion-liviana.md`](../decisions/0007-proxy-verificacion-liviana.md).
- **Trazabilidad:** ventas, anulaciones, aperturas y cierres de turno, movimientos, devoluciones, ajustes, cambios de precio,
  compras y abonos guardan quién los hizo (la cajera opera, pero con su nombre y motivo).

## Hardening aplicado

### Fase 0 — Backend (concurrencia y superficie HTTP)

| Riesgo | Mitigación | Dónde |
|---|---|---|
| Fuerza bruta en login | Rate-limit de 5 intentos/min/IP (`@nestjs/throttler`) sobre un límite global de 60 req/min/IP | `auth.controller.ts`, `app.module.ts` |
| Admin con contraseña conocida | Contraseña inicial viene de `INITIAL_ADMIN_PASSWORD` (env); sin esa variable no se crea ningún admin; `prisma/seed.ts` no crea usuarios | `usuarios.service.ts` |
| Headers HTTP inseguros | `helmet` aplicado globalmente | `main.ts` |
| CORS abierto a cualquier origen | Allowlist explícita vía `CORS_ORIGINS` (env); `*` solo con `NODE_ENV=development` | `main.ts` |
| Swagger expuesto | **Opt-in**: se monta solo con `NODE_ENV=development` o `ENABLE_SWAGGER=true`; sin `NODE_ENV` queda apagado (ADR [`0010`](../decisions/0010-imagenes-produccion.md), que modifica el ADR 0004) | `main.ts` |
| Sobreventa/sobregiro por condiciones de carrera | Bloqueo pesimista (`FOR UPDATE` / advisory lock) — ver [`0001`](../decisions/0001-concurrencia-for-update.md) | `ventas`, `compras`, `movimientos_financieros`, `cajas_turnos`, `cuentas_por_pagar`, `ajustes_inventario`, `usuarios` |
| Errores de Prisma con un 500 genérico | `PrismaExceptionFilter` global (P2002 → 409, P2003 → 400, P2025 → 404, deadlock/desborde con mensaje claro) — ADR [`0006`](../decisions/0006-filtro-excepciones-prisma.md) | `common/filters` |
| Venta duplicada por un reintento | `Idempotency-Key` opcional respaldada por una columna única | `ventas` |

### Fase 2 — Frontend

| Riesgo | Mitigación | Dónde |
|---|---|---|
| `/dashboard/*` sin protección de servidor | `proxy.ts` verifica presencia y expiración del JWT antes de renderizar | `proxy.ts` — ADR [`0007`](../decisions/0007-proxy-verificacion-liviana.md) |
| Cookie del JWT sin flags de seguridad, expiración desalineada | `Secure` + `SameSite=Lax`, expiración alineada a 12h | `app/auth/login/page.tsx` — ADR [`0008`](../decisions/0008-cookie-flags.md) |
| Estado de sesión anterior visible en terminal compartida | `reset()`/`clearCart()` de los stores de Zustand en logout | `dashboard/layout.tsx` |

### Ciclo 2026-11 — Despliegue seguro (L3a) y permisos (L7)

| Riesgo | Mitigación | Dónde |
|---|---|---|
| Imagen de producción con `db push --accept-data-loss` o `next dev` | Dockerfiles separados (`Dockerfile` de producción, `Dockerfile.dev`); el esquema es un paso manual | ADR [`0010`](../decisions/0010-imagenes-produccion.md) |
| Configuración que falla abierta | Con `NODE_ENV=production` el backend no arranca sin `CORS_ORIGINS` ni un `JWT_SECRET` fuerte | `common/config-produccion.ts` |
| Rate-limit ciego detrás de un balanceador (toda la tienda como una IP) | `TRUST_PROXY` (saltos de proxy o CIDR; `true` se rechaza porque permitiría falsificar la IP) | `main.ts`, `deployment.md` |
| Un error de conexión ociosa tumba el proceso; pool sin tope | `DB_POOL_MAX` + timeouts + `pool.on('error')` | `prisma.service.ts`, `common/pool-config.ts` |
| Usuario despedido con token vigente | Validación del usuario en cada request; los usuarios se desactivan, no se borran | `jwt.strategy.ts`, [`roles-y-permisos.md`](../domain/roles-y-permisos.md) |
| Datos de la tienda perdidos o expuestos en un respaldo | Respaldo nocturno **cifrado** (AES-256) con `pg_dump` | [`../operations/respaldos.md`](../operations/respaldos.md) |

Detalle de cada decisión en [`../decisions/`](../decisions/).

## Pendiente (a propósito, no es un descuido)

Ver [`../roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md) para la lista completa con su justificación. Los más
relevantes en seguridad:

- Migrar el JWT a una cookie `httpOnly` gestionada por el backend (o aceptar el patrón Bearer actual documentando el riesgo).
- Constraints de base de datos (`CHECK`, índice único parcial) y `REVOKE UPDATE/DELETE` sobre las tablas de libro, que refuercen
  a nivel de BD las invariantes que hoy solo garantiza la aplicación — planeadas para cuando el proyecto entre a producción y
  se adopte un flujo de migraciones.
- Rate-limit en memoria: correcto para una sola instancia; con más de una habría que pasar a un store compartido (Redis).
- Login por HTTP (pruebas desde el celular en red local) con cookie `Secure`: no funciona; solo afecta HTTP, no producción
  con HTTPS (UX-01 en el [backlog](../roadmap/backlog-ciclo-2026-11.md)).
