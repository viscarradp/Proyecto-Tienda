# Auditoría de interfaz (UX/UI) — micro ERP/POS Tienda Karlita

- **Fecha:** 2026-11-24
- **Commit auditado:** `311edc4` (rama `master`)
- **Alcance:** análisis de código; complementado por el recorrido en vivo del líder.
- **Método:** lectura de las 6 pantallas (`app/auth/login`, `app/dashboard/{pos,inventario,movimientos,gastos,stats}`), sus componentes (`components/{pos,inventario,movimientos,nav,ui}`), `lib/{navigation,api,format}.ts`, los stores de Zustand, `hooks/useBarcodeScanner.ts` y los DTO/esquema del backend solo para confirmar contratos (p. ej. que `cantidad` y `factor_conversion` son decimales). Se contrastó con `docs/rediseno/00-especificaciones.md` y `02-bitacora.md`. No se ejecutó la app: los hallazgos marcados "Probable" conviene verificarlos en vivo.
- **Lente:** dos personas (la cajera con un cliente esperando; la dueña no contadora) y el principio "apoyar, no imponer": cada toque extra, bloqueo, mensaje críptico o número confuso es riesgo de abandono.
- **Nota:** informe congelado; el estado vivo se lleva en `docs/roadmap/`.
- **No se repite lo ya conocido:** "023 uds"/"01.5 uds" en Movimientos, "Ingresos del período" sin devoluciones, desglose de venta sin nombre de producto, hidratación del `theme-toggle`, "Semana" = 8 días, "Stock insuficiente para el producto ID n", y el botón Anular ya corregido. (UX-05 es la misma causa del "023 uds" pero en otras pantallas.)

---

## 1. Resumen ejecutivo

La base visual del rediseño es sólida (tokens, bottom-nav, ticket en bottom-sheet, cifras en mono). Los problemas que quedan no son de estilo sino de **flujo y lenguaje**:

1. **La venta en celular no da confirmación.** Al cobrar, el sheet se cierra y el aviso "¡Venta registrada!" vive dentro del sheet cerrado; tampoco hay toast. La cajera no ve el cambio ni la confirmación (UX-03).
2. **No se puede vender por peso.** El backend acepta cantidades con 3 decimales y presentaciones con factor decimal, pero el ticket solo suma/resta de uno en uno y el formulario de presentaciones convierte en silencio `0.5` en `1` y precio vacío en `$0` (UX-04, UX-15). Para una tienda que vende libras, es la brecha de fondo.
3. **Stock dudoso.** El stock del POS e Inventario se calcula con `0 + "10" + "5"` (decimales de Prisma llegan como texto), igual que el "023 uds" ya conocido; además no se refresca tras vender por la caché de 3 min (UX-05).
4. **Mensajes técnicos y lenguaje contable.** "Failed to fetch", "Error 500", FIFO, patrimonio neto, flujo, arqueo, inyectar capital; y cinco nombres distintos para dos cajas físicas (UX-22, UX-23, UX-25).
5. **Faltan atajos de tienda real:** billetes rápidos en "Paga con", Enter en el buscador para agregar, modo apagón que se apaga solo tras cada venta, buscador en Inventario, cambio de precio en 4 toques con campos de 32 px.

Fortalezas a conservar: guard por rol y nav por permisos, "Sacar dinero" con tres intenciones claras, estados vacíos con ícono y mensaje, `inputMode="decimal"` en los campos de dinero, confirmación con motivo en anulación, cierre que propone el fondo del siguiente turno, devolución ligada a la venta.

### Tabla resumen

| ID | Flujo | Título | Sev. | Confianza |
|---|---|---|---|---|
| UX-01 | Login | Cookie `secure:true` puede impedir entrar desde el celular por IP/HTTP | 🔴 | Probable |
| UX-02 | Login | Aterrizaje y textos de marca/entrada | ⚪ | Confirmado |
| UX-03 | Vender | En celular no hay confirmación de venta ni cambio tras cobrar | 🔴 | Confirmado |
| UX-04 | Vender | Imposible vender 1.5 lb / media libra desde el ticket | 🔴 | Confirmado |
| UX-05 | Vender | Stock mal calculado/mostrado y sin refrescar tras la venta | 🟡 | Probable |
| UX-06 | Vender | Escáner y búsqueda: sin feedback, sin Enter, sin acentos | 🟡 | Confirmado |
| UX-07 | Cobrar | "Paga con": sin billetes rápidos, sin "falta", cambio efímero | 🟡 | Confirmado |
| UX-08 | Cobrar | Modo apagón se apaga solo tras cada venta | 🟡 | Confirmado |
| UX-09 | Caja | El botón "Caja abierta" en realidad cierra; header parpadea | 🟡 | Confirmado |
| UX-10 | Caja | Cierre: descuadre sin cifra en vivo, "(opcional)" que no lo es, fallo a medio cierre | 🟡 | Confirmado / Probable |
| UX-11 | Caja | "Sacar dinero": categorías mudas, confirmación sin monto | 🟡 | Confirmado |
| UX-12 | Movimientos | No muestra salidas de dinero; nombre de pantalla inconsistente | 🟡 | Confirmado |
| UX-13 | Movimientos | Cierre forzado se ve "en curso"; un error borra el listado; descuadre sin palabras | 🟡 | Confirmado |
| UX-14 | Devolver/Anular | Encontrar la venta cuesta; devolución sin atajo ni confirmación de éxito | 🟡 | Confirmado |
| UX-15 | Inventario | Presentaciones: valores corregidos en silencio (factor, precio, descripción) | 🔴 | Confirmado |
| UX-16 | Inventario | Catálogo sin buscador; cambiar un precio toma 4 toques | 🟡 | Confirmado |
| UX-17 | Inventario | Crear producto: no atómico, escáner escribe en "Nombre", sin defaults | 🟡 | Confirmado / Probable |
| UX-18 | Inventario | Registrar compra: origen por defecto engañoso, éxito invisible | 🟡 | Confirmado |
| UX-19 | Inventario | Compra "Al crédito" no tiene forma de saldarse | 🟡 | Probable |
| UX-20 | Inventario | Merma/conteo por lote; no se puede sumar si el lote está agotado | 🟡 | Confirmado |
| UX-21 | Gastos | Bloqueo por fondos, feedback lejos del botón, historial mal rotulado | 🟡 | Confirmado |
| UX-22 | Estadísticas | Lenguaje contable; no responde "¿estoy ganando?" en una frase | 🔴 | Confirmado |
| UX-23 | Transversal | Cinco nombres para dos cajas | 🟡 | Confirmado |
| UX-24 | Estadísticas | Arqueo e inyección escondidos en íconos de 28 px | 🟡 | Confirmado |
| UX-25 | Transversal | Mensajes de error técnicos; sesión expirada pierde el ticket | 🟡 | Confirmado |
| UX-26 | Transversal | Accesibilidad: labels sin asociar, íconos sin nombre, select no operable por teclado | 🟡 | Confirmado |
| UX-27 | Transversal | Objetivos táctiles < 44 px y contraste del tema claro | 🟡 | Confirmado / Probable |
| UX-28 | Transversal | En celular no hay cerrar sesión ni usuario visible | 🟡 | Confirmado |
| UX-29 | Transversal | Acciones destructivas sin confirmar; 4 patrones de feedback de éxito | 🟡 | Confirmado |
| UX-30 | Transversal | Pulido: doble envío, pantalla en blanco, tono, datos viejos al cambiar período | ⚪ | Confirmado / Probable |

