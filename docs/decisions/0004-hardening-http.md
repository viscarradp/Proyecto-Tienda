# 0004 — Endurecimiento de la superficie HTTP (rate-limit, Helmet, CORS, Swagger)

**Estado:** Aceptado · **Fecha:** 2026-07 (Fase 0 de endurecimiento)

## Contexto

La auditoría técnica encontró varios puntos de exposición innecesaria en la
capa HTTP del backend:

- `POST /auth/login` sin ningún límite de intentos (hallazgo H3) — permite
  fuerza bruta de credenciales.
- CORS configurado como `origin: true, credentials: true` (hallazgo H15) —
  refleja cualquier origen como permitido, equivalente a una allowlist
  universal.
- Swagger montado siempre en `/api`, sin autenticación ni distinción de
  entorno (hallazgo H16).
- Sin `Helmet`: headers de seguridad HTTP por defecto ausentes.

## Decisión

1. **Rate-limiting con `@nestjs/throttler`**: límite global de 60
   requests/minuto por IP (aplicado a todo endpoint, incluidos los
   `@Public()`, vía `APP_GUARD`), y un límite específico más estricto de 5
   intentos/minuto sobre `POST /auth/login` (`@Throttle`). Store en memoria
   (por instancia) — ver `roadmap/hardening-backlog.md` para el paso a un
   store compartido si el backend se escala a múltiples instancias.

2. **`helmet` global** en `main.ts`, con una excepción: cuando Swagger UI
   está activo, se relaja `contentSecurityPolicy` (sus assets inline la
   necesitan para renderizar). En producción con Swagger apagado se aplica
   la CSP estricta por defecto.

3. **CORS por allowlist**: `origin` viene de `CORS_ORIGINS` (env, lista
   separada por coma), no `true`. `credentials` pasa a `false`: la
   autenticación viaja por header `Authorization: Bearer`, puesto
   manualmente por el cliente — no depende de que el navegador envíe
   cookies automáticamente entre orígenes, así que no hace falta habilitar
   credenciales en CORS.

4. **Swagger condicionado por entorno**: se monta solo si
   `NODE_ENV !== 'production'`, o si se fuerza explícitamente con
   `ENABLE_SWAGGER=true`.

## Alternativas consideradas

- **Proteger Swagger con autenticación básica en vez de apagarlo en
  producción**: añade una capa de credenciales adicional a mantener: para
  el tamaño de este proyecto, apagarlo por defecto en producción y poder
  encenderlo explícitamente (`ENABLE_SWAGGER=true`) es más simple y
  suficiente.
- **API keys o autenticación de servicio a servicio para el rate-limit**: se
  descartó por sobreingeniería — un límite por IP es proporcional al riesgo
  real (fuerza bruta de un solo usuario/negocio), no a un escenario
  multi-tenant de alto tráfico.
- **Redis para el store del throttler desde ya**: se descartó porque el
  backend corre en una sola instancia hoy; añadir Redis ahora sería una
  dependencia de infraestructura sin beneficio actual. Documentado como
  paso futuro condicionado a escalar a múltiples instancias.

## Consecuencias

- Un usuario legítimo que falle su contraseña más de 5 veces en un minuto
  debe esperar antes de reintentar — trade-off aceptable frente al riesgo de
  fuerza bruta.
- Si el frontend se despliega en un dominio nuevo, hay que actualizar
  `CORS_ORIGINS` — está documentado en
  [`../operations/configuration.md`](../operations/configuration.md).
- Si se despliega el backend en más de una instancia (autoescalado), el
  rate-limit en memoria deja de ser exacto (cada instancia cuenta por
  separado) — no es incorrecto, solo menos estricto de lo configurado. Ver
  `roadmap/hardening-backlog.md`.
