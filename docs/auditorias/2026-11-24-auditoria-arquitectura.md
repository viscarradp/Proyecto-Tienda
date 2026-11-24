# Auditoría de arquitectura — ERP Tienda Karlita

| | |
|---|---|
| **Fecha** | 2026-11-24 |
| **Commit auditado** | `311edc4` (`master`) |
| **Alcance** | Backend (`erp-tienda-backend/`: NestJS 11 + Prisma 7 + PostgreSQL/Supabase) y frontend (`erp-tienda-frontend/`: Next.js 16 App Router). Estructura de módulos, modelo de datos, seguridad, rendimiento/escala, operación y despliegue, frontend, testing/CI. |
| **Método** | Solo lectura. Se leyó el código fuente (servicios, controllers, DTOs, `schema.prisma`, `main.ts`, Dockerfiles, CI, tests e2e, páginas y stores del frontend) y los docs de contexto. Nada se ejecutó: no se corrieron tests, ni se tocó ninguna base de datos. Cuando código y docs se contradicen, se tomó el código. Los números de escala son estimaciones de orden de magnitud con ~100–300 ventas/día. |
| **Vara de juicio** | Principios del dueño: "apoyar, no imponer" y "no sobreingeniería". Un hallazgo puede ser también algo sobrediseñado. |
| **Confianza** | **Confirmado** = se trazó en el código. **Probable** = depende de infraestructura o de uso que no se pudo observar (Cloud Run, Supabase, red). |

> **Informe congelado; el estado vivo se lleva en `docs/roadmap/`.** No se edita retroactivamente.

---

## Resumen ejecutivo

El núcleo contable está bien pensado y mejor probado de lo habitual para una tienda: FIFO con bloqueo pesimista, cierre de turno con descuadre, devoluciones y reportes en zona horaria correcta, con e2e para las invariantes más delicadas. Los problemas no están ahí. Están en **lo que rodea al despliegue y a la vida real de la tienda**: los únicos Dockerfiles son de desarrollo (el del backend ejecuta `prisma db push --accept-data-loss` al arrancar), varios listados devuelven **toda la historia** y dejarán de funcionar en pocos meses, el modelo admite **un solo turno abierto global** aunque se habla de 1–2 cajas, y faltan salidas para errores humanos comunes (compra a crédito que nunca se paga, compra o gasto mal digitado que no se puede corregir). Una venta puede duplicarse si la conexión falla justo después de guardar. Hay además deuda de "autoría": el sistema guarda quién hizo cada cosa pero nunca lo muestra. Varios cambios de schema que recomiendo conviene hacerlos **antes** del baseline de migraciones (ADR 0002), cuando son gratis.

**Conteo:** 3 🔴 · 13 🟡 · 4 ⚪ (20 hallazgos).

## Tabla resumen

| ID | Sev. | Título | Conf. |
|---|---|---|---|
| ARQ-01 | 🔴 | Los Dockerfiles son de desarrollo; el del backend corre `db push --accept-data-loss` | Confirmado |
| ARQ-02 | 🔴 | Listados sin paginar con toda la historia (`/ventas`, `/cajas-turnos`, lotes agotados en `/productos`) | Confirmado |
| ARQ-03 | 🔴 | Un solo turno `ABIERTA` global frente a "1–2 cajas" | Confirmado |
| ARQ-04 | 🟡 | `POST /ventas` sin idempotencia ni timeout: un reintento duplica la venta | Confirmado |
| ARQ-05 | 🟡 | Venta con N+1 dentro de una transacción de 5 s por defecto | Probable |
| ARQ-06 | 🟡 | Pool `pg` sin configurar ni manejador de errores; cold starts | Probable |
| ARQ-07 | 🟡 | Compras al crédito sin camino de pago (`cuentas_por_pagar`) | Confirmado |
| ARQ-08 | 🟡 | Compras, gastos y ajustes no se pueden corregir sin ensuciar el P&L | Confirmado |
| ARQ-09 | 🟡 | Gestión de usuarios: borrado duro pierde autoría, JWT sin revocación, sin desactivar | Confirmado |
| ARQ-10 | 🟡 | La autoría se guarda pero ninguna API/UI la muestra; la anulación no guarda autor | Confirmado |
| ARQ-11 | 🟡 | `CAJERO` puede más por API que lo que muestra la UI (capital, retiro personal, costos) | Confirmado |
| ARQ-12 | 🟡 | El efectivo de gaveta se calcula en 3 lugares y no hay reconciliación | Confirmado |
| ARQ-13 | 🟡 | Reportes cargan cientos de miles de filas a memoria en rangos largos | Confirmado |
| ARQ-14 | ⚪ | Ajuste de inventario sin lock del lote (carrera con una venta) | Confirmado |
| ARQ-15 | 🟡 | Frontend: fallo de red = "no hay caja", sesión que expira pierde el carrito, precios cacheados | Confirmado |
| ARQ-16 | ⚪ | Productos no se pueden desactivar; alta de producto en N llamadas no atómicas | Confirmado |
| ARQ-17 | ⚪ | Modelo: estados `String` libres, fechas nullable, sin CHECK de montos, redondeo implícito | Confirmado |
| ARQ-18 | 🟡 | Configuración de producción: defaults abiertos, IP tras proxy, observabilidad ciega | Probable |
| ARQ-19 | 🟡 | Huecos de testing: roles, compras, movimientos, reconciliación de efectivo | Confirmado |
| ARQ-20 | ⚪ | Higiene: endpoint `/resumen` incorrecto y sin uso, archivos sueltos, docs desactualizados | Confirmado |

---

## Hallazgos

### ARQ-01 🔴 Los Dockerfiles son de desarrollo; el del backend corre `db push --accept-data-loss`

**Evidencia**
- `erp-tienda-backend/Dockerfile:24` — `CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run start:dev"]`
- `erp-tienda-frontend/Dockerfile:18` — `CMD ["npm", "run", "dev"]`
- No existe otro Dockerfile ni stage de producción (`git ls-files | grep -i docker`). `docker-compose.yml` monta `src/` y fuerza `NODE_ENV: development`.