**Conteo:** 🔴 5 · 🟡 23 · ⚪ 2 (30 hallazgos).

---

## 2. Flujo 1 — Entrar (login) y aterrizar

**Recorrido actual:** `/` redirige siempre a login (`app/page.tsx:4`) → usuario + contraseña (2 campos, 1 toque en "Iniciar sesión") → cookie `token` + `user` → siempre `/dashboard/pos` (`login/page.tsx:56`). Total: 3 toques/teclazos más teclear. Se atora si la cookie no se guarda o si el servidor no responde (error en inglés).

### UX-01 — Cookie `secure:true` puede impedir entrar desde el celular 🔴
- **Evidencia:** `erp-tienda-frontend/app/auth/login/page.tsx:50` (`secure: true`), `:53-54`.
- **Qué vive la usuaria:** si la cajera abre el sistema en el celular por la IP de la laptop (`http://192.168.x.x:3000`), el navegador descarta una cookie `Secure` en HTTP que no es localhost. El login "funciona" (sin error), redirige a `/dashboard/pos`, el `proxy.ts` no ve token y la devuelve al login. Bucle sin mensaje.
- **Recomendación:** poner `secure: window.location.protocol === "https:"` (mantiene la seguridad en producción HTTPS). Si no hay token tras guardarlo, mostrar "No se pudo guardar la sesión; abre el sistema por la dirección segura".
- **Confianza:** Probable — conviene verificar en vivo con el celular por IP.

### UX-02 — Aterrizaje y textos de entrada ⚪
- **Evidencia:** `login/page.tsx:56` (siempre POS; `getHomeRoute` en `lib/navigation.ts:58-60` no se usa), `:99` (placeholder "admin"), `:133` ("Sistema de control transaccional · v1.0"), `app/page.tsx:4` (quien ya tiene sesión pasa por login igual).
- **Qué vive la usuaria:** la dueña entra y cae en "Abrir caja" aunque quiere ver cómo va el negocio; el placeholder "admin" invita a probar ese usuario; el pie suena a sistema bancario.
- **Recomendación:** tras login, ADMIN a Vender igual (decisión de producto) pero recordar la última pantalla; placeholder "Tu nombre de usuario"; pie "Tienda Karlita". Si ya hay token válido, `/` debe ir directo al dashboard.
- **Confianza:** Confirmado en código.

---

## 3. Flujo 2 — Abrir caja, vender, cobrar, apagón

**Recorrido actual (celular):** Abrir caja (1 toque + monto prellenado con lo dejado ayer + "Abrir caja" = 2-3 toques) → buscar/escanear → tocar fila (cada toque suma 1) → tocar la barra "N artículos / total" (abre sheet) → escribir "Paga con" → "Procesar pago" → el sheet se cierra. Mínimo 3 toques fijos por venta + 1 por artículo + teclear el pago. En escritorio el ticket está siempre visible (1 toque menos).

### UX-03 — En celular no hay confirmación de venta ni cambio después de cobrar 🔴
- **Evidencia:** `app/dashboard/pos/page.tsx:264-269` (`clearCart()`, `setCartOpen(false)`, `setCheckoutSuccess(true)`; no hay `toast.success`), `components/pos/CheckoutSection.tsx:63-67` (el banner "¡Venta registrada!" se pinta dentro de `CheckoutSection`, que en móvil solo existe dentro del sheet recién cerrado; el `<aside>` es `hidden lg:flex`, `pos/page.tsx:502`). El cambio (`CheckoutSection.tsx:104-109`) desaparece porque `setPagoCliente("")` corre antes de que la cajera lo lea.
- **Qué vive la usuaria:** toca "Procesar pago" y el sheet se esconde; la barra pasa a "Ticket vacío". No sabe si la venta quedó registrada. Si el cliente pidió el cambio al pagar, debe haberlo calculado antes.
- **Recomendación:** al éxito, `toast.success("Venta registrada · Cambio $X.XX")` (con el cambio calculado antes de limpiar) y mantener el cambio grande en pantalla ~4 s. Es 5 líneas.
- **Confianza:** Confirmado en código.

