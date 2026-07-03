# 0008 — Flags de cookie (Secure, SameSite=Lax) y expiración alineada al JWT

**Estado:** Aceptado · **Fecha:** 2026-07-03 (Fase 2 de endurecimiento)

## Contexto

La auditoría técnica (hallazgo H11) encontró dos problemas en cómo el
frontend guarda el JWT:

1. `Cookies.set("token", ..., { expires: 1, path: "/" })` no define `secure`
   ni `sameSite` — valores por defecto del navegador, no una elección
   explícita.
2. La cookie expiraba en `1` día (24h) pero el JWT real expira en `12h`
   (`expiresIn: '12h'` en `auth.module.ts`, backend). Un usuario podía tener
   una cookie "viva" 12h más que el token que contiene, mostrando una sesión
   aparentemente activa que en realidad ya no sirve para nada (el backend
   responde 401 en la primera request).

## Decisión

En `login/page.tsx`, ambas cookies (`token` y `user`) se crean con:

```ts
{ expires: 0.5, path: "/", secure: true, sameSite: "lax" }
```

- **`expires: 0.5`** (medio día = 12h): coincide exactamente con la
  expiración real del JWT.
- **`secure: true`**: la cookie solo se envía sobre HTTPS. Los navegadores
  modernos (Chrome, Firefox) tratan `http://localhost` como un contexto
  seguro por excepción explícita, así que **esto no rompe el desarrollo
  local** — confirmado corriendo el login contra el build local sin HTTPS.
  Cualquier despliegue real (GCP, Vercel, etc.) sirve sobre HTTPS por
  defecto, así que no impone un requisito nuevo en producción.
- **`sameSite: "lax"`**: la cookie no se envía en requests cross-site de
  método distinto a top-level GET navigation, mitigando CSRF sin romper
  casos normales (ej. abrir un link a la app desde otro sitio). No se usó
  `sameSite: "strict"` porque no hay un caso de uso que lo requiera y
  `strict` puede romper navegaciones legítimas entre sitios.

## Alternativas consideradas

- **Mantener `expires: 1` (24h) sin relación con el JWT:** se descartó
  porque es exactamente la inconsistencia que motivó este ADR — no hay
  ninguna razón para que la cookie dure más que el token que contiene.
- **Cookie `httpOnly` gestionada por el backend** (en vez de `js-cookie` en
  el cliente): sería más segura (inaccesible a JavaScript, mitigando robo
  vía XSS), pero requiere que el backend emita la cookie directamente
  (cambio de contrato cliente-servidor, no un ajuste de flags). Es un cambio
  más grande, ya documentado como diferido en
  [`../roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md)
  ítem 5. Este ADR resuelve lo que se puede resolver hoy sin ese cambio de
  contrato — es una mejora incremental, no la solución final.

## Verificación

Login end-to-end contra el backend real (Fase 0/1) desde el build de
producción del frontend: el flujo de login, la emisión del JWT (12h) y el
acceso autenticado a `/dashboard/*` a través de `proxy.ts` (ver ADR 0007)
funcionan correctamente con las cookies así configuradas.

## Consecuencias

- Alguien que inspeccione las cookies del navegador ya no ve una sesión
  "más larga" de lo que realmente es.
- Sigue sin ser `httpOnly` — un XSS exitoso en el frontend aún podría leer
  el token (limitación conocida y documentada, ver
  [`../security.md`](../security.md) y el backlog).