**Escenario.** Al desplegar en GCP (Cloud Run) lo más natural es reutilizar estas imágenes. Cada arranque, incluido cada cold start y cada autoescalado, ejecutaría `db push --accept-data-loss` contra Supabase: cualquier cambio de schema que implique perder datos (una columna eliminada o renombrada) se aplica sin preguntar sobre la base de la tienda. Además corre `nest start --watch` (compila en caliente, consume memoria y alarga el arranque) y, con `NODE_ENV=development`, CORS queda en `origin: '*'` (`main.ts:31-33`) y Swagger encendido. El frontend arrancaría con `next dev`.

**Impacto.** Riesgo de pérdida de datos en la BD real y un servicio lento y poco seguro. El pendiente "correr `db push` contra Supabase" del plan de fases cubre el paso manual, pero no esta trampa en la imagen.

**Recomendación.** Un Dockerfile de producción por app, de dos stages: `npm ci` + `npm run build`, y `CMD ["node","dist/src/main.js"]` (backend) / `next start` (frontend), sin ningún comando de schema en el arranque. Dejar el Dockerfile actual como `Dockerfile.dev` y apuntar `docker-compose.yml` a él. Cuando se adopten migraciones: `prisma migrate deploy` como paso explícito del despliegue, no del `CMD`.

**Confianza:** Confirmado.

---

### ARQ-02 🔴 Listados sin paginar que devuelven toda la historia

**Evidencia**
- `erp-tienda-backend/src/ventas/ventas.service.ts:205-219` — `findAll()` devuelve **todas** las ventas con `detalle_ventas` + `presentaciones`, sin `take` ni filtro.
- `erp-tienda-frontend/app/dashboard/movimientos/page.tsx:114-116` — la pantalla de Movimientos (donde se anula y se devuelve) pide `/cajas-turnos` y `/ventas` completos y filtra en el navegador (líneas 135-170).
- `erp-tienda-backend/src/cajas_turnos/cajas_turnos.service.ts:258-267` — `findAll()` incluye **todos** los `movimientos_financieros` de **todos** los turnos.
- `erp-tienda-backend/src/productos/productos.service.ts:30-46` — `findAll()` incluye todos los lotes de cada producto, también los agotados (`cantidad_disponible = 0`), que nunca se eliminan. El POS (`pos/page.tsx`) y el inventario cargan esto completo.
- Sin límite: `compras.service.ts:170`, `ajustes_inventario.service.ts:102`, `caja_general.service.ts:112` (libro de bóveda), `movimientos_financieros.service.ts:165` (el `limit` es opcional).

**Escenario.** Con ~200 ventas/día y ~1,2–1,5 KB de JSON por venta, `/ventas` pesa ~8 MB al mes. A los 3–4 meses se acerca al límite de respuesta de Cloud Run (32 MiB en HTTP/1; verificar el límite vigente) y mucho antes ya tarda segundos en la red de la tienda y en parsear en un celular. A los 2 años serían ~150.000 ventas. Los lotes agotados se acumulan igual: con una compra semanal por producto, cada producto arrastra ~100 lotes a los 2 años, y el catálogo del POS se descarga completo cada 3 minutos (TTL del store).

**Impacto.** La pantalla de Movimientos, que es la que se usa para anular una venta o devolver, deja de cargar sin ningún error claro, en plena operación. El POS se vuelve lento al abrir.

**Recomendación.** Lo mínimo, sin infraestructura nueva:
1. `GET /ventas?turno_id=` y/o `?desde&hasta`, con `take` por defecto (100–200), y `GET /cajas-turnos?limite=30` sin `movimientos_financieros` en el listado (dejarlos en `findOne`). Movimientos pide solo los últimos N turnos y las ventas de los turnos que el usuario expande.
2. En `/productos`, filtrar `lotes_inventario` con `where: { cantidad_disponible: { gt: 0 } }`. El POS solo usa el stock disponible (suma de `cantidad_disponible`). Es un cambio de una línea.
3. `take` por defecto en `compras`, `ajustes`, libro de bóveda y `movimientos`.

No hace falta paginación con cursores ni librerías; basta `take` + filtro por fecha.

**Confianza:** Confirmado (el código); el momento exacto de falla es Probable.

---

### ARQ-03 🔴 Un solo turno `ABIERTA` global frente a "1–2 cajas"

**Evidencia**
- `ventas.service.ts:25` (`findFirst({ where: { estado: 'ABIERTA' } })`), `compras.service.ts:93-98`, `movimientos_financieros.service.ts:77-80` y `cajas_turnos.service.ts:39-47` (rechaza abrir un segundo turno con 409): todo el sistema asume que existe **un** turno abierto. Hay 13 consultas `estado = 'ABIERTA'` sin `caja_id`.
- `cajas_turnos` no tiene identificador de caja física ni de cajero responsable del cuadre (solo `usuario_id` de quien abre). El índice único parcial pendiente en el backlog (`ux_cajas_turnos_una_abierta`) lo volvería regla de BD.
- El contexto del producto habla de 1–2 cajas.

**Escenario.** Si la tienda usa **dos cajas a la vez** (dos cajeras, o la dueña y una cajera), las dos venden contra el mismo turno y el mismo `efectivo_esperado`. Al cerrar, se cuenta una sola gaveta combinada: si hay un faltante, no hay forma de saber de cuál caja ni de quién. Si en cambio la segunda caja es solo un respaldo, no hay problema.

**Impacto.** Si hay dos gavetas simultáneas, el cuadre diario (una de las funciones centrales del sistema) pierde sentido. Cambiarlo después toca ventas, compras, movimientos, devoluciones y el cierre.

**Recomendación.** Antes del arranque, **preguntarle a la dueña** si habrá dos cajas simultáneas. Si **no**: dejarlo así y registrarlo como decisión (ADR corto: "una caja a la vez"), y de paso aplicar el índice único parcial ya previsto en el backlog. Si **sí**: la solución proporcionada es agregar `caja_id` (o `nombre_caja`) a `cajas_turnos` y que "turno abierto" signifique "turno abierto de ESTA caja" (el cajero/caja viaja en la sesión). Agregar la columna ahora es gratis, porque aún no hay baseline de migraciones. No se necesita nada más (ni multi-sucursal).