### UX-04 — Imposible vender 1.5 lb o media libra desde el ticket 🔴
- **Evidencia:** `components/pos/CartLines.tsx:55,67` (solo `±1`; la cantidad es texto no editable `:59-61`), `src/store/cartStore.ts:36-43` (al llegar a 0 se borra la línea). Backend sí lo soporta: `erp-tienda-backend/src/ventas/dto/create-venta.dto.ts:17-20` (decimal, mín. 0.001), `prisma/schema.prisma:126` (`Decimal(12,3)`).
- **Qué vive la usuaria:** el cliente pide "libra y media de queso". Debe agregar la fila de libra una vez y no hay cómo poner media; el único camino es crear presentaciones "Media libra" (ver UX-15, que además no lo permite). Para granel, la herramienta no sirve.
- **Recomendación:** hacer la cantidad un campo tocable (`inputMode="decimal"`) con atajos `½`, `1`, `1½`; mantener `+/−` para unidades. Quitar la línea solo con el bote de basura (hoy restar desde 1 la borra sin avisar). Mostrar la cantidad con hasta 3 decimales sin ceros sobrantes.
- **Confianza:** Confirmado en código.

### UX-05 — Stock mal calculado/mostrado y sin refrescar tras la venta 🟡
- **Evidencia:** `pos/page.tsx:285` y `inventario/page.tsx:125-127` (`reduce((s,l)=> s + l.cantidad_disponible, 0)`); los decimales de Prisma viajan como texto (`schema.prisma:145`, `productos.service.ts:39` los devuelve crudos; `AjusteInventarioDialog.tsx:63` ya usa `Number(...)`, señal de que el equipo lo sabe). Se muestra en `pos/page.tsx:482` y `inventario/page.tsx:287-289`. Stock **por producto**, repetido idéntico en cada presentación (`pos/page.tsx:285-295`). Tras vender, `loadData()` (`:271`) llama `fetchInventory()` sin `force`, y el store sirve caché por 3 min (`src/store/inventoryStore.ts:56-63`).
- **Qué vive la usuaria:** el mismo mecanismo del "023 uds" ya conocido puede mostrar "0105" en lugar de 105 en Vender e Inventario; el stock no baja justo después de vender; en "Fardo de 12" aparece el stock en unidades sueltas sin decir que lo son; "uds" para libras.
- **Recomendación:** sumar con `Number(...)`; llamar `fetchInventory(true)` tras cada venta; mostrar stock de la presentación (`floor(stock / factor)`) o al menos la unidad.
- **Confianza:** Probable — conviene verificar en vivo (la mecánica es idéntica a la del hallazgo conocido).

### UX-06 — Escáner y búsqueda: sin feedback, sin Enter, sin acentos 🟡
- **Evidencia:** `hooks/useBarcodeScanner.ts:35-37` (ignora el escaneo si hay cualquier input enfocado), `:42` (umbral 30 ms); `pos/page.tsx:323-332` (agrega sin ningún aviso de éxito; el único aviso es el de "no encontrado", `:328`, sin acción), `:397-402` (campo de búsqueda sin `onKeyDown`), `:301-308` (`toLowerCase().includes`, sin quitar acentos), `:310` (agrega aunque la caja esté cerrada; recién falla al cobrar). `CompraForm.tsx:151-168`: un escaneo siempre agrega una línea nueva, aunque el producto ya esté.
- **Qué vive la usuaria:** escanea y no sabe si "pegó" (sin sonido, sin parpadeo); si tocó antes la caja de búsqueda, el código queda escrito ahí y Enter no hace nada; teclear "azucar" no encuentra "Azúcar"; escanea con caja cerrada y descubre el problema hasta cobrar.
- **Recomendación:** (a) toast corto "✓ Arroz libra · $0.75" en cada escaneo; (b) Enter en el buscador: si hay una coincidencia exacta de código o un solo resultado, agrégalo y limpia el campo; (c) normalizar con `normalize("NFD")`; (d) con caja cerrada, abrir el diálogo de abrir caja en lugar de agregar; (e) en "no encontrado", botón "Buscar por nombre".
- **Confianza:** Confirmado en código.

### UX-07 — "Paga con": sin billetes rápidos, sin "falta", cambio efímero 🟡
- **Evidencia:** `CheckoutSection.tsx:84-102` (campo numérico), `:45-46` (si `pago < total` no muestra nada), `:155-173` (sin atajo de teclado para cobrar).
- **Qué vive la usuaria:** con el cliente esperando, teclea el billete en un campo; si teclea mal (5 en vez de 50), no hay aviso de "falta $x"; el cambio es lo único que importa y desaparece al cobrar (ver UX-03).
- **Recomendación:** botones "Exacto · $5 · $10 · $20 · $50" arriba del campo; mostrar "Falta $x.xx" en ámbar si el pago es menor; Enter dentro del campo ejecuta "Procesar pago"; el pago es opcional (hoy ya lo es, dejarlo así: "apoyar, no imponer").
- **Confianza:** Confirmado en código.

### UX-08 — Modo apagón se apaga solo tras cada venta 🟡
- **Evidencia:** `pos/page.tsx:266-267` (`setContingencia(false); setFechaContingencia("")` tras cada venta), `CheckoutSection.tsx:112-153` (interruptor + `datetime-local`), no hay indicador en el encabezado.
- **Qué vive la usuaria:** en un apagón de media hora vende 8 cosas: por cada una tiene que reactivar el interruptor y volver a elegir fecha/hora con un control de calendario poco amigable en celular. Lo más probable es que desista y registre todo con la hora de ahora.
- **Recomendación:** mantener el modo encendido hasta que la cajera lo apague; recordar la última hora y ofrecer "mismo momento" / "+5 min"; chip visible "Modo apagón" en el encabezado mientras esté activo para que no se quede prendido sin querer.
- **Confianza:** Confirmado en código.

