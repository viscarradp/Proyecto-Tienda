# Seguridad

## Autenticación

- JWT firmado con `JWT_SECRET` (obligatorio — el backend no arranca sin él),
  expira en **12 horas** (`auth.module.ts`).
- Login: `POST /auth/login` con `{ nombre, password }`. La contraseña se
  compara con `bcrypt` (salt rounds: 10) contra `usuarios.password_hash`. El
  mensaje de error es genérico ("Credenciales inválidas") tanto si el usuario
  no existe como si la contraseña es incorrecta, para no filtrar qué usuarios
  existen.
- El frontend guarda el JWT en una cookie (`token`, vía `js-cookie`) y lo
  envía en cada request como `Authorization: Bearer <token>`. Esta cookie
  **no es httpOnly** (limitación de `js-cookie`, que solo puede leer/escribir
  cookies accesibles por JavaScript) — ver `roadmap/hardening-backlog.md`.
  Desde Fase 2 sí lleva `Secure` + `SameSite=Lax` y su expiración (12h) está
  alineada a la del JWT real — ver [`decisions/0008-cookie-flags.md`](decisions/0008-cookie-flags.md).

## Autorización

- Dos guards globales (`APP_GUARD` en `app.module.ts`) se aplican a **todo**
  endpoint por defecto:
  - `JwtAuthGuard`: exige un JWT válido, salvo que el endpoint tenga
    `@Public()`.
  - `RolesGuard`: si el controlador/endpoint tiene `@Roles('ADMIN', ...)`,
    exige que el rol del usuario autenticado esté en esa lista.
- Roles actuales: `ADMIN` y `CAJERO`. (El código reconoce también
  `VENDEDOR` en algunos controladores, pero no se puede crear un usuario con
  ese rol — `CreateUsuarioDto` solo permite `ADMIN`/`CAJERO`. Es un rol muerto,
  documentado aquí para que no sorprenda a quien lo encuentre.)
- La autorización por rol en el **frontend es solo cosmética** (oculta
  botones/menús). La autorización real siempre la hace el backend — un
  usuario `CAJERO` que manipule la UI o llame la API directamente sigue
  bloqueado por `RolesGuard`.
- `proxy.ts` protege `/dashboard/*` a nivel de servidor desde Fase 2 (antes
  la única protección era un `useEffect` en el cliente, que corría después
  de montar el contenido). Es una verificación liviana — no reemplaza al
  backend como autoridad de seguridad. Ver [`decisions/0007-proxy-verificacion-liviana.md`](decisions/0007-proxy-verificacion-liviana.md).

## Hardening aplicado

### Fase 0 — Backend (concurrencia y superficie HTTP)

| Riesgo | Mitigación | Dónde |
|---|---|---|
| Fuerza bruta en login | Rate-limit de 5 intentos/min/IP (`@nestjs/throttler`) sobre un límite global de 60 req/min/IP | `auth.controller.ts`, `app.module.ts` |
| Admin con contraseña conocida | Contraseña inicial viene de `INITIAL_ADMIN_PASSWORD` (env); sin esa variable no se crea ningún admin | `usuarios.service.ts` |
| Headers HTTP inseguros | `helmet` aplicado globalmente | `main.ts` |
| CORS abierto a cualquier origen | Allowlist explícita vía `CORS_ORIGINS` (env) | `main.ts` |
| Swagger expuesto en producción | Se monta solo si `NODE_ENV !== 'production'` (o `ENABLE_SWAGGER=true`) | `main.ts` |
| Sobreventa/sobregiro por condiciones de carrera | Bloqueo pesimista (`FOR UPDATE` / advisory lock) — ver [`decisions/0001`](decisions/0001-concurrencia-for-update.md) | `ventas`, `compras`, `movimientos_financieros`, `cajas_turnos` |

### Fase 2 — Frontend

| Riesgo | Mitigación | Dónde |
|---|---|---|
| `/dashboard/*` sin protección de servidor | `proxy.ts` verifica presencia y expiración del JWT antes de renderizar | `proxy.ts` — ADR [`0007`](decisions/0007-proxy-verificacion-liviana.md) |
| Cookie del JWT sin flags de seguridad, expiración desalineada | `Secure` + `SameSite=Lax`, expiración alineada a 12h | `app/auth/login/page.tsx` — ADR [`0008`](decisions/0008-cookie-flags.md) |
| Estado de sesión anterior visible en terminal compartida | `reset()`/`clearCart()` de los stores de Zustand en logout | `dashboard/layout.tsx` |

Detalle de cada decisión en `decisions/`.

## Pendiente (a propósito, no es un descuido)

Ver [`roadmap/hardening-backlog.md`](roadmap/hardening-backlog.md) para la
lista completa con su justificación. Los más relevantes en seguridad:

- Migrar el JWT a una cookie `httpOnly` gestionada por el backend (o aceptar
  el patrón Bearer actual documentando el riesgo).
- Trazabilidad de autor: las operaciones financieras no registran qué
  usuario las ejecutó.
- Constraints de base de datos (`CHECK`, índice único parcial) que
  refuercen a nivel de BD las invariantes que hoy solo garantiza la
  aplicación — planeadas para cuando el proyecto entre a producción y se
  adopte un flujo de migraciones.