**Confianza:** Confirmado.

---

### ARQ-04 🟡 `POST /ventas` sin idempotencia ni timeout: un reintento duplica la venta

**Evidencia**
- `erp-tienda-backend/src/ventas/dto/create-venta.dto.ts:23-35` — el DTO no tiene clave de idempotencia; `ventas` no tiene columna única que la soporte (`schema.prisma:241-257`).
- `erp-tienda-frontend/lib/api.ts:24-27` — `fetch` sin `AbortController` ni timeout.
- `erp-tienda-frontend/app/dashboard/pos/page.tsx:241-280` — si la petición falla con error de red, el carrito se conserva (solo se limpia en éxito) y el botón vuelve a quedar activo.

**Escenario.** Wi-Fi inestable: la cajera pulsa "Procesar pago", el servidor guarda la venta y descuenta stock, pero la respuesta se pierde. La pantalla muestra "Failed to fetch" con el carrito intacto. Ella reintenta: segunda venta idéntica, doble descuento FIFO, `efectivo_esperado` inflado en el monto de la venta. Al cierre aparece un faltante que en realidad es una venta duplicada. El doble clic sí está cubierto (`checkoutLoading`), pero no el reintento tras un error ambiguo.

**Impacto.** Descuadres inexplicables, justo con la conexión doméstica que el propio doc de contingencia da por poco confiable. Se corrige con "Anular", pero solo si la cajera descubre el duplicado.

**Recomendación.** Una columna `ventas.clave_idempotencia String? @unique`; el POS genera un `crypto.randomUUID()` al armar el carrito y lo reenvía en el reintento; si la clave ya existe, el servidor devuelve la venta existente en lugar de crear otra. Es ~15 líneas. En el cliente, un timeout (~20 s) en `apiFetch` con mensaje "No se pudo confirmar: revisa Movimientos antes de reintentar". Aplicar la columna antes del baseline de migraciones.

**Confianza:** Confirmado.

---

### ARQ-05 🟡 La venta hace N+1 consultas dentro de una transacción de 5 s por defecto

**Evidencia**
- `ventas.service.ts:82-176` — por cada línea del carrito: `findUnique` de la presentación (84), `create` del detalle, `SELECT … FOR UPDATE` de lotes (121), y por cada lote un `update` (150) y un `create` (160). Todo secuencial, dentro de `$transaction` (48).
- Ninguna llamada a `$transaction` pasa `timeout` ni `maxWait` (`grep -rn "maxWait\|timeout" src` no encuentra nada), así que aplica el valor por defecto de Prisma (5 s).

**Escenario.** Un carrito de 15 líneas con ~2 lotes cada una son ~110 consultas secuenciales. Con la BD en Supabase y el API en otra región (30–50 ms por consulta ida y vuelta), eso son 3–5 s: el borde de los 5 s. Un carrito grande (compra semanal del barrio) falla con "Transaction already closed" y 500, y mientras tanto sostiene los `FOR UPDATE` sobre el turno y los lotes, bloqueando a la otra caja.

**Impacto.** Fallas intermitentes justo en las ventas más grandes, difíciles de reproducir en desarrollo (BD local, 1 ms por consulta).

**Recomendación.** Tres cambios pequeños y compatibles con el diseño actual de locks: (1) leer todas las presentaciones del carrito de una vez con `findMany({ where: { id: { in: ids } } })`; (2) pasar `{ timeout: 15000 }` a `$transaction` de ventas y devoluciones; (3) desplegar API y Supabase en la **misma región** (o la más cercana). No hace falta reescribir el FIFO en SQL puro.

**Confianza:** Probable (depende de la latencia real entre Cloud Run y Supabase).

---

### ARQ-06 🟡 Pool `pg` sin configurar ni manejador de errores; cold starts

**Evidencia**
- `erp-tienda-backend/src/prisma/prisma.service.ts:13` — `new Pool({ connectionString })`: sin `max`, sin `idleTimeoutMillis`, sin `ssl` explícito, sin `pool.on('error', …)`.
- `main.ts:64` (`app.listen`) y `usuarios.service.ts:13` (`onModuleInit` consulta la BD): el arranque hace conexión + conteo antes de aceptar tráfico.

**Escenario.** (a) Supabase/pgBouncer cierra conexiones ociosas; el `Pool` de `pg` emite un evento `'error'` en un cliente ocioso y, sin manejador, Node lo trata como excepción no capturada y **tira el proceso**. En Cloud Run se reinicia solo, pero la petición en curso falla. (b) `max` por defecto es 10 por instancia: con autoescalado, instancias × 10 puede agotar el límite de conexiones del plan de Supabase. (c) Con `min-instances=0`, la primera petición tras un rato de inactividad paga el arranque de Nest + Prisma + conexión (varios segundos); ocurre cada mañana al abrir la tienda.

**Impacto.** Errores esporádicos que no se reproducen, y una primera venta del día lenta justo cuando hay cola de clientes.

**Recomendación.** `new Pool({ connectionString, max: 5, idleTimeoutMillis: 30000 })` + `pool.on('error', (e) => console.error('pg pool', e))`; usar la URL del pooler de Supabase para runtime y la directa solo para migraciones; en Cloud Run fijar `max-instances: 2` y `min-instances: 1` (cuesta unos pocos dólares al mes, y además conserva el throttler en memoria válido). Verificar que la cadena lleve `sslmode=require`.

**Confianza:** Probable.

---

### ARQ-07 🟡 Compras al crédito sin camino de pago

**Evidencia**
- `compras.service.ts:77-86` crea `cuentas_por_pagar` con `saldo_pendiente = monto`. `grep -rn "cuentas_por_pagar\|saldo_pendiente" src` solo encuentra la creación y la suma en `reportes.service.ts:260-263`: no existe ningún endpoint ni lógica que **reduzca** el saldo.
- `CompraForm.tsx:269` ofrece "Al crédito" en el selector.