### UX-09 — El botón "Caja abierta" en realidad cierra la caja; el encabezado parpadea 🟡
- **Evidencia:** `pos/page.tsx:373-381` (etiqueta "Caja abierta" abre el diálogo de **cerrar** turno; en móvil solo "Caja"), `:365-372` (el botón "Sacar dinero" en móvil es solo un ícono, sin `aria-label`), `:126` y `:273` (`loadCaja()` pone `cajaLoading=true` tras **cada venta**, y `:359-362` sustituye los botones por un spinner).
- **Qué vive la usuaria:** lee "Caja abierta" como un estado y la toca para mirar; le sale "Cerrar turno de caja". Tras cada venta los botones desaparecen un instante y reaparecen (salto de layout, riesgo de tocar mal).
- **Recomendación:** rotular "Cerrar caja" con un punto verde de estado aparte; "Sacar dinero" con ícono y texto corto también en móvil; refrescar la caja sin cambiar `cajaLoading` (solo en la primera carga).
- **Confianza:** Confirmado en código.

### UX-10 — Cierre de caja: descuadre sin cifra en vivo, "(opcional)" que no lo es, fallo a medio cierre 🟡
- **Evidencia:** `pos/page.tsx:197-200` (la exigencia de justificación aparece como toast al enviar), `:714` (etiqueta "Observaciones (opcional)"), `:670-673` (muestra el esperado, no la diferencia), `:209-227` (cierra y luego reabre en dos llamadas), `:219` (si el fondo siguiente es 0 no reabre aunque el checkbox esté marcado), `:233-235` (error solo con toast, el diálogo sigue abierto).
- **Qué vive la usuaria:** cuenta $48.50 contra $50.00 esperados, aprieta "Confirmar cierre" y recibe un toast: "El descuadre de $1.50 requiere una justificación (Observaciones)", cuando el campo dice "opcional". No ve en ningún momento "faltan $1.50" mientras teclea. Si el cierre se guarda pero la reapertura falla, ve "Error al abrir caja", el diálogo sigue abierto y reintentar intentará cerrar un turno ya cerrado.
- **Recomendación:** mostrar en vivo "Diferencia: −$1.50 (faltante)" bajo el conteo; cuando `|dif| ≥ 1`, el campo pasa a "Motivo (obligatorio)" con borde ámbar y foco automático (se conserva la regla, se quita la sorpresa); si falla la reapertura, cerrar el diálogo, avisar "Caja cerrada. No se pudo abrir la nueva; ábrela con el botón Abrir caja" y refrescar el estado; si el fondo siguiente es 0, ocultar el checkbox.
- **Confianza:** Confirmado en código (la falla parcial: Probable).

### UX-11 — "Sacar dinero": categorías mudas, confirmación sin monto 🟡
- **Evidencia:** `components/pos/SacarDineroDialog.tsx:84-90` (si falla la carga de categorías: `.catch(() => {})`, el select queda vacío), `:136` (toast "Movimiento registrado" sin monto ni tipo), `:195-211` (la cajera solo puede elegir categorías ya creadas; crear una es solo ADMIN en Gastos), `:155` ("querés", voseo; el resto de la app tutea).
- **Qué vive la usuaria:** 4 toques mínimos (botón → opción → monto → Confirmar). Si el gasto no encaja en ninguna categoría (p. ej. "agua para los clientes") se queda sin poder registrarlo; "Movimiento registrado" no le dice si fue bóveda o gasto ni cuánto.
- **Recomendación:** error visible si no cargan las categorías, con "Reintentar"; incluir siempre "Otros" como categoría por defecto (o permitir gasto sin categoría); toast "Guardaste $20.00 en la bóveda" / "Gasto de $3.50 registrado"; unificar el tono (tuteo o voseo).
- **Confianza:** Confirmado en código.

---

## 4. Flujo 3/4 — Movimientos, devolver, anular, cierre forzado

**Recorrido actual (devolver):** Movimientos → (turno abierto viene expandido; un turno viejo: 1 toque) → tocar la venta (1 toque) → "Devolver" (1) → escribir cantidad por línea (1 por línea) → "Confirmar devolución" (1). Mínimo 5 toques; la venta hay que identificarla por número y total.

### UX-12 — La pantalla no muestra las salidas de dinero y su nombre no coincide 🟡
- **Evidencia:** `movimientos/page.tsx:114-116` (solo `/cajas-turnos` y `/ventas`), `:248` (H1 "Ventas y turnos") vs `lib/navigation.ts:38` ("Movimientos"), `:149-157` (la búsqueda solo recorre turnos: id, fecha, estado).
- **Qué vive la usuaria:** la dueña pregunta "¿a dónde se fue la plata del turno?" y aquí no aparecen los gastos, traslados a bóveda, retiros personales ni compras pagadas de la gaveta; el menú dice "Movimientos" y la página dice otra cosa.
- **Recomendación:** dentro de cada turno, una sección "Dinero que salió de la gaveta" con los movimientos del turno (ya existe `/movimientos-financieros`); renombrar el menú a "Ventas y caja" o la página a "Movimientos".
- **Confianza:** Confirmado en código.

### UX-13 — Cierre forzado se ve "en curso"; un error borra el listado; descuadre sin palabras 🟡
- **Evidencia:** `movimientos/page.tsx:355,377` y `:168` solo conocen `ABIERTA`/`CERRADA`; el backend usa `CERRADA_FORZADA` (`cajas_turnos.service.ts:195`), así que un turno forzado cae en la rama "Turno en curso" (`:392-396`), muestra el enum crudo en la píldora y se excluye del descuadre total. `:318-322` (`error` reemplaza **todo** el listado), `:192-195`, `:205`, `:224-226` (fallos de anular/forzar escriben ese mismo error; no hay "Reintentar"). `:311-312` ("Desc.: +2.50" sin `$`), `:385-389` (valor absoluto + ícono; sobrante/faltante solo por color).
- **Qué vive la usuaria:** la administradora cierra a la fuerza un turno olvidado y lo ve como "Turno en curso"; si anular una venta falla (p. ej. ya hubo devolución), desaparece todo el historial y solo queda el mensaje rojo; "Desc.: +2.50" no dice si sobra o falta.
- **Recomendación:** tratar `estado.startsWith("CERRADA")` y mostrar "Cerrado a la fuerza"; los errores de acción van dentro del diálogo (o toast), no en el estado de página; mostrar "Faltó $1.50" / "Sobró $1.50" / "Cuadró".
- **Confianza:** Confirmado en código.

