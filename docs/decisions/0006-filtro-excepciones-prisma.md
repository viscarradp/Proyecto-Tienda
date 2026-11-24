# 0006 — Filtro global de excepciones para errores de Prisma

**Estado:** Aceptado · **Fecha:** 2026-07-03 (Fase 1 de endurecimiento)

## Contexto

NestJS no tenía ningún `ExceptionFilter` global. Varios servicios manejan
errores de Prisma localmente con `try/catch` (ej. `categorias.service.ts`
traduce `P2002` a `ConflictException`), pero **no todos** lo hacen. Ejemplo
concreto encontrado y verificado: `usuarios.service.ts create()` no captura
ningún error — un `nombre` de usuario duplicado (`P2002`) llegaba al cliente
como un `500 Internal Server Error` genérico en vez de un `409 Conflict`
claro. Lo mismo ocurre con violaciones de llave foránea (`P2003`, ej. borrar
un producto que tiene presentaciones asociadas) en servicios sin manejo
explícito, como `productos.service.ts remove()`.

Esto no es una fuga de seguridad (Nest ya responde con un mensaje genérico
sin exponer detalles internos en un 500 no manejado), pero es una mala
experiencia de API: el cliente (frontend) no puede distinguir "dato
duplicado" de "error interno real", y el código de estado HTTP es incorrecto.

## Decisión

Se implementó `PrismaExceptionFilter`
(`erp-tienda-backend/src/common/filters/prisma-exception.filter.ts`),
registrado globalmente vía `APP_FILTER` en `app.module.ts`. Traduce los
códigos de error de Prisma más relevantes para este CRUD:

| Código Prisma | Significado | HTTP resultante |
|---|---|---|
| `P2002` | Violación de constraint único (`@unique`) | `409 Conflict` |
| `P2003` | Violación de llave foránea | `400 Bad Request` |
| `P2025` | Registro no encontrado (update/delete) | `404 Not Found` |
| `P2028` | Transacción interactiva superó su timeout / ya cerrada | `503` «El sistema está ocupado, intenta de nuevo en unos segundos» |
| `P2034` | Conflicto de escritura / deadlock | `503` (mismo mensaje) |
| `P2010` con SQLSTATE `40P01`/`40001` | Deadlock o fallo de serialización en consulta cruda (`$queryRaw`, p. ej. `FOR UPDATE`) | `503` (mismo mensaje) |
| `P2020` | Valor fuera de rango para la columna (`numeric field overflow`) | `400` «Un número es demasiado grande» |
| `P2010` con SQLSTATE `22003` | Desborde numérico en consulta cruda | `400` «Un número es demasiado grande» |
| `P2000` | Texto más largo que la columna | `400` «Un texto es demasiado largo» |
| Cualquier otro | — | Se delega al manejo por defecto de Nest (500 genérico, sin detalles internos) |

El filtro extiende `BaseExceptionFilter` de `@nestjs/core` y usa
`super.catch()` para reutilizar el formato de respuesta estándar de Nest —
no reinventa el formato de error, solo decide qué `HttpException` construir.

**Es una red de seguridad, no un reemplazo:** si un servicio ya maneja el
error localmente (como `categorias.service.ts`), ese `catch` ocurre primero
y la excepción nunca llega a este filtro para ese caso. No se tocó ningún
manejo de errores existente — el filtro solo cubre los casos que hoy caen al
500 genérico.

## Alternativas consideradas

- **Agregar `try/catch` a cada servicio sin manejo (usuarios, productos,
  presentaciones, compras, etc.):** más código repetido en cada servicio
  para el mismo patrón. Se descartó por duplicación innecesaria — un filtro
  global es exactamente para esto.
- **Mapear todos los códigos de error de Prisma:** hay más de 40 códigos
  documentados, la mayoría irrelevantes para las operaciones de este CRUD
  (ej. errores de migración, de introspección). Mapear solo los 3 que
  realmente ocurren en este dominio es proporcional; el resto cae al 500
  seguro por defecto — no hace falta anticipar casos que no van a pasar.

## Verificación

Probado end-to-end vía HTTP contra un PostgreSQL 16 desechable:

- `POST /usuarios` con un `nombre` duplicado → `409 Conflict`,
  `"Ya existe un registro con ese valor"` (antes: `500`).
- `DELETE /productos/:id` sobre un producto con una presentación asociada →
  `400 Bad Request`, `"La operación viola una relación con otro registro
  existente"` (antes: `500`).
- Log del servidor sin excepciones no manejadas ni stack traces filtrados en
  ninguno de los dos casos.

## Consecuencias

- Cualquier violación de constraint único o de llave foránea no manejada
  localmente ahora responde con un código HTTP y mensaje correctos, sin
  necesidad de tocar cada servicio individualmente.
- Si en el futuro un servicio necesita un mensaje más específico para un
  `P2002`/`P2003`/`P2025` particular, puede seguir manejándolo localmente
  (como ya hace `categorias.service.ts`) — el filtro global no lo impide.

## Ampliación (lote L2: timeouts y desbordes)

- Las transacciones de ventas (crear, anular, devolver), compras, cierre de
  turno y ajustes usan `{ timeout: 15000, maxWait: 5000 }`
  (`src/common/transaccion.ts`); el default de Prisma (5 s) se quedaba corto
  para una venta de varias líneas contra Supabase.
- El mapeo vive en la función pura `mapearErrorPrisma()` (con pruebas
  unitarias en `prisma-exception.filter.spec.ts`); el filtro solo la invoca.
  Los `503` dejan un `warn` en el log con el código de Prisma.
- Los límites de los DTOs (`src/common/validacion.ts`) hacen que un número
  enorme dé `400` antes de llegar a la base; el mapeo `P2020` es la segunda
  línea de defensa.
- En Prisma 7 con el adaptador de pg, el SQLSTATE viaja en
  `meta.driverAdapterError.cause.originalCode`: así se reconocen los
  deadlocks que Prisma etiqueta como `P2010`.
