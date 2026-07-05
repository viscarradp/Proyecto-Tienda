# 0007 — `proxy.ts`: verificación liviana (presencia + expiración), sin validar firma

**Estado:** Aceptado · **Fecha:** 2026-07-03 (Fase 2 de endurecimiento)

## Contexto

La auditoría técnica (hallazgo H10) encontró que `/dashboard/*` no tenía
ninguna protección a nivel de servidor: la única verificación era un
`useEffect` en `dashboard/layout.tsx` que corría **después** de que el
contenido ya se había montado en el cliente, y que además revisaba la cookie
equivocada (`user`, JSON en texto plano editable por el usuario) en vez del
JWT real (`token`).

Adicionalmente, mientras se investigaba esto se descubrió que **Next.js 16
renombró `middleware.ts` a `proxy.ts`** (función exportada `proxy`, no
`middleware`; `middleware` queda deprecado pero sigue funcionando por
compatibilidad). Se usó la convención nueva.

## Decisión

`proxy.ts` (en la raíz del proyecto, junto a `app/`) protege `/dashboard/*`
verificando únicamente:

1. Que exista la cookie `token`.
2. Que su payload (decodificado, **sin verificar la firma**) tenga un `exp`
   que no haya pasado ya.

Si cualquiera de las dos falla, redirige a `/auth/login`. El decode es un
`Buffer.from(payload, 'base64url')` + `JSON.parse` manual — sin librerías
nuevas (`jsonwebtoken`, `jose`, etc.).

**Deliberadamente NO se verifica la firma criptográfica del JWT en el
proxy.** Esto es una decisión de arquitectura, no una limitación técnica:
verificarla requeriría compartir `JWT_SECRET` entre el despliegue del
frontend y el del backend (dos plataformas de hosting distintas, ver
`docs/roadmap/plan-fases.md` — GCP para el backend, frontend probablemente en
una plataforma tipo Vercel), lo cual:

- Amplía la superficie de exposición del secreto (dos lugares que deben
  protegerlo en vez de uno).
- Acopla el despliegue de una app al secreto de la otra.
- No cambia el modelo de amenaza real: alguien que lograra forjar un JWT sin
  el secreto de todas formas **no obtendría datos**, porque el backend
  (`JwtAuthGuard` + `RolesGuard`, seguros por defecto desde antes de este
  proyecto) vuelve a validar la firma en cada request. El proxy es una capa
  de UX (evita el "flash" de contenido protegido y una navegación en vano),
  no la autoridad de seguridad — ver `docs/architecture/security.md`.

## Alternativas consideradas

- **Verificar la firma completa en el proxy** (compartiendo el secreto o
  llamando a un endpoint de introspección del backend en cada navegación):
  se descartó por las razones de acoplamiento/superficie de arriba, y porque
  la documentación oficial de Next.js 16 recomienda explícitamente mantener
  el proxy liviano y no depender de él como única barrera ("Always verify
  authentication and authorization inside each Server Function rather than
  relying on Proxy alone").
- **No decodificar `exp` en absoluto (solo verificar presencia de la
  cookie):** más simple, pero deja pasar tokens obviamente vencidos hasta
  que el backend los rechace con un 401 (que el cliente ya maneja en
  `lib/api.ts`, mostrando una sesión "colgada" un instante más de lo
  necesario). Decodificar `exp` es casi gratis y mejora la UX sin costo real.

## Verificación

Probado con `curl` contra el build de producción del frontend, con tokens
construidos a mano (mismo formato JWT, sin necesitar el secreto real ya que
el proxy no lo valida):

- Sin cookie `token` → `307` a `/auth/login`.
- Cookie con `exp` en el pasado → `307` a `/auth/login`.
- Cookie con `exp` en el futuro → `200` (pasa).
- Token real emitido por el backend (Fase 0/1) → `200` (pasa) — confirma
  que el formato de payload coincide con lo que el proxy espera.

## Consecuencias

- El frontend puede desplegarse en cualquier plataforma sin coordinar
  secretos con el backend.
- Un usuario que edite manualmente la cookie `token` con un JWT
  auto-firmado y `exp` futuro **sí pasaría el proxy**, pero **no obtendría
  ningún dato real** — el backend rechazaría cada request con 401. El
  "daño" máximo es ver el shell de la UI del dashboard sin datos, igual que
  ya se documentó como aceptable en `docs/architecture/security.md` para el estado
  anterior a esta fase.