### UX-14 — Encontrar la venta cuesta; la devolución no tiene atajo ni confirmación de éxito 🟡
- **Evidencia:** `movimientos/page.tsx:457-465` (la fila solo muestra `#00012` y el total; la hora y las unidades están `hidden ... sm:flex`), `:149-157` (no se busca por venta/producto/monto), `components/movimientos/DevolucionDialog.tsx:65` (todas las cantidades vacías al abrir), `:110-111` (éxito sin toast), `:166-167` ("Reingresar"/"Merma" sin explicar), `:126-129` (el reembolso sale de la caja abierta: si no hay una, el error llega del backend); anular: `movimientos/page.tsx:188-191` (sin toast).
- **Qué vive la usuaria:** el cliente regresa con una bolsa: la cajera tiene que expandir turnos y ventas viendo solo números; en celular ni la hora ve. En el diálogo debe teclear la cantidad línea por línea; al confirmar el diálogo se cierra sin decir "Devolviste $3.00".
- **Recomendación:** en celular mostrar hora y primer producto ("14:32 · Arroz libra +2"); "Devolver todo" que prellena; "Reingresar → vuelve al estante / Merma → se echó a perder"; toast "Devolución de $3.00 registrada; saca ese dinero de la gaveta"; si no hay caja abierta, avisar al abrir el diálogo.
- **Confianza:** Confirmado en código.

---

## 5. Flujo 5 — Inventario

**Recorrido actual (cambiar un precio):** Inventario → hacer scroll por la lista (sin buscador) → tocar el producto → "Editar" → ubicar el campo "Precio" (campo de 32 px) → "Guardar cambios" = 4 toques + buscar visualmente. **Crear producto:** "Producto" → nombre → categoría → descripción/factor/precio de presentación → "Crear producto". **Registrar compra:** "Nueva compra" → proveedor → 3 selectores → "Agregar lote" → producto → cantidad → costo → "Registrar compra".

### UX-15 — Presentaciones: valores corregidos en silencio 🔴
- **Evidencia:** `components/inventario/ProductDialog.tsx:148` (presentación con descripción vacía se omite sin avisar), `:155` y `:348` (`parseInt(factor) || 1`; `min={1}` en `:269`), `:156` y `:349` (`parseFloat(precio) || 0`); `EditProductDialog.tsx:221-226` (misma regla; etiqueta "Múltiplo" vs "Factor conversión" en `ProductDialog.tsx:268`). Backend sí acepta decimales: `create-presentacion.dto.ts:34-40` (`min 0.001`), `schema.prisma:201`.
- **Qué vive la usuaria:** quiere crear "Media libra" con factor 0.5: escribe 0.5, guarda y el sistema guarda 1 sin avisar (descuenta una libra entera por cada media vendida). Si deja el precio vacío, crea una presentación a **$0.00** y se puede vender gratis. Si deja la descripción vacía, el producto "se crea" pero no aparece en Vender.
- **Recomendación:** permitir decimales en el factor (`step="0.001"`, `min=0.001`) y enviar el valor tal cual; validar con mensaje ("El precio es obligatorio", "Falta la descripción") en lugar de corregir; explicar el factor con una línea: "¿Cuántas unidades base descuenta cada venta? Media libra = 0.5". Prellenar la descripción con "Unidad".
- **Confianza:** Confirmado en código.

### UX-16 — Catálogo sin buscador; cambiar un precio toma 4 toques 🟡
- **Evidencia:** `inventario/page.tsx:236-258` (sin buscador, filtro de categoría, orden ni "por agotarse"), `:274-275` (columna ID "0012" sin significado para la dueña), el precio solo se ve al expandir (`:321-330`), `:306-309` ("Editar" dentro del detalle), `EditProductDialog.tsx:202-208` (campos `h-8`), `:233-243` (ícono de historial de 20 px), `:121-122` (guardar cierra sin aviso).
- **Qué vive la usuaria:** con 200 productos hay que desplazarse; "¿cuánto cuesta el arroz?" exige abrir cada producto; el precio nuevo se teclea en un campo de 32 px.
- **Recomendación:** buscador + chips de categoría (reutilizar el patrón del POS) y filtro "Agotados"; mostrar el precio principal en la fila colapsada; botón "Precio" en la fila que abre un diálogo mínimo con solo el precio (el historial queda como enlace).
- **Confianza:** Confirmado en código.

### UX-17 — Crear producto: no atómico, el escáner escribe en "Nombre", sin defaults 🟡
- **Evidencia:** `ProductDialog.tsx:142-159` (crea el producto y luego cada presentación en llamadas separadas: si una falla, el producto ya existe y reintentar lo duplica), `:79-95` + `useBarcodeScanner.ts:35-37` (el escáner solo asigna el código si ningún input tiene foco; Radix enfoca "Nombre" al abrir), `:53-59` (descripción vacía por defecto), `:161-162` (éxito sin aviso).
- **Qué vive la usuaria:** escanea el código del producto nuevo y el número queda escrito en el nombre; si falla algo a medias, ve un error y al reintentar crea un duplicado.
- **Recomendación:** prellenar "Unidad", enfocar el campo de código de barras de la primera presentación o permitir escanear dentro de él (Enter ya está prevenido, `:264`); si falla una presentación, avisar "Producto creado; falta agregar la presentación X" sin permitir duplicar; toast de éxito.
- **Confianza:** Confirmado en código (foco en Nombre: Probable).

