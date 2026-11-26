# Bot de compras (núcleo)

> Código: el núcleo vive en `erp-tienda-backend/src/bot/nucleo/` y el adaptador de Telegram aparte, en
> `src/bot/telegram/`; el adaptador solo habla con el núcleo por el contrato de `contrato.ts`.

La dueña registra **compras de mercadería por chat**: escribe "Compré 2 cajas de coca de lata a 20 cada una y 10 libras
de frijol en 8 dólares, a La Fuente, lo pagué de la gaveta" o manda la **foto de la factura**. El bot le muestra lo que
entendió y ella confirma con un botón.

## Arquitectura: flujo controlado por código, no un agente libre

- El modelo de IA **solo interpreta** y devuelve un **borrador** en JSON. **Nunca escribe en la base ni decide guardar.**
- El código valida el borrador, guarda el estado de la conversación y arma las preguntas y botones.
- Solo cuando la dueña toca **[Sí, guardar]** el código llama a los servicios existentes (`ProductosService`,
  `PresentacionesService`, `ComprasService`). Así se aplican las mismas reglas que en la app: FIFO por lotes, registrar y
  avisar ([ADR 0011](../decisions/0011-registrar-y-avisar.md)), autor de la compra y anular sin borrar
  ([ADR 0012](../decisions/0012-anular-sin-borrar.md)).

## Contrato con el adaptador (`contrato.ts`)

`BOT_NUCLEO` provee `BotNucleo { recibirMensaje(EntradaBot), recibirAccion(AccionBot) } → RespuestaBot`. El adaptador ya
resolvió quién escribe: `usuarioId` es un usuario real, activo y ADMIN (el núcleo lo vuelve a comprobar). Respuestas en
texto plano, máximo ~3500 caracteres; `botones` son filas de `{ texto, datos }` con `datos` ≤ 64 bytes.
Se importa `BotNucleoModule` (exporta `BOT_NUCLEO`).

## Adaptador de Telegram (`src/bot/telegram/`)

- **Modo** (`TELEGRAM_MODO`): `apagado` (por defecto), `polling` (demo local, sin URL pública) o `webhook` (Render). Si el
  modo está activo y falta `TELEGRAM_BOT_TOKEN`, el bot queda apagado y lo avisa en el log.
- **Quién puede usarlo:** solo los Telegram ID listados en `TELEGRAM_USUARIOS` (`id:nombreDeUsuario`), y ese usuario del ERP
  debe existir, estar activo y ser la dueña (ADMIN). A cualquier otro le contesta que no está autorizado (con su ID, para
  que se lo pase a quien administra el sistema). Solo atiende chats privados.
- **Webhook:** `POST /telegram/webhook` es público pero compara el encabezado `X-Telegram-Bot-Api-Secret-Token` con
  `TELEGRAM_WEBHOOK_SECRET`; si no coincide (o falta), 401. Responde 200 de inmediato y procesa aparte. Fuera del modo
  `webhook` responde 404.
- **Fotos:** acepta la foto del chat o la imagen enviada como **documento** (JPEG o PNG), de **máximo 5 MB**; si pesa más,
  le pide mandarla más liviana. El texto de la foto (caption) se manda junto con la imagen.
- Un mensaje a la vez por chat; cada botón se vuelve a autorizar. Variables y puesta en marcha:
  [`../operations/configuration.md`](../operations/configuration.md).

## Flujo

1. **Mensaje** (texto y/o foto) → se arma el contexto (catálogo con ids, memoria de equivalencias, borrador actual) y se
   le pide el JSON al modelo. Si el JSON no cumple la forma, se **reintenta una vez** mandándole el error de validación.
   Si falla otra vez, o falla la red/cuota/modelo, la respuesta es "No pude leer eso ahora, intenta de nuevo en un
   momento" y el borrador anterior se conserva.