**Escenario.** La dueña compra mercadería al crédito a un distribuidor (muy común). Una semana después paga en efectivo. El sistema no tiene "pagar cuenta": si lo registra como `EGRESO_OPERATIVO`, cuenta como gasto y duplica el costo (ya entró al inventario); si no lo registra, la gaveta no cuadra. La deuda queda para siempre en `deudas` y en el patrimonio neto.

**Impacto.** El patrimonio queda falseado de forma permanente y el cuadre de caja se rompe el día del pago. Es de esas cosas que se descubren al mes y no tienen arreglo limpio.

**Recomendación.** Decidir antes de la primera compra real, entre (a) **ocultar "Al crédito"** hasta tener el flujo, o (b) un `POST /cuentas-por-pagar/:id/pagar { monto, origen: GAVETA|BOVEDA }` que cree un `PAGO_PROVEEDOR` (reutiliza la lógica de `compras.service.ts:88-164`) y descuente `saldo_pendiente` en la misma transacción. (b) son ~50 líneas y un botón en la lista de compras.

**Confianza:** Confirmado.

---

### ARQ-08 🟡 Compras, gastos y ajustes no se pueden corregir sin ensuciar el P&L

**Evidencia**
- Ni `compras`, ni `movimientos_financieros`, ni `ajustes_inventario` tienen endpoint de anulación o edición (controllers: solo `POST` y `GET`). Los lotes tampoco se editan.
- La única salida para un lote con costo mal digitado es `ajustes_inventario` con merma, que además registra un `MERMA_INVENTARIO` en el P&L (`ajustes_inventario.service.ts:84-97`).

**Escenario.** Ana digita $10.00 en vez de $1.00 al costo de una caja de galletas. El lote entra con costo 10x. Cada venta FIFO calcula un margen negativo; el estado de resultados y "margen por producto" quedan mal hasta que se agote el lote. Para "arreglarlo" tendría que mermar todo el lote (pérdida ficticia en el P&L) y recomprar. Igual con un gasto de $50 que era $5: ya salió de la gaveta y no hay forma de revertirlo.

**Impacto.** Frente a un error humano muy probable en una usuaria no técnica, el sistema obliga a ensuciar las cifras. Contradice "apoyar, no imponer".

**Recomendación.** Lo más barato, sin edición libre: **anular** (soft) una compra o un gasto si el lote no se ha tocado / en el mismo turno, que genere el movimiento inverso y quede marcado `ANULADA` con justificación, igual que ya se hace con las ventas (`ventas.service.ts:235`). Para el costo mal digitado, permitir corregir `costo_unitario_adquisicion` de un lote **sin ventas** (o con aviso si ya se vendió). Empezar por la anulación de gasto y de compra; el resto puede esperar a que ocurra.

**Confianza:** Confirmado.

---

### ARQ-09 🟡 Gestión de usuarios: borrado duro pierde autoría, JWT sin revocación, sin desactivar

**Evidencia**
- `usuarios.service.ts:120-128` — `remove` hace `delete`; todas las FK a `usuarios` son `onDelete: SetNull` (`schema.prisma:31, 53, …`), así que se borra el **autor** de todas sus ventas, turnos, movimientos y ajustes.
- `jwt.strategy.ts:27-33` — `validate()` no consulta la BD; `auth.module.ts:27` fija 12 h.
- `usuarios.controller.ts` / `usuarios.service.ts:90-118`: nada impide que el ADMIN borre o degrade a la única cuenta ADMIN (queda sin acceso; el seed solo corre con tabla vacía, `usuarios.service.ts:13-18`).
- No hay endpoint para que un usuario cambie su propia contraseña. `rol` acepta `ADMIN`/`CAJERO` (`create-usuario.dto.ts`), pero `VENDEDOR` sigue en 3 controllers y en `lib/navigation.ts:20`.

**Escenario.** Una cajera renuncia. La dueña la "elimina": desaparece quién hizo cada venta y cada cierre que la cajera hizo (justo lo que sirve para investigar un patrón de faltantes), y si la cajera ya tenía una sesión abierta, su token sigue siendo válido hasta 12 h. Si la dueña se equivoca y se degrada a CAJERO, nadie puede volver a ser admin.

**Impacto.** Pérdida irreversible de trazabilidad y una ventana de acceso tras la baja.

**Recomendación.** Reemplazar "eliminar" por **desactivar**: `usuarios.activo Boolean @default(true)`; `login` rechaza inactivos, y `JwtStrategy.validate` verifica `activo` (una consulta por request, o caché de 60 s) — lo que también hace efectivos los cambios de rol al instante. Rechazar desactivar/degradar al último ADMIN activo. Retirar `VENDEDOR` del código para no mantener un rol fantasma. Agregar la columna antes del baseline.

**Confianza:** Confirmado.

---

### ARQ-10 🟡 La autoría se guarda pero ninguna API/UI la muestra; la anulación no guarda autor

**Evidencia**
- `usuario_id` ya existe en `ventas`, `cajas_turnos`, `movimientos_financieros`, `ajustes_inventario`, `devoluciones` e `historial_precios` (`schema.prisma`). El backlog (`hardening-backlog.md`, ítem 3) lo sigue listando como pendiente: está **desactualizado**.
- Ningún `findAll`/`findOne` hace `include` de `usuarios` (p. ej. `ventas.service.ts:205-233`, `movimientos_financieros.service.ts:165-190`) y `grep -rn "usuario" erp-tienda-frontend/{app,components}` no muestra autor en ninguna pantalla.
- `ventas` no tiene `anulada_por` (`ventas.service.ts:307-314` solo guarda justificación y fecha); `compras_inventario` no tiene `usuario_id`; el endpoint `anular` ni siquiera recibe `@CurrentUser`.

**Escenario.** La dueña ve en Movimientos un `RETIRO_PERSONAL` de $40 o una venta anulada y no puede saber qué cajera lo hizo, aunque el dato está en la BD.

