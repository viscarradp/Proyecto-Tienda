# Roles y permisos

> Reglas vigentes. Verificadas contra los `@Roles` de cada controller,
> `common/permisos.ts`, `jwt.strategy.ts` y `usuarios.service.ts`. Mecanismo técnico (guards, JWT, hardening):
> [`../architecture/security.md`](../architecture/security.md).

## Principio (D-06): la cajera opera, la dueña controla

Hay dos roles: **`ADMIN`** (la dueña) y **`CAJERO`** (la cajera). La cajera hace todo lo que el mostrador necesita
—vender, anular ventas, devolver, abrir y cerrar caja, pagar gastos chicos de la gaveta— y **cada cosa queda con su
nombre** (y con su motivo cuando se anula). Lo que mueve dinero fuera de la gaveta o cambia las reglas del negocio es de la dueña.

Todo 403 por rol responde el mismo mensaje: **"Esto lo hace la dueña (administradora)."**

## Matriz

| Acción | CAJERO | ADMIN |
|---|---|---|
| Vender, anular una venta (motivo obligatorio), devolver (justificación opcional) | sí | sí |
| Anular una compra, un movimiento financiero (gasto, retiro, aporte) o una merma (motivo obligatorio) | 403 | sí |
| Abrir y cerrar caja (incluye el origen de la diferencia de apertura) | sí | sí |
| `EGRESO_OPERATIVO` desde la gaveta ("Pagar algo"); `RETIRO_BOVEDA` ("Guardar en la bóveda") | sí | sí |
| `RETIRO_PERSONAL` ("Sacar para mí"), `INGRESO_CAPITAL`, `TRASLADO_DESDE_BOVEDA`, egreso pagado desde la bóveda | 403 | sí |
| Inyección a la bóveda, arqueo, libro de la bóveda | 403 | sí |
| Ver el saldo de la bóveda (`GET /caja-general/saldo`) | sí | sí |
| Categorías de gasto: leer / crear, editar, borrar | leer / 403 | todo |
| Alta rápida de productos; ver inventario, productos y movimientos | sí | sí |
| Crear, editar y borrar productos, presentaciones y categorías; **precios** | 403 (lectura de catálogo sí) | sí |
| Registrar compras; ver historial de compras | 403 / sí | sí / sí |
| Mermas (`QUEBRADO`, `VENCIDO`, `ROBO`) con motivo obligatorio | sí | sí |
| Conteos (`CONTEO`, `CONTEO_SOBRANTE`, incluido "encontré producto"); leer la lista de ajustes | 403 | sí |
| Desactivar / reactivar productos (`DELETE /productos/:id`, `PATCH /productos/:id/reactivar`); ver desactivados | 403 | sí |
| Deudas con proveedores y abonos | 403 | sí |
| Reportes (estado de resultados, patrimonio, flujo, top, margen) | 403 | sí |
| Cierre forzado de un turno | 403 | sí |
| Usuarios (crear, editar, desactivar, reactivar) | 403 | sí |

`POST /movimientos-financieros` no se puede resolver con un `@Roles` de clase (sirve a ambos roles): decide
`exigirPermisoMovimiento` por `tipo_movimiento` y `origen_fondos`. Una cajera solo puede un `EGRESO_OPERATIVO` con origen
`GAVETA` (el default) o un `RETIRO_BOVEDA`.

La interfaz refleja lo mismo (`lib/navigation.ts` es la fuente única): la cajera ve **Vender, Inventario y Ventas y turnos**;
**Mi negocio, Gastos y deudas y Usuarios** son de la dueña. En "Sacar dinero" la cajera solo ve "Guardar en la bóveda" y
"Pagar algo".

Pantallas y rutas (`lib/glosario.ts`, `MENU`): **Mi negocio** (`/dashboard/stats`), **Vender** (`/dashboard/pos`),
**Inventario** (`/dashboard/inventario`), **Gastos y deudas** (`/dashboard/gastos`), **Ventas y turnos**
(`/dashboard/movimientos`) y **Usuarios** (`/dashboard/usuarios`).
Al iniciar sesión, la **dueña aterriza en Mi negocio** y la **cajera en Vender** (`getHomeRoute`). En el celular, la
dueña ve 4 pestañas (Mi negocio, Vender, Inventario, Gastos y deudas) y **Más** (Ventas y turnos, Usuarios); la cajera
ve sus 3 pestañas sin "Más". Ocultar es solo cosmético: la autorización real la hace siempre el
backend, así que una cajera que llame la API directo sigue recibiendo 403.

## Trazabilidad de autor

Las operaciones guardan quién las hizo: venta (`usuario_id`), **anulación** (`ventas.anulada_por_id`, con motivo),
turno abierto (`usuario_id`) y **cerrado** (`cajas_turnos.cerrado_por_id`, también en el cierre forzado), movimientos,
devoluciones, ajustes de inventario, cambios de precio, **compras** (`compras_inventario.usuario_id`) y abonos a
deudas. Ventas y turnos muestra quién vendió, anuló, abrió y cerró.

## Usuarios: se desactivan, no se borran

- `DELETE /usuarios/:id` **desactiva** (`activo = false`); `PATCH /usuarios/:id/reactivar` lo reactiva. Nunca se borra
  un usuario: así la autoría del historial se conserva (D-16).
- **No se puede desactivar a uno mismo**, ni **dejar al sistema sin ninguna dueña activa**: desactivar o bajar de
  `ADMIN` a `CAJERO` a la última administradora activa da 409 ("crea o reactiva a otra administradora"). Estos cambios se
  serializan con un advisory lock para que dos dueñas no se desactiven mutuamente a la vez.
- El login rechaza a un usuario inactivo ("Este usuario está desactivado. Habla con la dueña.") **solo después de
  verificar la contraseña**, para no revelar a un desconocido qué usuarios existen. Ninguna respuesta incluye
  `password_hash`.

## Validación en cada request

El JWT (12 h) solo identifica al usuario (`sub`). En **cada request** `JwtStrategy.validate` consulta la base: el
usuario debe existir y estar `activo`, y el **rol que cuenta es el de la base de datos**, no el del token. Por eso
desactivar a alguien o cambiarle el rol aplica **de inmediato** (401 "Tu sesión ya no es válida. Vuelve a iniciar
sesión." o 403), sin esperar a que el token expire. A esta escala, una consulta por request es aceptable.

## Usuario inicial

Con la tabla `usuarios` vacía, el backend crea `admin` con la contraseña de `INITIAL_ADMIN_PASSWORD`
([ADR 0003](../decisions/0003-admin-seed-por-env.md)); si la variable falta, no crea ninguno. Cambia esa contraseña en el
primer ingreso y retira la variable.