2. Se aplican los **alias exactos**, se **une** con el borrador previo (la dueña corrige escribiendo: "no, eran 3
   cajas") y se guarda en `bot_conversaciones`.
3. Respuesta: una línea por producto con la conversión a unidades base, el total, proveedor y pago, y **"Me falta
   saber"** con lo pendiente. Ejemplo:
   `1. 2 Caja (24 c/u) de Coca-Cola 355ml por $40.00 → 48 unidades a $0.8333` y
   `Total $48.00 · Proveedor: La Fuente · Pago: gaveta`. Si compró por algo que no es una presentación del catálogo,
   se ve el paquete: `1. 2 Caja (24 Unidad c/u) de Coca-Cola 355ml por $40.00 → 48 unidades a $0.8333`.
4. **Botones.** Falta el pago: `[Gaveta] [Bóveda] [Quedó fiado]` (`pago:GAVETA|BOVEDA|CREDITO`). Borrador completo:
   `[Sí, guardar] [Cancelar]` (`guardar`, `cancelar`). El pago "capital de la dueña" solo se fija escribiéndolo.
5. **Guardar:** primero los productos nuevos, luego la compra. Un borrador está completo cuando tiene proveedor, forma de
   pago, todas las líneas resueltas en el catálogo con su total, y precio de venta de cada producto nuevo. Si hay un
   error de reglas se dice en palabras de tienda (gaveta sin caja abierta → "No hay caja abierta. ¿La pagaste de la
   bóveda o quedó fiada?") y el borrador se conserva. Un segundo toque de "guardar" no guarda dos veces (el borrador se
   reclama).
6. **Respuesta al guardar:** "Listo: compra #N por $X." + los `avisos` de registrar y avisar + `[Deshacer]`
   (`deshacer:<id>`).
7. **Deshacer:** anula la compra con `ComprasService.anular` y el motivo "Deshecho desde Telegram". Solo si la compra es
   del mismo usuario y de hace menos de 10 minutos; después, se corrige desde la app.
8. `/cancelar` o "cancelar" descarta el borrador. Un borrador de más de 24 h se descarta solo.

### Mapa de pago

| Bot | `estado_pago` | `origen_fondos` |
|---|---|---|
| `GAVETA` | `PAGADO` | `CAJA_POS` |
| `BOVEDA` | `PAGADO` | `CAJA_GENERAL` |
| `CAPITAL` | `PAGADO` | `CAPITAL_DUEÑOS` |
| `CREDITO` | `AL_CREDITO` | (se ignora; queda `CREDITO` y nace la deuda) |

### Conversión

`conversion.ts` repite `convertirLineaCompra` del frontend (`lib/unidades.ts`): "N presentaciones por $T" →
`cantidad × factor` unidades base (3 decimales) y costo por unidad con 4 decimales, probando costos vecinos para que el
total cuadre al centavo. Si no cuadra, el resumen avisa. Una línea con solo precio unitario ("a 20 cada una") toma
`total = precio × cantidad`. Si la factura trae un total que difiere de la suma, se avisa (no bloquea).

### Paquete: lo que compró y no es una presentación del catálogo

Cada línea dice `presentacion_id` y `cantidad` de lo que ella nombró. Si el catálogo tiene esa presentación (p. ej.
"Caja" ×24), la línea la usa y `paquete` es `null`. Si no (el producto solo tiene "Unidad" o "Libra"), la línea usa la
presentación de unidad y trae `paquete: { descripcion: "Caja", unidades: 24 }`: cuántas de la presentación elegida trae
cada paquete. El factor efectivo de la línea es `factor de la presentación × unidades del paquete`; con él se
convierte a unidad base (`convertirLotes`, el resumen y la evaluación). `cantidad` y el precio siguen siendo por lo que
ella nombró (por caja si compró cajas): "2 cajas de coca de 24 a $20 c/u" guarda 48 unidades a $0.8333.

- **Si falta cuántas trae** (`unidades` null) el borrador queda incompleto (sin "Sí, guardar") y el código pregunta, sin
  pasar por el modelo: "¿Cuántas unidades trae cada caja de Galletas?" (o "¿Cuántas libras trae cada quintal de
  Frijol?" si la presentación no es "Unidad"). Su respuesta llega como corrección y completa la línea. Los tamaños fijos
  (docena 12, media docena 6, six-pack 6, quintal 100 libras, arroba 25 libras) los llena el modelo; caja, fardo,
  jaba y bolsa solo si ella dijo cuántas.
- **Sin doble multiplicación:** si la presentación elegida ya es el paquete (p. ej. "Caja" ×24 y paquete "Caja"), el
  código quita el paquete antes de mostrar el borrador (`quitarPaqueteRedundante`), para no guardar 24 × 24.
- Los borradores guardados antes de este campo no lo tienen: se leen como `paquete: null`.

### Productos nuevos

Se crean con `ProductosService.createRapido` (categoría "Por revisar", `por_revisar = true`) con **solo su unidad de
venta**: "Unidad" (o `unidad_venta`, p. ej. "Libra") ×1 con `precio_venta` = precio de **una unidad suelta**, que el bot
pregunta antes de guardar. **Nunca se crea una presentación de caja**: la caja es cómo se compró, no algo que se venda
(así no aparece en el punto de venta). Si lo comprado venía por paquete (`factor` > 1), la línea resultante usa la
unidad de venta con `paquete = { descripcion_presentacion, unidades: factor }`, para que la memoria lo recuerde. Si no
dijo cuántas trae (`factor` null) se pregunta igual que arriba. Tras crear cada producto, pasa a ser una línea del
borrador guardado, para no duplicarlo si la compra falla y se reintenta.

## Memoria de equivalencias (`bot_alias`)

`texto_normalizado` (minúsculas, sin tildes, espacios simples) + `proveedor` (normalizado, opcional) + `paquete`
(normalizado, opcional) → `presentacion_id`, con `usos` y, si hay paquete, `unidades_paquete` (el último valor
confirmado). Al **guardar**, cada línea guarda o refuerza su alias. Antes de interpretar se le pasan al
modelo los ~200 más usados, y si el texto de una línea coincide **exactamente** con un alias, el código fija la
presentación aunque el modelo dude (prefiere el alias del mismo proveedor, luego el más usado). Excepción: si en una
corrección ella ya tenía esa línea con otra presentación y el modelo la cambió a propósito, se respeta el cambio.
Solo cuenta la memoria con el mismo paquete (o sin paquete si la línea no trae). Además, si una línea trae paquete sin
`unidades`, el código lo rellena desde la memoria (mismo texto + mismo paquete + misma presentación; primero el del mismo
proveedor, luego el de más usos) y no pregunta. Al modelo le llega como
`"galletas" en caja -> 123 (caja = 12)`.

## Tablas

Definidas en [`../architecture/data-model.md`](../architecture/data-model.md).

- `bot_conversaciones`: `chat_id` único, `usuario_id`, `borrador` Json, `estado` (`BORRADOR` | `GUARDANDO`),
  `actualizado_en`.
- `bot_alias`: `texto_normalizado`, `proveedor`, `presentacion_id`, `usos`, `paquete` y `unidades_paquete` (opcionales),
  `creado_por_id`, `creado_en`.

## Seguridad

- **El modelo no tiene herramientas**: no puede llamar a nada, solo devuelve texto. Cualquier orden dentro del mensaje o de
  la foto es dato; el prompt (regla 11) manda ignorarla y, aunque la obedeciera, lo único que puede producir es un
  borrador que la dueña ve antes de confirmar.
- Lo que devuelve el modelo se valida con tipos estrictos (`borrador.ts`): ids que existan en el catálogo, cantidades > 0,
  topes de las columnas.
- Solo usuarios ADMIN activos. Deshacer solo del mismo usuario y en 10 minutos.
- Privacidad: se envía a OpenRouter con `provider.data_collection = "deny"` (solo proveedores que no guardan ni entrenan
  con los datos). Va el catálogo (nombres, presentaciones y precios de venta) y los mensajes/fotos de la dueña; **no**
  van saldos, ventas ni datos de personas.
- La clave nunca se imprime en logs.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `OPENROUTER_API_KEY` | Clave de OpenRouter. Sin ella el bot responde "No pude leer eso ahora". |
| `OPENROUTER_MODEL` | Modelo para texto (ID exacto de OpenRouter). |
| `OPENROUTER_MODEL_VISION` | Modelo para fotos (opcional; si falta usa `OPENROUTER_MODEL`, que entonces debe aceptar imágenes). |
| `OPENROUTER_DATA_COLLECTION` | Opcional. `deny` (default) o `allow`. Si un modelo no tiene proveedores que cumplan `deny`, OpenRouter responde error. |

Timeout de 60 s por llamada. Se pide `response_format: json_object`.

## Pruebas

- Unitarios: `conversion.spec.ts`, `borrador.spec.ts` (validador, alias, unión de borradores), `resumen.spec.ts`
  (paquete, pregunta de unidades).
- e2e: `test/bot-nucleo.e2e-spec.ts`, con un `ClienteLlm` falso (sin red).