### UX-18 — Registrar compra: origen por defecto engañoso, éxito invisible 🟡
- **Evidencia:** `CompraForm.tsx:126` (por defecto "Capital dueños"), `:281-283` ("Capital dueños", "Caja general", "Caja POS (requiere turno abierto)"), `:213-218` + `inventario/page.tsx:553-556` (el mensaje de éxito se pinta y el diálogo se cierra en la misma acción: nunca se ve), `:336-337` (costo por unidad base, sin total ni costo por fardo), `:65-99` (selector de producto con `div`s clicables).
- **Qué vive la usuaria:** la compra normal (pagada con efectivo de la tienda) exige cambiar un selector cuyo valor por defecto es "aporte de los dueños", que contablemente es otra cosa; los nombres de los orígenes no coinciden con lo que ve en Vender ("bóveda"). Compró 5 fardos de $9: debe dividir a mano para el costo unitario. Al guardar, el diálogo se cierra sin confirmación.
- **Recomendación:** orígenes en lenguaje de tienda: "Efectivo de la gaveta", "Bóveda", "De mi bolsillo (aporte)"; default según contexto (turno abierto → gaveta); permitir "Costo del lote" o "Costo por presentación" con cálculo automático; toast "Compra de $45.00 registrada".
- **Confianza:** Confirmado en código.

### UX-19 — Compra "Al crédito" no tiene forma de saldarse 🟡
- **Evidencia:** `erp-tienda-backend/src/compras/compras.controller.ts:21,33,39` (solo `POST`/`GET`/`GET :id`), `inventario/page.tsx:485-487` (píldora "Crédito" permanente), `stats/page.tsx:460` (Deudas en patrimonio).
- **Qué vive la usuaria:** registra la compra al crédito, paga al proveedor en efectivo una semana después y no hay dónde decirlo: la deuda queda "Crédito" y el patrimonio la resta para siempre.
- **Recomendación:** botón "Registrar pago" en la compra a crédito (monto, origen de fondos) que cambie la píldora a "Pagado". Hallazgo de producto, no solo de interfaz; se puede dejar en el roadmap.
- **Confianza:** Probable — conviene verificar que realmente no exista otro endpoint (solo se revisó el controlador de compras).

### UX-20 — Merma/conteo por lote; no se puede sumar si el lote está agotado 🟡
- **Evidencia:** `inventario/page.tsx:339-366` y `:508-519` (solo lotes con `cantidad_disponible > 0`; el botón "Merma" cuelga de cada lote), `AjusteInventarioDialog.tsx:128-133` ("Quitar (merma)" / "Agregar (conteo)"), `:141-143` ("Lote ID: #12").
- **Qué vive la usuaria:** contó 8 de algo que el sistema dice que tiene 10; debe elegir un lote por su número y calcular que son 2 de menos. Si el sistema dice 0 pero hay 3 en el estante, no existe botón (los lotes en cero no se listan): el camino es registrar una compra falsa.
- **Recomendación:** botón "Contar" a nivel de producto: "¿Cuántas hay en el estante?" (cantidad real) → el sistema calcula la diferencia y la aplica al lote más reciente (o crea el lote); mover "lote" a un detalle avanzado.
- **Confianza:** Confirmado en código.

---

## 6. Flujo 6 — Gastos y Estadísticas (ADMIN)

### UX-21 — Gastos: bloqueo por fondos, feedback lejos del botón, historial mal rotulado 🟡
- **Evidencia:** `gastos/page.tsx:126-138` (el cliente rechaza si el monto supera el esperado; el backend también: `movimientos_financieros.service.ts:151`), `:262-271` (éxito y error aparecen arriba del formulario, lejos del botón en celular), `:344` ("Últimos gastos (POS)") vs `:88` (trae todos los `EGRESO_OPERATIVO`, incluidos los pagados de bóveda), `:84-101` (`Promise.allSettled` nunca llega al `catch`: un fallo de red se muestra como "No hay turno abierto"), `:371` y `:364` (formato de moneda y fecha distintos al resto: `en-US` / `es-ES` vs `formatMoney` / `es-SV`).
- **Qué vive la usuaria:** paga $15 de agua desde la gaveta; el sistema cree que hay $10 (porque faltó registrar una venta) y se lo prohíbe: la dueña deja de registrar. En celular toca "Registrar egreso" abajo y el mensaje de éxito sale arriba, fuera de pantalla.
- **Recomendación:** "registrar y avisar": permitir el gasto y mostrar "Ojo: según el sistema la gaveta quedaría en −$5.00; revisa si falta registrar una venta" (requiere un ajuste de backend; si no se puede, al menos mostrar el mensaje entendible); toast en lugar de banner; rotular "Últimos gastos" y distinguir el origen; mostrar error real si la carga falla.
- **Confianza:** Confirmado en código.

### UX-22 — Lenguaje contable; no responde "¿estoy ganando?" en una frase 🔴
- **Evidencia:** `stats/page.tsx:279` ("costeo FIFO en tiempo real"), `:322-335` (KPIs: Utilidad neta, Ingreso bruto, Costo FIFO, Margen bruto), `:448` (Patrimonio neto), `:459` (Activos fijos), `:477` (Flujo de efectivo), `:405` (Arqueo), `:366` (Inyectar capital), `:536` (Faltantes de caja), `:571` ("rentabilidad FIFO"), `:508-512` (colores de las barras por margen, sin leyenda).
- **Qué vive la usuaria:** la dueña abre Estadísticas con una pregunta ("¿estoy ganando?") y recibe seis tarjetas con vocabulario de contador. "Utilidad neta" puede ser positiva mientras el efectivo baja (compró inventario) y la pantalla no lo explica; "Costo FIFO" no significa nada para ella; los colores del gráfico se interpretan sin leyenda.
- **Recomendación:** una tarjeta de cabecera en frase: "Este mes ganaste $1,240 (de $5,300 vendidos)"; renombrar: Utilidad neta → "Ganancia", Costo FIFO → "Lo que costó lo vendido", Margen → "Ganancia por cada $100", Patrimonio → "Lo que vale el negocio", Flujo → "Entradas y salidas de dinero", Arqueo → "Contar la bóveda", Inyectar capital → "Poner dinero en la bóveda"; un `title`/línea de ayuda de una oración por tarjeta; leyenda del gráfico ("verde: deja buena ganancia"). Mantener el nombre contable entre paréntesis si hace falta.
- **Confianza:** Confirmado en código.

