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
- Roles: `ADMIN` (la dueña) y `CAJERO`. El rol `VENDEDOR` (muerto) se quitó.
- Todo 403 por rol responde "Esto lo hace la dueña (administradora)."
  (`RolesGuard` y `common/permisos.ts`).

### Matriz de permisos (D-06: "la cajera opera, la dueña controla")

| Acción | CAJERO | ADMIN |
|---|---|---|
| Vender, anular, devolver (queda su nombre y motivo) | sí | sí |
| Abrir y cerrar caja (incl. origen de la diferencia de apertura) | sí | sí |
| `EGRESO_OPERATIVO` desde la gaveta; `RETIRO_BOVEDA` (gaveta→bóveda) | sí | sí |
| `RETIRO_PERSONAL`, `INGRESO_CAPITAL`, `TRASLADO_DESDE_BOVEDA`, egreso desde bóveda | 403 | sí |
| Inyección a bóveda (`/caja-general/inyeccion`), arqueo, libro de bóveda | 403 | sí |
| Saldo de bóveda (`GET /caja-general/saldo`) | sí | sí |
| Categorías de gasto: leer / crear, editar, borrar | leer / 403 | todo |
| Alta rápida de productos, ver inventario y movimientos | sí | sí |
| Productos, precios, catálogo, compras (crear), ajustes, reportes | 403 (lectura de catálogo sí) | sí |
| Cierre forzado, usuarios | 403 | sí |

`POST /movimientos-financieros` decide por `tipo_movimiento` y `origen_fondos`
(`exigirPermisoMovimiento`).

### Validación del usuario en cada request y desactivación

- `JwtStrategy.validate` consulta la base en cada request: el usuario debe
  existir y estar `activo`, y el rol que cuenta es el de la BD (no el del
  token). Desactivar o cambiar de rol aplica al siguiente request (401 / 403).
- Los usuarios no se borran: `DELETE /usuarios/:id` los desactiva
  (`activo=false`) y `PATCH /usuarios/:id/reactivar` los reactiva, para
  conservar la autoría del historial. No se puede desactivar a uno mismo ni
  dejar al sistema sin ADMIN activo (desactivar o bajar de rol al último).
- El login rechaza usuarios inactivos ("Este usuario está desactivado. Habla
  con la dueña.") solo tras verificar la contraseña. Ninguna respuesta de
  usuarios incluye `password_hash`.
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