**Impacto.** El principal valor de la trazabilidad (disuasión y revisión) no se está cobrando. Es barato de cerrar.

**Recomendación.** (1) `include: { usuarios: { select: { nombre: true } } }` en los listados de ventas, turnos y movimientos, y una columna "por" en Movimientos. (2) Agregar `ventas.anulada_por Int?` y guardarlo; `usuario_id` a `compras_inventario`. (3) Corregir el backlog. Siguiendo el principio "registrar y avisar": solo mostrar, no bloquear.

**Confianza:** Confirmado.

---

### ARQ-11 🟡 `CAJERO` puede más por API que lo que muestra la UI

**Evidencia**
- `movimientos_financieros.controller.ts:7` — `@Roles('ADMIN','CAJERO','VENDEDOR')` y el DTO acepta `INGRESO_CAPITAL`, `RETIRO_PERSONAL` y `RETIRO_BOVEDA` (`create-movimientos_financiero.dto.ts:15-18`). La UI del POS solo ofrece retiro a bóveda, gasto y retiro personal (`SacarDineroDialog.tsx:112-123`), pero la API acepta `INGRESO_CAPITAL` de un cajero.
- `categorias_gastos.controller.ts:15` — un `CAJERO` puede crear, **renombrar y borrar** categorías de gasto (el renombre cambia retroactivamente los reportes).
- `GET /productos` (`productos.controller.ts:106-129`) y `GET /ventas/:id` (`ventas.service.ts:221-233`, incluye `detalle_venta_lotes.costo_aplicado`) devuelven **costos de adquisición** y márgenes a un cajero; `GET /caja-general/saldo` (`caja_general.controller.ts:47-50`) le da el saldo de la bóveda.
- Comentario obsoleto en `lib/navigation.ts:16-19` ("D7"): dice que Gastos es ADMIN porque toca `/caja-general`, pero el endpoint real es `/movimientos-financieros`.

**Escenario.** Una cajera con un faltante de $20 registra un `INGRESO_CAPITAL` de $20 por la API (o con una consulta cualquiera) y el cierre cuadra. No es un hueco de seguridad "externo": es alguien con acceso legítimo.

**Impacto.** Moderado: queda registro con su `usuario_id`, pero hoy nadie lo ve (ARQ-10). Costos y saldos visibles a la cajera pueden ser indeseados o no, según la dueña.

**Recomendación.** Por "apoyar, no imponer": **no endurecer todo**. Mínimo: `INGRESO_CAPITAL` y renombrar/borrar categorías de gasto solo `ADMIN`, y el resto se cubre mostrando el autor (ARQ-10). Decidir con la dueña si el cajero debe ver costos; si no, quitar `costo_unitario_adquisicion` del `select` cuando `rol=CAJERO`. Quitar `VENDEDOR` (ver ARQ-09).

**Confianza:** Confirmado.

---

### ARQ-12 🟡 El efectivo de gaveta se calcula en 3 lugares y no hay reconciliación

**Evidencia**
- "Qué quedó en la gaveta tras el último cierre" (= `efectivo_declarado` − Σ `TRASLADO_A_BOVEDA`) está implementado tres veces: `cajas_turnos.service.ts:109-136` (`getUltimoCierre`), `reportes.service.ts:201-228` (`getEfectivoGaveta`, copia literal) y en el cliente `pos/page.tsx:202` (`fondoSiguiente = efectivoParsed - bovedaParsed`).
- `cajas_turnos.efectivo_esperado` es un **contador mutable** actualizado a mano en 5 servicios (`ventas.service.ts:194`, `:332`, `:486`; `compras.service.ts:131`; `movimientos_financieros.service.ts:145`, `:157`). Los asientos de ventas y devoluciones no viven en `movimientos_financieros`, así que `getFlujoEfectivo` (`reportes.service.ts:288-345`) los reconstruye aparte.
- No existe ninguna verificación de que `efectivo_esperado` coincida con `fondo_inicial + ventas COMPLETADAS − devoluciones ± movimientos del turno`.

**Escenario.** Un bug futuro (o una de las rutas de escritura que se agreguen, como ARQ-07 o ARQ-08) olvida actualizar el contador: el turno cierra con un descuadre fantasma que se atribuye a la cajera. Al cambiar la regla del fondo siguiente, hay que acordarse de tocar tres archivos.

**Impacto.** Riesgo de divergencia silenciosa en la cifra más sensible del sistema, y deuda de mantenimiento.

**Recomendación.** Proporcional, sin reescribir el modelo: (1) una única función `fondoSiguienteDesdeUltimoCierre(client)` en `common/cuentas-efectivo.ts` que usen `getUltimoCierre` y `reportes`, y que el cliente use el `fondo_siguiente` que ya devuelve la API; (2) una función `efectivoEsperadoRecalculado(turnoId)` (suma de ventas + movimientos − devoluciones) usada en **un test e2e** que ejecute una mezcla de operaciones y compare con el contador (ver ARQ-19), y opcionalmente en el cierre para registrar un aviso si difieren. No hace falta eliminar el contador.

**Confianza:** Confirmado.

---

### ARQ-13 🟡 Reportes cargan cientos de miles de filas a memoria en rangos largos

**Evidencia**
- `reportes.service.ts:48-69` — el costo de ventas trae **todas** las filas de `detalle_venta_lotes` del período con `findMany` y las suma en Node, en vez de un `SUM(cantidad_descargada * costo_aplicado)`.
- `reportes.service.ts:350-365` — `getProductosTop` trae todos los `detalle_ventas` del período con `presentaciones.productos` y `detalle_venta_lotes`, y agrupa en memoria; `getMargenPorProducto` (437-441) lo vuelve a llamar con `limit 9999`.
- `stats/page.tsx:182-186` lanza 5 endpoints por cada cambio de rango.

**Escenario.** El rango por defecto (el mes) mueve ~6.000 ventas y ~20.000 filas, tolerable. Si la dueña elige "todo el año" (~75.000 ventas, ~250.000 detalles, ~300.000 puentes de lote), el API arma cientos de MB de objetos en una instancia pequeña de Cloud Run (512 MB de memoria típica): lento o fuera de memoria. Además `unidades_vendidas` mezcla unidades base distintas (kg y unidades) para ordenar (línea 427).