### UX-24 — Arqueo e inyección escondidos en íconos de 28 px 🟡
- **Evidencia:** `stats/page.tsx:344-357` (dos botones de 28 px sobre la tarjeta "Caja general", solo con `title`, que no existe en pantallas táctiles), `:229`, `:257`, `:394`, `:437` (feedback con emojis y chequeo `startsWith("✅")`), `:244-270` (el arqueo reescribe el saldo sin confirmar), `:420` ("Justificación (si hay descuadre)", no se exige ni se avisa).
- **Qué vive la usuaria:** para poner dinero en la bóveda o contarla tiene que adivinar que los dos íconos de la esquina de una tarjeta son botones; el arqueo ajusta el saldo del sistema sin un "¿Seguro? La bóveda pasará de $120.00 a $100.00".
- **Recomendación:** una sección "Bóveda" visible (saldo + botones con texto "Poner dinero" / "Contar bóveda"), ideal también desde Gastos donde ya se muestra el saldo; mostrar la diferencia antes de confirmar el arqueo; usar toast en lugar de emojis en texto.
- **Confianza:** Confirmado en código.

---

## 7. Transversal

### UX-23 — Cinco nombres para dos cajas 🟡
- **Evidencia:** Vender: "gaveta" y "bóveda" (`SacarDineroDialog.tsx:36-38`; `pos/page.tsx:664,686`); Gastos: "Caja registradora (POS)" y "Caja general (bóveda)" (`gastos/page.tsx:226,241,290-291`); Estadísticas: "Caja general" (`stats/page.tsx:339`) y "Gaveta (mostrador)" / "Bóveda" (`:480-481`); Compra: "Caja general" / "Caja POS" / "Capital dueños" (`CompraForm.tsx:281-283`).
- **Qué vive la usuaria:** "¿la caja general es la bóveda?", "¿la caja POS es la gaveta?": cada pantalla usa un nombre distinto; en la misma compra aparecen "Caja POS" y, en Vender, "gaveta".
- **Recomendación:** fijar un glosario de tienda en `lib/` (p. ej. `Gaveta` y `Bóveda`) y usarlo en todas las pantallas; "POS" y "caja general" salen del texto visible.
- **Confianza:** Confirmado en código.

### UX-25 — Mensajes de error técnicos; sesión expirada pierde el ticket 🟡
- **Evidencia:** `lib/api.ts:35-38` (muestra `message` del backend o `Error ${res.status}`), no captura fallos de red (el navegador lanza "Failed to fetch"), `login/page.tsx:67-71` (el mismo texto crudo llega al login), `lib/api.ts:26-33` + `src/store/cartStore.ts:20` (el 401 hace `window.location.href`, recarga completa, y el carrito vive solo en memoria), `pos/page.tsx:276`.
- **Qué vive la usuaria:** con el internet caído lee "Failed to fetch"; con un error del servidor, "Error 500"; si el token venció a las 12 h (`login/page.tsx:46-49`) justo al cobrar, la devuelven al login con "Sesión expirada" fugaz y el ticket armado se pierde.
- **Recomendación:** en `apiFetch`: fallo de red → "No hay conexión con el servidor. Revisa el internet y vuelve a intentar"; 5xx → "Algo falló de nuestro lado. Intenta de nuevo; si sigue, avisa a quien administra el sistema"; 400 → el mensaje del backend ya en lenguaje de tienda (revisar los textos del backend con IDs técnicos); guardar el carrito en `sessionStorage` (middleware `persist` de Zustand) para que sobreviva a un login.
- **Confianza:** Confirmado en código.

### UX-26 — Accesibilidad: labels sin asociar, íconos sin nombre, select no operable por teclado 🟡
- **Evidencia:** solo 2 de 53 `<Label>` en `app/` y `components/` (fuera de `ui/`) llevan `htmlFor` (p. ej. `pos/page.tsx:637,676,686`, `movimientos/page.tsx:560,595`, `ProductDialog.tsx:187`). Botones solo-ícono sin `aria-label`: `inventario/page.tsx:431-435` (borrar categoría), `ProductDialog.tsx:249-253` (quitar presentación), `EditProductDialog.tsx:233-243` (solo `title`), `movimientos/page.tsx:275`, `gastos/page.tsx:215`, `stats/page.tsx:297,344-357`, `pos/page.tsx:365-372`. `CompraForm.tsx:65-99` (selector de producto hecho con `div` + `onClick`: no recibe foco ni se opera con teclado). Chips y períodos sin `aria-pressed` (`pos/page.tsx:410`, `stats/page.tsx:285`). Estado de stock/descuadre solo por color en varias vistas.
- **Qué vive la usuaria:** un lector de pantalla no sabe qué campo es cuál; con lector de código y teclado (sin mouse) no puede elegir producto en Compras.
- **Recomendación:** envolver los inputs con su `Label` (o `htmlFor`/`id`), `aria-label` en cada botón de ícono, usar el `Select` de shadcn o un `combobox` con `role="listbox"`, `aria-pressed` en chips; añadir texto ("Faltó", "Agotado") junto al color.
- **Confianza:** Confirmado en código.

### UX-27 — Objetivos táctiles < 44 px y contraste del tema claro 🟡
- **Evidencia:** la especificación pide ≥ 44 px (`docs/rediseno/00-especificaciones.md` §4.5) pero `components/ui/input.tsx:12` es `h-8` por defecto, `ui/button.tsx:27` (`sm` = 28 px); `CartLines.tsx:43` (quitar línea 32 px), `pos/page.tsx:415` (chips ≈ 28 px), `ProductDialog.tsx:249` (24 px), `EditProductDialog.tsx:208,233` (32 y 20 px), `stats/page.tsx:289,297` (períodos y refrescar 28/36 px), `ProductDialog.tsx:258-277` (campos 36 px). Contraste: `app/globals.css:82-84` (`--warning` `oklch(0.72 …)` usado como **texto** en `pos/page.tsx:428`, `inventario/page.tsx:351`, pills) da contraste bajo sobre fondo claro.
- **Qué vive la usuaria:** en celular con dedos de trabajo, tocar la basura de una línea o un chip de categoría falla seguido; a plena luz del día (la spec lo menciona) el texto ámbar en tema claro casi no se lee.
- **Recomendación:** subir los controles de formularios y botones a `h-11` en móvil (cambiar el default en `ui/input` y `ui/button` en vez de repetir `h-11` por pantalla); oscurecer `--warning` para texto en `:root` o usar `text-warning-foreground` sobre fondo ámbar.
- **Confianza:** Confirmado en código (contraste: Probable, conviene medir).

