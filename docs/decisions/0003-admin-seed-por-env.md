# 0003 — Contraseña del admin inicial vía variable de entorno

**Estado:** Aceptado · **Fecha:** 2026-07 (Fase 0 de endurecimiento)

## Contexto

Como los guards globales bloquean todo endpoint por defecto (`JwtAuthGuard` +
`RolesGuard`), el sistema necesita sembrar un primer usuario `ADMIN` al
arrancar con la tabla `usuarios` vacía — de lo contrario, nadie podría
autenticarse ni crear el primer usuario.

La implementación original sembraba un usuario fijo `admin` con contraseña
hardcodeada `admin123`, e imprimía esa credencial en los logs de arranque
(hallazgo H4 de la auditoría). Cualquier despliegue nuevo, o uno donde nunca
se cambió la contraseña, quedaba con acceso `ADMIN` trivial usando una
credencial pública (visible en el historial de Git).

## Decisión

La contraseña del admin inicial se toma de la variable de entorno
`INITIAL_ADMIN_PASSWORD`:

- Si la tabla `usuarios` está vacía **y** la variable está definida: se crea
  `admin` con esa contraseña (hasheada con bcrypt, igual que cualquier otro
  usuario).
- Si la tabla está vacía **y falta la variable**: no se crea ningún usuario;
  se emite un `console.warn` explicando cómo resolverlo (sin exponer ninguna
  credencial).
- La contraseña **nunca se imprime en logs**, ni siquiera cuando sí se crea
  el usuario.

Implementado en `UsuariosService.onModuleInit()`
(`erp-tienda-backend/src/usuarios/usuarios.service.ts`).

## Alternativas consideradas

- **Sembrar solo en desarrollo (`NODE_ENV !== 'production'`), exigir creación
  manual en producción**: más seguro en teoría, pero añade un paso extra al
  primer despliegue (endpoint de bootstrap o script aparte) que no aporta
  mucho dado que el problema real (no loguear/hardcodear la contraseña) ya
  queda resuelto con la variable de entorno. Se descartó por
  desproporcionado para el tamaño del proyecto ("no sobreingeniería").
- **Forzar cambio de contraseña en el primer login**: la opción más robusta a
  largo plazo, pero exige un flag en el modelo `usuarios`
  (`debe_cambiar_password`) y lógica de UI en el frontend. Se deja como
  mejora futura opcional si el negocio lo requiere — no es necesaria para
  cerrar el riesgo de credencial hardcodeada, que era el problema real.

## Consecuencias

- Quien despliega el sistema por primera vez **debe** definir
  `INITIAL_ADMIN_PASSWORD` antes de arrancar el backend con una base de datos
  vacía, o tendrá que crearlo por otro medio (acceso directo a la BD).
  Documentado en [`../operations/configuration.md`](../operations/configuration.md).
- Si se pierde el acceso al admin y no se recuerda la contraseña, no hay
  "recuperar contraseña" — es consistente con el alcance actual del sistema
  (una tienda pequeña, sin flujo de recuperación de cuenta todavía).