**Impacto.** Estadísticas que dejan de cargar justo cuando más datos hay y más útiles serían.

**Recomendación.** Reemplazar los dos agregados por una consulta `$queryRaw` con `SUM … GROUP BY` (hay precedente en `getPatrimonio`, línea 242). Es una función por reporte y no cambia los resultados. Topes razonables de rango (p. ej., 366 días) en `parsePeriodo`.

**Confianza:** Confirmado (código); el umbral de memoria es Probable.

---

### ARQ-14 ⚪ Ajuste de inventario sin lock del lote (carrera con una venta)

**Evidencia.** `ajustes_inventario.service.ts:23-27` lee el lote con `findUnique` **sin** `FOR UPDATE` y valida `cantidad_disponible >= cantidad_ajustada` (línea 33); el `decrement` (línea 50) se aplica después. La venta sí bloquea los lotes (`ventas.service.ts:121-128`). No hay `CHECK (cantidad_disponible >= 0)` (backlog ítem 2).

**Escenario.** Quedan 5 unidades; el admin registra una merma de 5 mientras una cajera vende 5 del mismo lote. Ambas pasan la validación; el lote queda en −5.

**Impacto.** Bajo: requiere simultaneidad y ajustes son ADMIN-only. Pero deja un stock negativo que rompe el FIFO de las ventas siguientes.

**Recomendación.** Mismo patrón que el resto del sistema: `SELECT … FOR UPDATE` del lote al inicio de la transacción. Y adelantar el `CHECK` del backlog, que lo convertiría en un error limpio.

**Confianza:** Confirmado.

---

### ARQ-15 🟡 Frontend: fallo de red = "no hay caja", sesión que expira pierde el carrito, precios cacheados

**Evidencia**
- `pos/page.tsx:128-146` — `loadCaja` tiene un `catch {}` genérico: cualquier error (red caída, 500, timeout, 401) se interpreta como "no hay turno abierto" y luego intenta `/ultimo-cierre`, que también falla → `fondo = 0`. La UI muestra "Abre la caja primero".
- `lib/api.ts:24-43` — sin timeout ni distinción entre error de red y de negocio; `res.json()` en respuestas sin cuerpo falla.
- `lib/api.ts:30-36` y `login/page.tsx:55` — con 401 o a las 12 h exactas (cookie y JWT), se redirige al login; `cartStore.ts` no persiste el carrito y se pierde.
- `pos/page.tsx:209-232` — "Cerrar caja" hace `cerrar` y luego `abrir`; si lo segundo falla, el toast dice "Error al cerrar caja" aunque ya cerró, y el estado local mantiene `cajaActiva` obsoleta.
- `inventoryStore.ts:49` — catálogo y precios cacheados 3 minutos; el carrito toma el precio del caché (`pos/page.tsx:318`), pero el backend cobra el precio vigente de la BD (`ventas.service.ts:103`) y la UI **ignora** la respuesta de `POST /ventas` (línea 259).

**Escenario.** (a) Se cae el Wi-Fi un momento y la pantalla de ventas pasa a "Abre la caja primero" con el turno aún abierto: la cajera, asustada, intenta abrir otro y recibe un 409 confuso. (b) Quien entró a las 8 am queda sin sesión a las 8 pm en plena venta, con el carrito perdido. (c) La dueña sube un precio y durante 3 minutos la caja muestra y calcula el cambio con el precio viejo, pero la venta se registra con el nuevo.

**Impacto.** Confusión y pérdida de trabajo en el punto de venta; diferencias de centavos entre lo que se mostró y lo que se registró.

**Recomendación.** Cambios pequeños, ninguno exige rediseño: (1) en `loadCaja`, distinguir 404 ("no hay caja") de cualquier otro error ("no se pudo verificar la caja, reintenta") con un botón de reintento; (2) timeout de ~20 s y mensaje claro en `apiFetch`; (3) persistir el carrito en `sessionStorage`; (4) mostrar el `total` devuelto por el servidor tras la venta y, si difiere del mostrado, avisar; (5) en el cierre, si falla la reapertura, informar "caja cerrada; ábrela de nuevo". Considerar bajar el TTL del catálogo del POS o invalidar al editar precio (ya se invalida con `invalidateCache` en la misma pestaña).

**Confianza:** Confirmado.

---

### ARQ-16 ⚪ Productos no se pueden desactivar; el alta es una secuencia no atómica

**Evidencia.** `productos.service.ts:82-87` solo ofrece `delete` duro, que falla por FK en cuanto hay lotes o ventas (`PrismaExceptionFilter`: `P2003` → 400). No existe `activo` en `productos`/`presentaciones` (`schema.prisma`). `ProductDialog.tsx:142-157` crea el producto y luego cada presentación con llamadas separadas; `EditProductDialog.tsx:92-120` actualiza producto y luego cada presentación en serie.

**Escenario.** (a) Un producto descontinuado seguirá apareciendo en el buscador del POS para siempre. (b) Si la segunda llamada de alta falla (red), queda un producto sin presentaciones: no se puede vender y es invisible en el POS.

**Impacto.** Catálogo que se ensucia con el tiempo; pequeños productos huérfanos.

**Recomendación.** `activo Boolean @default(true)` en `presentaciones` (o productos), filtrado en el POS; reemplazar "eliminar" por "desactivar". Aceptar `presentaciones` anidadas en `POST /productos` (`create: [...]` de Prisma es una sola transacción). Poco costo; hacerlo junto al baseline.

**Confianza:** Confirmado.

---

### ARQ-17 ⚪ Modelo: estados `String` libres, fechas y autor nullable, sin CHECK de montos, redondeo implícito