### UX-28 — En celular no hay cerrar sesión ni usuario visible 🟡
- **Evidencia:** `app/dashboard/layout.tsx:19-28` (el encabezado móvil solo tiene marca + tema), `components/nav/sidebar.tsx:70-95` (usuario y "Cerrar sesión" viven solo en el sidebar, `hidden md:flex`, layout `:35`).
- **Qué vive la usuaria:** en el celular compartido no puede cambiar de cajera ni ver con qué usuario está; la única salida es borrar cookies o esperar las 12 h. Contradice la intención de `sidebar.tsx:35-39` (limpiar carrito e inventario al salir).
- **Recomendación:** menú de usuario (avatar/inicial) en el encabezado móvil con nombre, rol y "Cerrar sesión".
- **Confianza:** Confirmado en código.

### UX-29 — Acciones destructivas sin confirmar; cuatro patrones de feedback de éxito 🟡
- **Evidencia:** sin confirmación: borrar categoría (`inventario/page.tsx:153-161,431-435`), quitar línea y "Anular todo/Anular" del ticket (`CartLines.tsx:41`, `pos/page.tsx:508,570`; además "Anular" aquí significa vaciar el ticket, y en Movimientos "Anular venta" significa otra cosa), arqueo y depósito en bóveda (`stats/page.tsx:244-270`). Feedback de éxito: toast (`SacarDineroDialog.tsx:136`), banner con temporizador (`pos/page.tsx:274`, `gastos/page.tsx:167`, `inventario/page.tsx:144`), texto con emoji (`stats/page.tsx:229`), ninguno (devolución, anular, producto creado, compra, edición, cierre de caja).
- **Qué vive la usuaria:** un toque en el bote de basura de una categoría la borra; vaciar el ticket de 15 artículos con "Anular" es un toque; "Anular" tiene dos significados; después de muchas acciones no sabe si "pegaron".
- **Recomendación:** para "vaciar ticket" mostrar "Se quitaron 15 artículos · Deshacer" (toast con acción) en vez de un diálogo (más rápido, "apoyar"); confirmar solo lo irreversible (borrar categoría, arqueo); renombrar a "Vaciar ticket"; estandarizar `toast.success` con la cifra relevante en todas las acciones.
- **Confianza:** Confirmado en código.

### UX-30 — Pulido: doble envío, pantalla en blanco, tono, datos viejos al cambiar período ⚪
- **Evidencia:** (a) `pos/page.tsx:241-243` (la protección contra doble envío es solo estado de React: dos toques casi simultáneos pueden mandar dos ventas; no hay clave de idempotencia si hay timeout y se reintenta); (b) `return null` hasta montar en todas las páginas (`pos/page.tsx:334`, `inventario/page.tsx:169`, `movimientos/page.tsx:240`, `gastos/page.tsx:205`): pantalla en blanco antes del primer contenido; (c) voseo aislado (`SacarDineroDialog.tsx:155` "querés") frente a tuteo ("Ingresa", "Selecciona"); (d) `app/layout.tsx:40` (`Toaster` arriba a la derecha tapa el encabezado en móvil; mejor abajo-centro sobre la barra); (e) `pos/page.tsx:459` ("Verifica que los productos tengan presentaciones creadas" es mensaje técnico); (f) `stats/page.tsx:205-212` (al cambiar período el rótulo cambia de inmediato y las cifras se quedan con las del período anterior hasta que llega la respuesta); (g) `dashboard/layout.tsx:33` (`h-screen` = 100vh en navegadores móviles; usar `h-dvh`).
- **Qué vive la usuaria:** casi nada por separado, pero suma a la sensación de "se siente torpe"; el doble envío sería una venta duplicada.
- **Recomendación:** guardia con `useRef` y botón deshabilitado inmediato; esqueleto en vez de `null`; un solo registro de voz (tuteo); mover el Toaster a `bottom-center`; "Aún no hay productos para vender. Crea uno en Inventario"; mostrar el spinner o atenuar las cifras mientras recarga.
- **Confianza:** Confirmado en código (doble envío y 100vh: Probable).

---

## 8. Top 5 cambios de mayor impacto con menor esfuerzo

1. **Confirmar la venta en celular (UX-03).** `toast.success("Venta registrada · Cambio $X")` calculado antes de limpiar. Cinco líneas; elimina la mayor incertidumbre de la cajera.
2. **Arreglar y refrescar el stock (UX-05).** `Number(...)` en los dos `reduce` y `fetchInventory(true)` tras vender. Dos líneas por sitio; devuelve la confianza en el número más consultado.
3. **Cantidades fraccionadas de verdad (UX-04 + UX-15).** Cantidad tocable con atajos ½/1/1½ en el ticket, `step="0.001"` sin `parseInt` en presentaciones y validación en lugar de valores corregidos en silencio. El backend ya lo soporta: es solo interfaz.
4. **Mensajes humanos en `apiFetch` + cookie `secure` condicionada (UX-25 + UX-01).** Un solo archivo (`lib/api.ts`) cambia todos los errores de la app, y una línea en el login evita el bucle en celular por HTTP.
5. **Escáner y cobro con atajos (UX-06 + UX-07).** Toast por escaneo, Enter en el buscador agrega, billetes rápidos con "Falta/Cambio" y Enter para cobrar: recorta toques en cada venta, que es la acción más repetida. (Mención: la tarjeta de cabecera "Este mes ganaste $X" de UX-22 es el siguiente paso de mayor valor para la dueña.)