**Evidencia**
- `estado`, `tipo_movimiento`, `tipo_ajuste`, `destino`, `origen_fondos`, `estado_pago`, `rol`, `tipo` son `String` (`schema.prisma:43, 247, …`); `'ABIERTA'` se compara literal en 13 sitios. (El backlog ya lo menciona como "menor".)
- `ventas.fecha`, `movimientos_financieros.fecha`, `cajas_turnos.fecha_apertura` y `compras_inventario.fecha` son `DateTime?` con default (`schema.prisma:27, 86, 172, 246`). Un `NULL` quedaría fuera de todos los reportes por rango.
- Sin `CHECK` de `monto > 0`, `total >= 0`, `cantidad > 0` (el backlog solo contempla dos constraints).
- `detalle_ventas` no guarda `precio_unitario` ni snapshot de `factor_conversion`/nombre; `getProductosTop` usa el `factor_conversion` **actual** (`reportes.service.ts:381-383`): editar el factor reescribe las "unidades vendidas" históricas.
- El `subtotal` de cada línea (`ventas.service.ts:103`) y el `total` (`:104`) se calculan sin redondeo explícito y se redondean al guardarse en `Decimal(10,2)`: la suma de subtotales redondeados puede diferir en un centavo del total (por ejemplo, dos líneas de 0,333 × $1,10).

**Impacto.** Bajo hoy; son trampas para el futuro.

**Recomendación.** Cuando se haga el baseline: enums para los estados que el código compara, `NOT NULL` en las fechas con default, `CHECK` de montos y cantidades positivas junto a los ya previstos, `fecha` de `compras` también; redondear cada subtotal a 2 decimales (`toDecimalPlaces(2)`) antes de sumarlo, tal como ya hace `devolver` (`ventas.service.ts:441-443`); agregar `precio_unitario` a `detalle_ventas` si algún día se quieren reportes de precio.

**Confianza:** Confirmado.

---

### ARQ-18 🟡 Configuración de producción: defaults abiertos, IP tras proxy, observabilidad ciega

**Evidencia**
- `main.ts:16-19` — Swagger se enciende si `NODE_ENV !== 'production'`: si en Cloud Run se olvida definir `NODE_ENV`, queda **activo** (y la CSP de helmet desactivada, línea 24-26). Es un default que falla abierto.
- `main.ts:31-33` — `origin: '*'` si `NODE_ENV === 'development'` (que es lo que fija `docker-compose.yml`).
- No hay `app.set('trust proxy', …)` (grep vacío). Detrás de Cloud Run o de un balanceador, `req.ip` es la IP del proxy, no la del cliente. El `ThrottlerGuard` (`app.module.ts:33-40`, 60 req/min global y 5/min en login, `throttler-limits.ts:11-12`) contaría a **todos** los usuarios como una sola IP.
- Observabilidad: solo `console.log` (`prisma.service.ts:21`, `main.ts:65`); `/health` (`app.controller.ts`) no toca la BD; no hay alertas ni registro de request-id; los errores 4xx de negocio no se registran.
- `docker-compose.yml` trae valores por defecto de `JWT_SECRET` y `INITIAL_ADMIN_PASSWORD` (`Admin123!`) pensados para desarrollo.

**Escenario.** (a) Tras un despliegue sin `NODE_ENV`, la documentación completa de la API queda pública. (b) Con `trust proxy` sin configurar, 5 intentos fallidos de login de cualquiera bloquean el login de todos (incluida la dueña) durante un minuto; y a la inversa, el límite de 60 req/min lo comparten las dos cajas y el dashboard. (c) Si Supabase se pausa o cae, nadie se entera hasta que la cajera llama.

**Impacto.** Superficie expuesta por olvido, y bloqueos o caídas silenciosas.

**Recomendación.** Invertir el default: Swagger solo si `ENABLE_SWAGGER === 'true'`; `app.set('trust proxy', 1)` cuando `NODE_ENV=production` (al estar tras un único proxy); `/health` con un `SELECT 1` y un monitor externo gratuito (UptimeRobot o el uptime check de GCP) apuntando ahí, con aviso por correo; fallar el arranque si `NODE_ENV=production` y el `JWT_SECRET` es corto o igual al del compose. Basta con los logs de Cloud Run: no hace falta Sentry ni stack de observabilidad.

**Confianza:** Probable (depende del despliegue); el código está Confirmado.

---

### ARQ-19 🟡 Huecos de testing: roles, compras, movimientos, reconciliación de efectivo

**Evidencia.** Hay 11 suites e2e contra Postgres real y solo 2 unitarias, que ejercitan bien ventas FIFO, concurrencia, anulación, devoluciones, cierre y reportes. Sin cobertura: ninguna prueba de **roles** (que `CAJERO` reciba 403 en rutas ADMIN; `app.e2e-spec.ts` solo prueba `GET /`), de **login/throttle**, de **compras** (monto recalculado, `AL_CREDITO`, fondos insuficientes en `CAJA_POS` y bóveda), de **movimientos** de gaveta con fondos insuficientes, de **ajustes concurrentes con ventas** (ARQ-14), ni de la **invariante `efectivo_esperado` = recálculo desde el libro** (ARQ-12). El frontend no tiene tests; el CI solo hace lint y build (`.github/workflows/ci.yml`).

**Impacto.** Las regresiones más probables (un `@Roles` mal puesto al agregar un endpoint, un camino de escritura que olvida el contador) no se detectarían.

**Recomendación.** Cuatro e2e pequeños: (1) una tabla de rutas × rol esperado; (2) compras (los tres orígenes de fondos); (3) un test "recorrido del día" que mezcle venta, compra desde gaveta, gasto, devolución, anulación y cierre, y compare `efectivo_esperado` con el recálculo; (4) idempotencia, si se adopta ARQ-04. No se recomienda cobertura unitaria amplia ni tests de UI por ahora.

**Confianza:** Confirmado.

---

### ARQ-20 ⚪ Higiene: endpoint `/resumen` incorrecto y sin uso, archivos sueltos, docs desactualizados

**Evidencia**
- `cajas_turnos.service.ts:288-361` (`getResumen`): suma `total_ventas` **sin filtrar `estado`** (línea 301-305, incluye ANULADAS) y no resta devoluciones. El frontend no lo llama (`grep "/resumen"` vacío).
- `erp-tienda-backend/query_test.ts` (script suelto de la raíz del backend), `erp-tienda-backend/scripts/*.sql` y `audit_results.txt` (datos de prueba con IDs 99000+ y un usuario `AUDITOR_TEST` ADMIN con hash falso), `scripts/keep_alive.sh` y `render-keepalive.service` (para Render, no GCP).
- Docs: `caja-y-ventas.md` y `data-model.md` (ya conocidos), y `hardening-backlog.md` ítem 3 (autoría "pendiente", ya existe `usuario_id`), `security.md` ("las operaciones financieras no registran qué usuario las ejecutó").
- `POST /caja-general/inyeccion` con tipo inline (`caja_general.controller.ts:22`); `PATCH :id/anular` con `@Body('justificacion_nula')` sin DTO (`ventas.controller.ts:42`); `+id` sin `ParseIntPipe` en `ventas`, `compras`, `movimientos`, `usuarios` (un `/ventas/abc` da un 500 de Prisma en vez de un 400).

**Impacto.** Bajo. El riesgo real es que alguien use `/resumen` o corra un script de prueba contra la BD real.

**Recomendación.** Borrar `getResumen` (o corregirlo con `estado: 'COMPLETADA'` y devoluciones si algún día se usa), mover `query_test.ts` y los scripts SQL a una carpeta `docs/` o `scripts/dev/` con una advertencia en la cabecera ("NUNCA contra producción"), y corregir los docs señalados al tocar cada tema. Usar `ParseIntPipe` y DTOs donde faltan, es una sola clase y un decorador por controller.

**Confianza:** Confirmado.

---

## Sobre lo ya conocido (opinión de prioridad)

- **Backup automatizado (plan-fases, pendiente 2.E):** hoy es el mayor riesgo de pérdida total y debería ser 🔴, no un "pendiente". Verificar el plan de Supabase: los planes gratuitos no incluyen backups gestionados ni PITR, y pausan el proyecto tras inactividad prolongada (Probable; confirmar con la documentación vigente). Lo más simple que sirve: plan Pro con backups diarios, o un `pg_dump` nocturno a un bucket de GCS con un job programado, **más un ensayo de restauración** una vez.
- **Migraciones y constraints (backlog 1 y 2):** de acuerdo en que son bloqueantes. Conviene empaquetar con el baseline los cambios de schema que recomienda este informe (`ventas.clave_idempotencia`, `usuarios.activo`, `ventas.anulada_por`, `caja_id` si aplica, `activo` en presentaciones, NOT NULL en fechas, CHECK de montos), porque después cada uno exige una migración versionada.
- **Cookie JWT httpOnly (backlog 4):** de acuerdo en diferir; el riesgo es XSS y la app no renderiza HTML de usuario. Prioridad menor que ARQ-09 (revocación) y que ARQ-04.
- **Redis para el throttler (backlog 5):** de acuerdo en no hacerlo. Con `max-instances` bajo (1–2) el store en memoria alcanza.
- **Enums (backlog "menores"):** de acuerdo en diferir hasta el baseline (ARQ-17).
- **Server Components (H13):** de acuerdo: reescribir el data-fetching no aporta valor para una tienda; los problemas del frontend (ARQ-15, ARQ-02) se resuelven sin ello.

## Posible sobrediseño (sin hallazgo formal)

- La capa de **bóveda, arqueo, patrimonio, flujo de efectivo, estado de resultados y margen por producto** (`reportes.service.ts`, `caja_general.service.ts`, `stats/page.tsx` de 755 líneas) es contable bastante completa para una usuaria que no es contadora. No hay que quitarla (está hecha y probada), pero **no ampliarla** hasta ver si la dueña la usa; cada reporte nuevo ha traído bugs de coherencia (ver ARQ-12, ARQ-20). Vale la pena preguntar qué pantallas abre de verdad.
- Los **dos mecanismos de bloqueo** (`FOR UPDATE` y advisory locks) con ADR propio son más de lo estrictamente necesario para 1–2 cajas, pero ya están probados con tests de concurrencia y no cuestan en tiempo de ejecución. Mantener, no extender.
- En frontend, las páginas de 400–750 líneas (`pos`, `stats`, `movimientos`, `inventario`) y las interfaces `CajaTurno`/`Venta` duplicadas en 4 archivos son deuda leve. **No refactorizar ahora**; extraer `types/api.ts` solo al tocar esas pantallas por otra razón.

## Lo que está bien y conviene conservar

- **Concurrencia bien resuelta y probada:** orden de locks documentado (turno → venta → lotes), advisory lock para el turno único y la bóveda, tests de doble anulación, doble cierre, doble apertura y sobreventa (`test/*.e2e-spec.ts`).
- **El cobro nunca confía en el cliente:** el precio sale de la BD (`ventas.service.ts:103`), el monto de compra se recalcula desde los lotes (`compras.service.ts:37-45`) y `ValidationPipe` con `whitelist` + `forbidNonWhitelisted` es global.
- **Modelo contable simple y verificable:** libro origen→destino con catálogo cerrado de cuentas, bóveda derivada (sin tabla de saldo), costo FIFO congelado en `detalle_venta_lotes` y devoluciones que revierten al lote exacto.
- **Registrar y avisar, no bloquear:** descuadre bajo el umbral se ajusta solo pero siempre se registra; el cierre forzado, el modo contingencia y las mermas sin turno siguen el principio del dueño.
- **Reportes en la zona horaria del negocio** y rechazo de fechas futuras con tests (`reportes-zona-horaria.e2e-spec.ts`).
- **Seguridad de base sensata:** guards globales (JWT + roles + throttler) con `@Public` explícito, helmet, CORS con allowlist en producción, `JWT_SECRET` obligatorio, seed del admin por variable de entorno, `PrismaExceptionFilter`.
- **Navegación por rol en una sola fuente** (`lib/navigation.ts`) con el backend como autoridad real, y logout que limpia los stores.
- **CI que corre e2e contra Postgres real**, con lint sin `--fix` y build de ambas apps.
