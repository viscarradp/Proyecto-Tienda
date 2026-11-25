# Auditoría UX/UI — La cajera en el mostrador

> Fecha: 2026-11-25. Solo lectura sobre `erp-tienda-frontend/` (y consulta de `erp-tienda-backend/` para confirmar orden y reglas).
> Lente: una cajera con un cliente esperando, celular de 375 px o laptop, a veces con lector, a veces sin internet.
> Lo que solo se ve en pantalla va marcado **"Hipótesis: ver en vivo"**. Las rutas son relativas a `erp-tienda-frontend/`.
> Auditoría previa: `docs/auditorias/2026-11-24-auditoria-interfaz.md` (UX-01…UX-30). No se repite lo resuelto.

## 1. Resumen

1. La base está sólida: stock en lenguaje de tienda, búsqueda sin acentos, billetes rápidos, "Falta", cambio grande, vaciar con confirmación, apertura con origen de la diferencia, cierre con diferencia en vivo, menú de usuario en celular y clave de idempotencia al cobrar. Todo lo de UX-03/04/06/07/09/10/11/28 está resuelto.
2. Los dos riesgos de dinero que quedan son de **borde, pero reales**: (a) escanear con el cursor dentro de un campo de cantidad o de "Paga con" escribe el código ahí (CAJ-07); (b) si se pierde la respuesta del cobro y la cajera recarga, la clave de idempotencia se pierde y puede registrar la venta dos veces (CAJ-20).
3. En celular, **"Procesar pago" queda dos pasos y probablemente un scroll lejos** del pulgar: barra del ticket, hoja con 3 filas por producto, bloque de modo apagón, y recién abajo el botón. El error de cobro aparece arriba, fuera de vista (CAJ-18, CAJ-21).
4. En laptop sin mouse no se puede vender: no hay atajos, "Enter" en "Paga con" no cobra, y con varios resultados Enter no elige (CAJ-10, CAJ-11).
5. Cerrar caja no confirma nada y la reapertura automática deja el encabezado igual que antes (CAJ-04). Anular y devolver no dicen "listo", y un error al anular borra la pantalla entera (CAJ-27, CAJ-28; persisten UX-13 y UX-14).

**Conteo:** 🔴 2 · 🟡 24 · ⚪ 10 (36 hallazgos).

| ID | Pantalla | Título | Sev. | Esfuerzo |
|---|---|---|---|---|
| CAJ-01 | Login | En el celular el usuario se autocapitaliza y no hay "ver contraseña" | 🟡 | S |
| CAJ-02 | Login | Textos y accesibilidad menor del login (persiste UX-02) | ⚪ | S |
| CAJ-03 | Sesión | Sesión vencida: te saca sin decir por qué y pierde lo no guardado (persiste UX-25) | 🟡 | M |
| CAJ-04 | Cerrar caja | Cierre sin confirmación ni resumen; la reapertura automática lo hace invisible | 🟡 | S |
| CAJ-05 | Abrir caja | La respuesta tardía de "último cierre" pisa lo que la cajera ya escribió | ⚪ | S |
| CAJ-06 | Cerrar caja | Validaciones por toast y Enter cierra de una | ⚪ | S |
| CAJ-07 | Vender | Escanear con el cursor en Cantidad o "Paga con" escribe el código en ese campo | 🔴 | M |
| CAJ-08 | Vender | Escáner: umbral de 30 ms, sin largo mínimo, agrega con caja cerrada (persiste UX-06 d, e) | 🟡 | M |
| CAJ-09 | Vender | Buscar a mano: no se limpia al tocar, sin ✕, ícono de escáner que no es botón | 🟡 | S |
| CAJ-10 | Vender | Enter solo agrega con un único resultado; con varios manda al mouse | 🟡 | M |
| CAJ-11 | Vender | Sin atajos de teclado; Enter en "Paga con" no cobra (persiste UX-07) | 🟡 | M |
| CAJ-12 | Vender | "Agregar como producto nuevo" aparece aunque el producto exista en otra categoría | 🟡 | S |
| CAJ-13 | Vender | Celular: tocar un producto no se nota en la fila y el encabezado se come la pantalla | 🟡 | M |
| CAJ-14 | Ticket | Cada línea ocupa 3 filas; atajos ½ y 1½ en productos que no son de peso | 🟡 | M |
| CAJ-15 | Ticket | Quitar una línea (basura o "−" desde 1) no se puede deshacer | 🟡 | S |
| CAJ-16 | Ticket | Precio congelado en el ticket guardado: total y cambio distintos a lo cobrado | 🟡 | M |
| CAJ-17 | Cobrar | Avisos de stock apilados (15 s cada uno) pueden tapar el cambio | ⚪ | S |
| CAJ-18 | Cobrar | Celular: "Procesar pago" fuera de vista, sin el total y con otro nombre | 🟡 | M |
| CAJ-19 | Cobrar | "Paga con" queda escrito al vaciar el ticket y falsea el cambio del siguiente | 🟡 | S |
| CAJ-20 | Cobrar | Respuesta perdida + recarga = cobro duplicado (la clave de idempotencia vive solo en memoria) | 🔴 | S |
| CAJ-21 | Cobrar | El error de cobro sale arriba, fuera de vista y sin aviso emergente | 🟡 | S |
| CAJ-22 | Cobrar | Detalles: "Cobrada sin dato de pago" engañoso y falta el billete de $50 | ⚪ | S |
| CAJ-23 | Modo apagón | Recargar apaga el modo y la venta del cuaderno se guarda con la hora de ahora (persiste UX-08 a medias) | 🟡 | S |
| CAJ-24 | Modo apagón | Tres nombres distintos y botón deshabilitado sin decir por qué | 🟡 | S |
| CAJ-25 | Sacar dinero | Un monto mal digitado no lo puede corregir la cajera (ni nadie en pantalla si fue a la bóveda) | 🟡 | M |
| CAJ-26 | Sacar dinero | En celular el botón dice solo "Sacar" | ⚪ | S |
| CAJ-27 | Movimientos | Un error al anular borra la lista entera y no deja reintentar (persiste UX-13) | 🟡 | S |
| CAJ-28 | Movimientos | Anular y devolver terminan en silencio (persiste UX-14) | 🟡 | S |
| CAJ-29 | Movimientos | Celular: la fila de venta esconde hora y cantidad; no hay "anular la última" desde el POS | 🟡 | M |
| CAJ-30 | Devolución | Hay que teclear la cantidad de cada línea; el reembolso se calcula en pantalla | 🟡 | M |
| CAJ-31 | Movimientos | "Anular" desaparece en turnos cerrados sin explicar; textos con jerga | ⚪ | S |
| CAJ-32 | Merma | Pide "lote #", exige un motivo que repite lo ya elegido y no dice la unidad | 🟡 | S |
| CAJ-33 | Cerrar sesión | Un toque en el ícono de salir borra el ticket en curso, sin preguntar | 🟡 | S |
| CAJ-34 | Navegación | Sidebar mezcla "Cajero · POS" con "Cajera" | ⚪ | S |
| CAJ-35 | Transversal | Jerga que sobra: "turno de caja", "Procesar pago", "balance", "Reingresar" | ⚪ | S |
| CAJ-36 | Transversal | Detalles: asa de la hoja que no se arrastra, parpadeo sin usuario, ticket en dos pestañas | ⚪ | S |

---

## 2. Recorrido de flujos

Convenciones: "toque" = un toque o clic; el tecleo de montos va aparte. Los números parten de la pantalla Vender con la caja abierta, salvo que se diga otra cosa. Lo marcado ✅ es lo que funciona bien.

### Flujo 1 — Entrar y llegar a vender
- **Pasos:** abrir el sistema → (si hay sesión va directo a Vender, ✅ UX-02) → escribir usuario → escribir contraseña → "Iniciar sesión" → cae en Vender (`app/auth/login/page.tsx:74`).
- **Toques mínimos:** 3 (+ teclear 2 campos). Si la caja está cerrada: +2 ("Abrir caja" en el encabezado, "Abrir caja" en el diálogo) = **5 toques** hasta poder vender.
- **Dónde duda o se equivoca:** en el celular el teclado pone la primera letra del usuario en mayúscula y corrige palabras (CAJ-01); la contraseña no se puede ver. Si el navegador no guarda la cookie ya hay mensaje claro (✅ UX-01).
- **Si se equivoca:** el error sale arriba del formulario con el mensaje del servidor ("Credenciales inválidas"); el formulario conserva lo escrito. Sin bloqueo.
- **Feedback:** botón "Verificando acceso…" deshabilitado. ✅

### Flujo 2 — Abrir caja (fondo del día anterior y con diferencia)
- **Fondo del día anterior:** "Abrir caja" (1) → el diálogo ya trae el remanente escrito y la línea "Lo que quedó en la gaveta al cerrar el turno anterior" → "Abrir caja" (2). **2 toques, 0 teclas.** ✅
- **Con diferencia:** cambia el monto → aparece "¿De dónde salió / A dónde fue la diferencia de $X?" con tres botones; "No sé" ya viene marcado → "Abrir caja". **2 toques + el monto.** Nunca bloquea (✅ D-15). Si es el primer turno de la historia propone "Dinero que puse yo".
- **Dónde duda:** el campo viene lleno: es fácil aceptar sin contar. Si "último cierre" tarda en responder, puede pisar lo que ya tecleó (CAJ-05). Con la reapertura automática del cierre, esta pantalla casi nunca se ve (CAJ-04).
- **Si se equivoca:** no puede deshacer una apertura mal hecha desde su pantalla (la diferencia queda registrada con "No sé", sin culpa).
- **Feedback:** avisos del servidor como toast de 12 s; el encabezado pasa a "Caja abierta". ✅

### Flujo 3 — Venta típica de 3 productos con escáner
- **Pasos:** escanear ×3 (cada uno suena a "Agregado: …" en un aviso breve arriba, ✅ UX-06) → con la laptop el ticket está a la derecha: "Paga con" → billete rápido → "Procesar pago".
- **Toques mínimos en laptop:** 0 por producto + 1 billete + 1 cobrar = **2 toques** (+ 3 escaneos). En celular: 3 escaneos con lector Bluetooth o 3 toques en filas, + 1 abrir el ticket + 1 billete + 1 cobrar = **6 toques**.
- **Dónde duda:** si el cursor quedó en un campo de número, el código se escribe ahí (CAJ-07 🔴). Con lectores lentos o sin Enter no pasa nada, sin aviso (CAJ-08). Con la caja cerrada igual agrega (CAJ-08).
- **Si se equivoca:** escanear de más suma 1; quitar se hace con "−" o la basura, sin deshacer (CAJ-15).
- **Feedback:** aviso corto por escaneo (mismo id, no se acumulan ✅); "Código no encontrado" 12 s con botón "Agregar como producto nuevo". ✅

### Flujo 4 — Buscar a mano un producto con tilde ("azúcar")
- **Pasos:** tocar el buscador → escribir "azucar" (o "azúcar", ✅ acentos) → tocar la fila.
- **Toques:** 2 + teclear. Para el segundo producto: borrar el texto (el buscador no se limpia al tocar una fila y no hay ✕: 1–2 toques extra) → escribir → tocar. **~4 toques por producto** (CAJ-09).
- **Dónde duda:** con "azúcar" salen "Libra" y "Bolsa 5 lb": con Enter no elige y la manda a tocar (CAJ-10). Si dejó activo un chip de categoría y el producto es de otra, el sistema le ofrece crearlo de nuevo (CAJ-12).
- **Si se equivoca:** agregar una presentación equivocada se corrige quitando la línea (sin deshacer, CAJ-15).
- **Feedback:** la fila no cambia al tocarla; solo cambia el total de la barra (CAJ-13).

### Flujo 5 — Venta por peso (1.5 lb de queso) y por monto ("dame $1 de queso")
- **1.5 lb:** tocar el queso (1) → en la línea, atajo **1½** (1) → listo. **2 toques.** Alternativa: teclear 1.5 en el campo (el teclado decimal sale solo, ✅). ✅
- **$1 de queso:** tocar el queso (1) → "Vender por monto ($)" (2) → teclear 1.00 en el campo `$` (se selecciona solo al enfocar, ✅) → se muestra "≈ 0.4 libra". **2 toques + monto.**
- **Dónde duda:** "Vender por monto ($)" pone primero el total actual (p. ej. $2.50) y hay que reescribir; si no entiende que cambió de modo, cobra $2.50 por error (el campo queda marcado con borde y "Vendido por monto", así que se nota ✅). Los atajos ½ / 1 / 1½ también salen en productos de unidad (CAJ-14).
- **Si se equivoca:** "Vender por cantidad" vuelve atrás. ✅
- **Feedback:** el servidor recalcula la cantidad; el total mostrado es exactamente el monto pedido. ✅

### Flujo 6 — Producto que no existe: alta rápida y venderlo
- **Por búsqueda:** escribir el nombre → "No se encontraron productos" + botón principal "Agregar como producto nuevo" (1) → el diálogo trae el nombre escrito → teclear precio → "Agregar al ticket" (2) → el producto ya está en el ticket y el catálogo se refresca. **2 toques + precio.** ✅
- **Por escáner:** aviso 12 s con "Agregar como producto nuevo" (1) → el diálogo trae el código → nombre + precio → "Agregar al ticket". **2 toques + nombre y precio.**
- **Dónde duda:** el producto existe en otra categoría y no lo encuentra (CAJ-12). "Se vende por" tiene fichas rápidas (Unidad/Libra/Onza/Bolsa) y campo libre. Bien.
- **Si se equivoca:** puede quitar la línea, pero el producto queda creado "por revisar" (decidido: la dueña lo revisa).
- **Feedback:** "«X» agregado al ticket. Después se revisa en Inventario." ✅ Errores dentro del diálogo, cerca del botón. ✅

### Flujo 7 — Producto sin stock registrado
- Se ve en la lista como "Sin stock registrado" en tono ámbar (no bloquea, ✅ D-01). Tocar (1) → cobrar normal. Al cobrar sale un aviso ámbar de 15 s por línea ("vendido sin stock registrado"); la cajera no puede hacer nada con él.
- **Duda:** si varias líneas están sin stock, los avisos se apilan y pueden tapar el aviso del cambio (CAJ-17, hipótesis). La etiqueta "Sin stock registrado" se repite en toda la lista si la tienda aún no carga inventario (ruido, no error).

### Flujo 8 — Cobrar con billete de $20 y dar cambio
- **Pasos:** "$20" (1) → se ve "Cambio $X" en verde, grande → "Procesar pago" (2). **2 toques.** En celular: abrir el ticket (1) + $20 (2) + cobrar (3) = **3**.
- **Dónde se equivoca:** (a) si el precio del ticket guardado cambió, el cambio que dio ya no coincide con lo cobrado (CAJ-16); (b) si vació un ticket antes y quedó "Paga con" escrito, el siguiente cliente ve un cambio falso (CAJ-19); (c) si el cliente paga con menos, sale "Falta $X" (no bloquea ✅ "apoyar, no imponer").
- **Si se equivoca:** puede cambiar el billete antes de cobrar. Después de cobrar, la tarjeta "Última venta · Cambio: $X" queda visible hasta el siguiente producto (✅ UX-03/07); en celular, la barra dice "Cambio $X".
- **Feedback:** aviso "Venta registrada · Total · Cambio" 8 s, ¡Venta registrada! 3 s y tarjeta persistente. Triple pero útil.

### Flujo 9 — Equivocarse de cantidad y corregir antes de cobrar
- **Pasos:** tocar el campo de cantidad (se selecciona todo, ✅) → teclear la correcta; o "−" / "+"; o atajo ½/1/1½. **1–2 toques.**
- **Dónde duda:** "−" desde 1 elimina la línea de golpe, igual que la basura, y no hay "Deshacer" (CAJ-15). Un "30" por "3" no avisa, aunque el total grande sí se nota.
- **Feedback:** el total de la línea y del ticket cambian al instante. ✅

### Flujo 10 — Vaciar el ticket
- **Pasos:** "Vaciar" (1) → si hay más de 1 producto sale "¿Vaciar el ticket? Se quitan los N productos. La venta no se registra." → "Sí, vaciar" (2). **2 toques** (con 1 solo producto es 1 toque sin confirmar). ✅
- **Dónde duda:** el botón "Vaciar" es `ghost` y gris: no compite con "Procesar pago". ✅ Pero no limpia "Paga con" (CAJ-19).
- **Si se equivoca:** no hay deshacer; con la confirmación es aceptable.

### Flujo 11 — Venta en modo apagón
- **Pasos:** en el ticket, el interruptor "Modo apagón (ventas del cuaderno)" (1) → ya trae la fecha y hora de ahora; ajustar con el selector nativo (2–4) → cobrar normal. Una franja ámbar arriba dice "Modo apagón activo…" con botón "Apagar". Tras la venta el modo sigue encendido y la fecha se resalta para ajustarla (✅ UX-08).
- **Dónde duda:** recargar la página apaga el modo y pierde la fecha, y la siguiente venta del cuaderno se guarda con la hora de ahora, sin aviso (CAJ-23). El nombre cambia entre pantalla y mensajes (CAJ-24). Si borra la fecha, el cobro se bloquea sin decir por qué (CAJ-24).
- **Si se equivoca:** tiene que anular la venta desde Movimientos si es del turno abierto.

### Flujo 12 — Sacar dinero (pagar algo, guardar en bóveda)
- **Guardar en la bóveda:** "Sacar dinero" (1) → "Guardar en la bóveda" (2) → monto → "Confirmar $X" (3). **3 toques + monto.**
- **Pagar algo:** "Sacar dinero" (1) → "Pagar algo" (2) → monto → descripción (opcional) → categoría (opcional) → "Confirmar $X" (3). **3 toques + monto + una nota.**
- La cajera solo ve 2 de las 4 opciones (✅ D-06). Antes de confirmar hay una frase "Vas a sacar $5.00 de la gaveta para: agua" y el botón repite el monto. Muy bien.
- **Dónde se equivoca:** un monto mal digitado ($50 por $5) lo puede anular solo la dueña, y un "Guardar en la bóveda" equivocado no se puede anular en pantalla (CAJ-25). Reintentar tras un fallo de red no tiene clave de idempotencia.
- **Feedback:** "Listo: sacaste $X de la gaveta" + avisos. ✅

### Flujo 13 — Devolver un producto de una venta de hace 1 hora
- **Pasos:** barra inferior "Movimientos" (1) → el turno abierto ya viene desplegado → (bajar por las tarjetas y los movimientos) → tocar la venta (2) → "Devolver" (3) → teclear la cantidad en la línea (4) → elegir "Reingresar/Merma" (ya viene "Reingresar") → "Confirmar devolución" (5). **5 toques + cantidad.**
- **Dónde duda:** en celular la fila esconde hora y cantidad de artículos (CAJ-29). No hay "devolver todo" (CAJ-30). "Reingresar" y "Merma" no dicen qué le pasa al producto. La justificación es opcional (coincide con la regla: el motivo es opcional en el backend).
- **Si se equivoca:** una devolución no se deshace desde esta pantalla.
- **Feedback:** el diálogo se cierra y la lista se recarga; no hay mensaje de que quedó hecha ni cuánto entregar (CAJ-28).

### Flujo 14 — Anular la última venta
- **Pasos:** "Movimientos" (1) → bajar hasta "Ventas del turno" (la más nueva está primero, ✅) → tocar la venta (2) → "Anular venta" (3) → escribir el motivo (obligatorio) → "Confirmar anulación" (4). **4 toques + motivo.**
- **Dónde duda:** no hay atajo desde Vender, donde la cajera acaba de cobrar y detecta el error (CAJ-29). "Anular venta" solo existe con turno abierto y sin devoluciones; en turnos cerrados el botón desaparece sin explicar (CAJ-31).
- **Si se equivoca:** es irreversible (lo dice). La confirmación es adecuada.
- **Feedback:** si sale bien, no hay mensaje (CAJ-28); si falla, toda la pantalla se vuelve un cuadro rojo (CAJ-27).

### Flujo 15 — Registrar una merma ("se rompió un huevo")
- **Pasos:** "Inventario" (1) → buscar "huevo" (✅ L11) → tocar el producto (2) → "Registrar merma" (3) → cantidad (ya viene 1) → "¿Qué pasó?" ya viene "Quebrado / roto" → escribir el motivo (obligatorio para la cajera) → "Registrar merma" (4). **4 toques + 1 frase.**
- **Dónde duda:** si el producto tiene más de un lote, aparece "¿De qué lote?" con "Lote #12 · quedan 30" (CAJ-32). El motivo repite lo ya elegido en "¿Qué pasó?".
- **Si se equivoca:** anular mermas es de la dueña.
- **Feedback:** "Merma de 1 registrada en «Huevo»". ✅ Errores dentro del diálogo. ✅

### Flujo 16 — Cerrar caja, cuadrada y con descuadre
- **Cuadrada:** "Cerrar caja" (1) → teclear el total contado → aparece "Cuadra" en verde → (opcional) "Trasladar a bóveda" → "Confirmar cierre" (2). **2 toques + 1–2 montos.** ✅
- **Con descuadre ≥ $1:** aparece "Faltan $X / Sobran $X" en vivo, la etiqueta cambia a "Explica la diferencia (obligatorio desde $1)" y el botón dice "Explica la diferencia para cerrar" hasta que escribe algo. ✅ (✅ UX-10). **+ 1 frase.**
- **Dónde duda:** el sistema muestra el "Efectivo esperado" antes de contar (VIVO-09, diferido por decisión: no se critica aquí). Al terminar, el encabezado sigue diciendo "Caja abierta" porque el cierre reabre solo con lo que queda (CAJ-04): la cajera no sabe si cerró.
- **Si se equivoca:** no puede deshacer un cierre.

### Flujo 17 — Cerrar sesión en el celular
- **Pasos:** tocar la inicial del encabezado (1) → "Cerrar sesión" (2). **2 toques.** ✅ (UX-28). En laptop: el ícono de salir en el pie del sidebar (1 toque).
- **Dónde duda:** no pregunta nada aunque haya un ticket armado, y lo borra (CAJ-33).
- **Feedback:** va al login. ✅

### Flujo 18 — Sesión vencida a mitad de una venta
- La cookie dura 12 h (`app/auth/login/page.tsx:55-57`). Si vence con la página abierta, nada avisa hasta la siguiente llamada (por ejemplo "Procesar pago"): el `apiFetch` borra la cookie y hace `window.location.href = "/auth/login"` (`lib/api.ts:91-97`).
- **Lo que se conserva:** el ticket (guardado en el navegador, ✅). **Lo que se pierde:** "Paga con", el modo apagón con su fecha, los datos de cualquier diálogo abierto (por ejemplo, el conteo del cierre) y la clave de idempotencia.
- **Dónde duda:** el login no le dice "tu sesión venció, tu ticket sigue guardado" (CAJ-03). Una jornada de 12 h o más puede vencer justo a la hora del cierre.

### Flujo 19 — Se cae el internet al cobrar
- **Qué ve:** "No hay conexión con el sistema. Revisa el internet e intenta de nuevo. Si sigue, anota la venta y usa «Venta durante un apagón» al volver la conexión." ✅ (UX-25 resuelto en el texto), pero sale arriba del bloque de cobro, sin aviso emergente, y puede quedar fuera de vista en celular (CAJ-21).
- **Reintentar:** el segundo toque en "Procesar pago" reutiliza la misma clave de idempotencia: no duplica. ✅ Pero si recarga la página (reflejo natural) la clave se pierde y el cobro puede salir dos veces (CAJ-20 🔴).
- **Después del apagón:** el texto manda a "Venta durante un apagón", que en pantalla se llama "Modo apagón (ventas del cuaderno)" (CAJ-24).
- **No hay cola sin conexión** (decisión de diseño: `docs/domain/modo-contingencia.md`). No se critica.

---

## 3. Inventario de controles por pantalla

Leyenda: ✅ sí/correcto · — no aplica · ⚠ problema. "Carga" = qué indica mientras trabaja.

### 3.1 Login (`app/auth/login/page.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Usuario (`:109`) | Campo de texto | input | error arriba, `required` | no | — | Tab ✅, Enter envía ✅; sin autofoco | ⚠ sin `autoCapitalize="none"`/`autoCorrect="off"` (CAJ-01) |
| Contraseña (`:123`) | Campo de contraseña | input | igual | no | — | Enter envía ✅ | ⚠ sin "ver contraseña" (CAJ-01) |
| Iniciar sesión (`:135`) | Entra y va a Vender | primario | "Verificando acceso…" con spinner | sí, mientras carga ✅ | — | submit ✅ | — |
| Mensaje de error (`:101`) | Muestra el error | caja roja | texto del servidor | — | — | ⚠ sin `role="alert"`, un lector no lo anuncia | ⚪ CAJ-02 |
| Pie "¿Olvidaste tu contraseña?" (`:150`) | Texto de ayuda | texto | — | — | — | — | ✅ dice qué hacer |

### 3.2 Vender — encabezado y catálogo (`app/dashboard/pos/page.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Abrir caja (`:557`, con caja cerrada) | Abre el diálogo de apertura | ámbar relleno (principal del momento) | spinner mientras revisa la caja | no | — | Tab ✅ | ✅ es lo más visible cuando hace falta |
| Sacar dinero / "Sacar" (`:529`) | Abre el menú de salidas | `outline` | — | no | — | `aria-label` completo ✅ | ⚠ en celular solo dice "Sacar" (CAJ-26) |
| Cerrar caja (`:539`) | Abre el cierre | `outline` | recarga la caja al abrir | no | el diálogo mismo | ✅ | compite poco ✅ |
| Sin conexión · Reintentar (`:549`) | Reconsulta la caja | `outline` rojo | spinner del encabezado | no | — | ✅ | ✅ |
| Apagar (modo apagón) (`:572`) | Apaga el modo | `outline` pequeño | la franja desaparece | no | no (inofensivo) | ✅ | — |
| Buscador (`:582`) | Filtra por nombre/código; Enter agrega si hay uno | input 48 px | lista filtrada | no | — | ⚠ sin autofoco al entrar ni tras cobrar; Escape no limpia | CAJ-09, CAJ-10, CAJ-11 |
| Ícono de escáner (`:589`) | Solo decorativo | ícono gris | ninguno | — | — | — | ⚠ parece botón de cámara y no hace nada (CAJ-09) |
| Fichas de categoría (`:595`) | Filtran la lista | chip activo/inactivo, 44 px en celular ✅ | `aria-pressed` ✅ | no | — | ⚠ cada ficha es una parada de Tab | interactúa con CAJ-12 |
| Fila de producto (`:662`) | Agrega 1 al ticket | fila completa tocable + "+" | ⚠ ninguno en la fila (solo cambia el total) | no | — | un Tab por fila (cientos) | CAJ-11, CAJ-13 |
| Agregar como producto nuevo (`:654`) | Abre el alta rápida | primario | — | no | — | ✅ | CAJ-12 (sale con la categoría equivocada) |
| Reintentar catálogo (`:642`) | Recarga catálogo y caja | `outline` | spinner "Cargando catálogo…" | no | — | ✅ | — |
| Barra del ticket, celular (`:730`) | Abre la hoja del ticket | barra `card` con borde | contador y total | no | — | `aria-label="Ver ticket"` pisa el texto visible | ⚠ no dice "Cobrar" (CAJ-18) |
| Escáner global (hook) | Agrega por código | — | aviso 1.5 s / aviso 12 s con acción | `enabled: mounted` (sigue activo con diálogos abiertos) | — | ignora inputs enfocados | CAJ-07, CAJ-08 |

### 3.3 Ticket y cobro (`components/pos/CartLines.tsx`, `CheckoutSection.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Vaciar (`pos/page.tsx:697`, `:766`) | Pide vaciar | `ghost` gris | diálogo | no | sí, si hay más de 1 ✅ | ✅ | no limpia "Paga con" (CAJ-19) |
| Quitar línea (basura, `CartLines.tsx:104`) | Quita el producto | ícono 44 px | desaparece | no | ⚠ no, sin deshacer | ✅ | CAJ-15 |
| Restar / Sumar uno (`:128`, `:144`) | ±1 | `ghost` icono 44 px | total cambia | no | ⚠ "−" desde 1 quita la línea | ✅ | CAJ-15 |
| Campo Cantidad (`:137`) | Escribe la cantidad (hasta 3 decimales) | input sin borde | al instante | no | — | selecciona todo al enfocar ✅; Enter no sale del campo | ⚠ acepta cualquier cantidad de dígitos (CAJ-07) |
| Atajos ½ / 1 / 1½ (`:175`) | Fija la cantidad | chips, `aria-pressed` | resaltado | no | — | ✅ | ⚠ en todo producto (CAJ-14) |
| Vender por monto ($) / por cantidad (`:193`, `:201`) | Cambia el modo de la línea | texto azul | borde del campo, "≈ N lb" | no | — | ✅ | pone primero el total actual (ver flujo 5) |
| Campo Monto (`:118`) | Teclea el dinero exacto | input | total de línea | no | — | ✅ | — |
| Paga con (`CheckoutSection.tsx:330`) | Valor para calcular el cambio | `type=number` 44 px | "Cambio"/"Falta" en vivo | no | — | ⚠ Enter no cobra; escáner la ignora y escribe dentro | CAJ-07, CAJ-11, CAJ-19 |
| Exacto / $1 / $5 / $10 / $20 (`:344`) | Llena "Paga con" | `outline` 44 px | valor en el campo | "Exacto" sí con total 0 | — | ✅ | ⚪ falta $50 (CAJ-22) |
| Interruptor Modo apagón (`:383`) | Activa fechas del cuaderno | switch con `role="switch"` ✅ | franja ámbar arriba | no | no | ✅ | CAJ-23, CAJ-24 |
| Fecha y hora real (`:420`) | Hora de la venta del cuaderno | `datetime-local` | borde ámbar si hay que ajustar | no | — | ✅ | — |
| Procesar pago (`:440`) | Cobra | primario 56 px | "Procesando…" + spinner | sí, si no hay productos, caja o fecha ✅ | no (correcto: es lo normal) | ⚠ sin atajo | ⚠ nombre, posición en celular (CAJ-18), sin motivo al deshabilitarse por fecha (CAJ-24) |
| Tarjeta "Última venta" (`:302`) | Muestra el cambio hasta la siguiente | caja verde | persistente ✅ | — | — | — | ⚪ texto engañoso (CAJ-22) |

### 3.4 Abrir caja (`components/pos/AbrirCajaDialog.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Efectivo con el que empiezas (`:173`) | Fondo inicial | input 56 px | muestra el remanente arriba | no | — | autoFocus ✅, Enter envía ✅ | ⚪ puede ser pisado (CAJ-05) |
| Botones de origen (`:191`) | Eligen de dónde salió la diferencia | `default`/`outline`, `aria-pressed` | "No sé" ya marcado ✅ | no | — | ✅ | — |
| Nota (`:205`) | Nota opcional | input | — | no | — | ✅ | — |
| Cancelar (`:219`) | Cierra | `secondary` | — | no mientras carga ✅ | — | Escape ✅ | — |
| Abrir caja (`:222`) | Abre el turno | verde relleno | spinner + avisos 12 s | sí mientras carga ✅ | — | ✅ | — |

### 3.5 Cerrar caja (`pos/page.tsx:814-908`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Total físico en gaveta (`:834`) | Conteo | input 48 px | "Cuadra / Sobran / Faltan" en vivo ✅ | no | — | autoFocus ✅; **Enter cierra** | ⚪ CAJ-06 |
| Trasladar a bóveda (`:860`) | Monto que pasa a la bóveda | input | "Fondo siguiente turno" se recalcula ✅ | no | — | ✅ | ⚪ el error de "más de lo que hay" sale como toast (CAJ-06) |
| Reabrir automáticamente (`:872`) | Abre otro turno con lo que queda | casilla marcada por defecto | — | no | — | ✅ | ⚠ por defecto, hace invisible el cierre (CAJ-04) |
| Explica la diferencia (`:890`) | Observaciones | input; obligatorio desde $1 con cambio de etiqueta ✅ | borde rojo | no | — | ✅ | — |
| Cancelar (`:900`) | Cierra el diálogo | `secondary` | — | no | — | Escape ✅ | conserva lo escrito ✅ |
| Confirmar cierre (`:901`) | Cierra | ámbar relleno | spinner | sí: mientras carga o si falta la explicación ✅ | es la confirmación | ✅ | ⚠ sin resumen al terminar (CAJ-04) |

### 3.6 Sacar dinero (`components/pos/SacarDineroDialog.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Guardar en la bóveda / Pagar algo (`:200`) | Elige el motivo | tarjetas con ícono y descripción ✅ | — | no | — | ✅ | — |
| Monto (`:226`) | Cantidad | input 48 px | frase "Vas a sacar $X…" ✅ | no | resumen previo ✅ | autoFocus ✅ | — |
| Categoría (`:242`) | Elige categoría | select | "Sin categoría (Otros)" ✅ | no | — | select de Radix operable por teclado ✅ | si falla la carga queda vacío sin aviso (⚪) |
| Descripción (`:262`) | Nota | input | — | no | — | ✅ | ⚪ el motivo del gasto es opcional ("Gasto" por defecto): se pierde el porqué |
| Atrás (`:277`) | Vuelve al menú | `secondary` | — | no | — | ✅ | — |
| Confirmar $X (`:280`) | Registra | primario | spinner + "Listo: sacaste…" ✅ | sí mientras carga | resumen previo | ✅ | CAJ-25 (sin forma de corregir) |

### 3.7 Alta rápida (`components/pos/AltaRapidaDialog.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Nombre / Precio (`:361`, `:377`) | Datos mínimos | inputs 48 px | errores arriba del formulario, en español ✅ | no | — | autoFocus en Nombre ✅; Enter envía | — |
| Fichas Unidad/Libra/Onza/Bolsa + campo libre (`:391`, `:408`) | Unidad de venta | chips + input | `aria-pressed` | no | — | ✅ | etiqueta `htmlFor` apunta al campo libre (⚪) |
| Código de barras (`:422`) | Opcional | input mono | — | no | — | ✅ | — |
| Cancelar / Agregar al ticket (`:431`, `:434`) | Cierra / crea y agrega | `secondary` / primario | spinner | sí mientras carga ✅ | — | ✅ | — |

### 3.8 Movimientos para la cajera (`app/dashboard/movimientos/page.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Buscador (`:534`) | Turno, gasto o número de venta | input 44 px | "Buscando la venta…" ✅ | no | — | ✅ | — |
| Actualizar (`:541`) | Recarga | `outline` icono | giro | sí mientras carga | — | `aria-label` ✅ | — |
| Cabecera de turno (`:650`) | Despliega el turno | botón de ancho completo | `aria-expanded` ✅ | no | — | ✅ | — |
| Fila de venta (`:424`) | Despliega el desglose | fila | `aria-expanded` ✅ | no | — | ✅ | ⚠ en celular oculta hora y cantidad (CAJ-29) |
| Devolver (`:478`) | Abre la devolución | `outline` azul | — | no | el diálogo | ✅ | CAJ-30 |
| Anular venta (`:492`) | Abre la anulación | `outline` rojo | — | no | sí, con motivo obligatorio ✅ | ✅ | desaparece sin explicar en turnos cerrados (CAJ-31) |
| Confirmar anulación (`:831`) | Anula | rojo relleno | spinner; ⚠ sin éxito | sí mientras carga o sin motivo ✅ | sí ✅ | autoFocus en motivo ✅ | CAJ-27, CAJ-28 |
| Ver turnos anteriores (`:794`) | Pagina | `outline` | giro | sí mientras carga | — | ✅ | — |

### 3.9 Devolución (`components/movimientos/DevolucionDialog.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Cantidad por línea (`:442`) | Cuánto devolver | input numérico, `max` = lo vendido | total a reembolsar en vivo ✅ | no | — | label oculto con nombre del producto ✅ | ⚠ sin "todo" (CAJ-30) |
| Reingresar / Merma (`:463`) | Destino del producto | interruptor de 2 opciones; Merma en rojo | `aria-pressed` | no | — | ✅ | ⚠ jerga (CAJ-35) |
| Justificación (`:490`) | Motivo, opcional | input | — | no | — | ✅ | — |
| Confirmar devolución (`:511`) | Registra | primario | spinner; ⚠ sin éxito | sí si no hay cantidades o mientras carga ✅ | no (el monto va en el diálogo) | ✅ | CAJ-28 |

### 3.10 Merma (`components/inventario/AjusteInventarioDialog.tsx`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| ¿De qué lote? (`:186`) | Elige lote | select | "Lote #12 · quedan 30" | no | — | ✅ | ⚠ jerga y decisión que no es de la cajera (CAJ-32) |
| Cantidad a descontar (`:211`) | Cuánto | input, `max` = lo que queda | error en el diálogo ✅ | no | — | ✅ | ⚪ no dice la unidad |
| ¿Qué pasó? (`:227`) | Tipo de merma | select | — | no | — | ✅ | — |
| Motivo (obligatorio) (`:246`) | Texto | input | error "Escribe qué pasó…" ✅ | no | — | ✅ | ⚠ repite al selector (CAJ-32) |
| Registrar merma (`:262`) | Registra | ámbar relleno | spinner + "Merma de N registrada" ✅ | sí mientras carga o sin existencias ✅ | no (poco riesgo) | ✅ | — |

### 3.11 Navegación y sesión (`components/nav/*`, `hooks/*`)

| Control | Qué hace | Variante | Feedback | ¿Se deshabilita? | ¿Confirma? | Teclado y foco | Problema |
|---|---|---|---|---|---|---|---|
| Barra inferior (`bottom-nav.tsx`) | Vender / Inventario / Movimientos | íconos con texto 11 px, barra superior en la activa | `aria-current` ✅ | no | — | ✅ | ⚠ 11 px (⚪ CAJ-36) |
| Menú de usuario (`user-menu.tsx`) | Muestra la inicial y abre la hoja | `ghost` icono 44 px | nombre y rol ✅ | no | — | ✅ | — |
| Cerrar sesión, celular (`user-menu.tsx:48`) | Sale | `outline` | va al login | no | ⚠ no, borra el ticket (CAJ-33) | ✅ | CAJ-33 |
| Cerrar sesión, laptop (`sidebar.tsx:77`) | Sale | ícono 36 px sin borde | igual | no | ⚠ no | `aria-label` ✅ | CAJ-33; está pegado al interruptor de tema |
| Tema (`ThemeToggle`) | Claro/oscuro | ícono | — | no | — | ✅ | — |
| Hoja inferior (`bottom-sheet.tsx`) | Contenedor del ticket y del menú | hoja con X y asa | — | — | — | Escape ✅ | ⚪ el asa sugiere arrastrar (CAJ-36) |

---

## 4. Preguntas obligatorias

**¿En el celular la acción principal de cada momento está lo más visible y al alcance del pulgar?**
- **Agregar:** sí en cuanto al tamaño (fila completa, "+"), pero la fila no muestra que el producto ya está en el ticket (CAJ-13).
- **Cobrar:** no del todo. Desde el catálogo es "tocar la barra" (que no dice cobrar) y luego buscar "Procesar pago" al final de una hoja larga, bajo 3 filas por producto y el bloque de modo apagón (CAJ-18). Hipótesis: ver en vivo con 3 productos a 375 × 667.
- **Confirmar (abrir/cerrar caja, sacar dinero):** sí: botones grandes de color, abajo a la derecha del diálogo, deshabilitados mientras trabajan. El de "Abrir caja" ámbar es lo más visible cuando hace falta.

**¿Hay algún camino en que la cajera cobre mal, dé mal el cambio o registre algo dos veces?**
Sí, cuatro:
1. Escanear con el cursor en Cantidad o "Paga con" (CAJ-07).
2. Perder la respuesta del cobro y recargar (CAJ-20): venta duplicada.
3. Ticket guardado con un precio viejo: el total y el cambio mostrados no son los que cobra el servidor (CAJ-16).
4. "Paga con" que sobrevive a "Vaciar" (CAJ-19): cambio falso para el siguiente cliente.
Además: modo apagón perdido al recargar (CAJ-23) guarda la venta del cuaderno con la hora de hoy. El doble toque directo en "Procesar pago" **sí** está cubierto: los dos intentos comparten la clave (`pos/page.tsx:309-315`).

**¿Cada error le dice qué hacer a continuación, en sus palabras?**
Mayormente sí: sin conexión, caja cerrada, falta el nombre/precio, "Solo quedan N en ese lote", "Escribe qué pasó" son claros. Fallan: el error de cobro queda fuera de vista (CAJ-21); "Sesión expirada. Redirigiendo al login..." dura un instante y el login no lo explica (CAJ-03); el error al anular borra la pantalla y no ofrece reintentar (CAJ-27); el botón de cobro deshabilitado por falta de fecha no dice por qué (CAJ-24); los errores de 400 del servidor llegan tal cual (`lib/api.ts:107-113`) y quedan fuera de nuestro control (revisar los textos del backend).

**¿El teclado físico (Enter, Escape, Tab) sirve para vender sin mouse en la laptop?**
A medias. Sirve: lector de barras (agrega solo), Enter en el buscador con 1 resultado o un código exacto, Enter en los diálogos (todos son `<form>`), Escape cierra diálogos y hojas. No sirve: no hay atajo para ir al buscador ni a "Paga con"; Enter en "Paga con" no cobra; con varios resultados Enter no elige y no hay flechas; para llegar al ticket con Tab hay que atravesar fichas de categoría y una parada por cada fila de producto; tras cobrar el foco no vuelve al buscador (CAJ-10, CAJ-11).

**¿Qué pasa con el ticket si cambia de pestaña, recarga o se le vence la sesión?**
- **Cambia de pestaña / recarga:** el ticket **se conserva** (`src/store/cartStore.ts:121`, `localStorage` bajo `tienda-carrito`). ✅ No se conserva: "Paga con", modo apagón y fecha, ni la clave de idempotencia (CAJ-20, CAJ-23).
- **Sesión vencida:** el ticket se conserva; la sacan al login sin decir por qué ni que el ticket sigue (CAJ-03).
- **Cerrar sesión:** borra el ticket a propósito (terminal compartida) pero sin avisar (CAJ-33).
- **Dos pestañas abiertas:** el almacenamiento no se sincroniza entre pestañas, así que cada una puede mostrar un ticket distinto hasta recargar (CAJ-36, ⚪).
- **Ticket del día anterior:** si queda un ticket sin cobrar, sigue ahí al día siguiente (sin aviso).

---

## 5. Hallazgos por flujo

### Flujo 1 y 18 — Entrar, sesión

### CAJ-01 — En el celular el usuario se autocapitaliza y no hay "ver contraseña" 🟡
- **Pantalla / flujo:** Login, flujo 1.
- **Evidencia:** `app/auth/login/page.tsx:109-118` (campo usuario: `type="text"`, solo `autoComplete="username"`), `:123-132` (contraseña sin botón de mostrar).
- **Qué vive la usuaria:** en el teléfono el teclado escribe "Karla" y el sistema (o el servidor) puede esperar "karla"; ve "Credenciales inválidas" sin saber qué letra falló. Escribir una contraseña a ciegas en teclado táctil es la causa más común de error de ingreso.
- **Recomendación:** `autoCapitalize="none" autoCorrect="off" spellCheck={false}` en usuario; botón de ojo (con `aria-label`) para mostrar la contraseña; mensaje de error "Usuario o contraseña incorrectos. Revisa mayúsculas y minúsculas." Comprobar en el backend si el usuario distingue mayúsculas; si no, no hace falta tocar nada más.
- **Esfuerzo:** S
- **Confianza:** Hipótesis: ver en vivo (en un celular real; depende del teclado).

### CAJ-02 — Textos y accesibilidad menor del login (persiste UX-02) ⚪
- **Pantalla / flujo:** Login.
- **Evidencia:** `app/auth/login/page.tsx:95` ("para acceder al ERP"), `:101-105` (error sin `role="alert"`), `:108`, `:122` (etiquetas `text-xs` grises).
- **Qué vive la usuaria:** "ERP" no es una palabra de tienda; las etiquetas son pequeñas y de bajo contraste a plena luz.
- **Recomendación:** "Entra con tu usuario y contraseña"; `role="alert"` al error; etiquetas `text-sm`.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-03 — Sesión vencida: te saca sin decir por qué y pierde lo no guardado (persiste UX-25) 🟡
- **Pantalla / flujo:** todas, flujo 18.
- **Evidencia:** `lib/api.ts:91-97` (el 401 borra solo `token`, no `user`, y hace `window.location.href`; el mensaje "Sesión expirada. Redirigiendo..." nunca se ve), `app/auth/login/page.tsx:55-57` (12 h), `proxy.ts:19-24` (redirige sin motivo).
- **Qué vive la usuaria:** a las 8 p. m., al apretar "Procesar pago" o "Confirmar cierre" con el cliente delante, la página salta al login sin explicación. Tras volver a entrar, el ticket está, pero "Paga con", el modo apagón y lo que había tecleado en el cierre de caja desaparecieron. Una jornada de 12 h puede vencer justo a la hora del cierre.
- **Recomendación:** (a) redirigir a `/auth/login?motivo=sesion` y mostrar arriba "Tu sesión venció. Entra de nuevo: tu ticket sigue guardado."; (b) alargar la cookie y el JWT (p. ej. 16–24 h) o renovar con la actividad; (c) borrar también la cookie `user`.
- **Esfuerzo:** M (a, c: S; b toca el backend y es decisión de seguridad)
- **Confianza:** Confirmado en código.

### Flujo 2 y 16 — Abrir y cerrar caja

### CAJ-04 — Cierre sin confirmación ni resumen; la reapertura automática lo hace invisible 🟡
- **Pantalla / flujo:** Cerrar caja, flujos 2 y 16.
- **Evidencia:** `app/dashboard/pos/page.tsx:248-285` (tras cerrar no hay `toast.success`; con `autoOpenNext` marcado por defecto, `:148`, abre otro turno y `setCajaActiva(nuevaCaja)`), `:512-518` (el encabezado vuelve a "Caja abierta").
- **Qué vive la usuaria:** cuenta, aprieta "Confirmar cierre", el diálogo se cierra y el encabezado sigue diciendo "Caja abierta" con el mismo aspecto. No sabe si cerró ni cómo le quedó: no ve "Cuadró" ni cuánto dejó de fondo. Además, como el turno nuevo se abre solo, nadie vuelve a ver la pantalla "Abrir caja" ni cuenta el fondo por la mañana; el turno queda abierto toda la noche con el nombre de quien cerró.
- **Recomendación:** (1) aviso de éxito con el resultado: "Caja cerrada. Cuadró. Fondo para mañana: $50.00" (o "Faltaron $1.50"); (2) mostrarlo como tarjeta que dure hasta tocarla; (3) preguntar a la dueña si "Reabrir automáticamente" debe quedar **desmarcado** por defecto para que la mañana empiece con "Abrir caja" y el conteo. Es decisión de negocio, se plantea con opciones.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-05 — La respuesta tardía de "último cierre" pisa lo que la cajera ya escribió ⚪
- **Pantalla / flujo:** Abrir caja.
- **Evidencia:** `components/pos/AbrirCajaDialog.tsx:57-79` (`setFondo(valor.toString())` al llegar la respuesta, sin comprobar si ya escribió).
- **Qué vive la usuaria:** con internet lento escribe "60" y de pronto el campo cambia a "50": abre con otro fondo sin darse cuenta (se registra una diferencia).
- **Recomendación:** solo rellenar si `fondo` sigue vacío (`setFondo(prev => prev === "" ? valor : prev)`) y deshabilitar el botón "Abrir caja" hasta que llegue la respuesta o falle.
- **Esfuerzo:** S
- **Confianza:** Probable.

### CAJ-06 — Cierre: validaciones por aviso emergente y Enter cierra de una ⚪
- **Pantalla / flujo:** Cerrar caja.
- **Evidencia:** `app/dashboard/pos/page.tsx:221-229` (`toast.error` para efectivo inválido y "más de lo que hay en la gaveta"), `:824` (`<form onSubmit>`: Enter en cualquier campo cierra).
- **Qué vive la usuaria:** un aviso que dura 4 s y desaparece mientras mira la gaveta; Enter en "Total físico" cierra sin que haya mirado "Trasladar a bóveda". Es el patrón mixto de UX-29 (persiste): otros diálogos usan errores internos.
- **Recomendación:** errores internos bajo el campo (`aria-invalid` ya está puesto en observaciones); si `monto_a_boveda > total`, marcar el campo y deshabilitar el botón con texto claro.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### Flujos 3, 4, 6 — Escanear y buscar

### CAJ-07 — Escanear con el cursor en Cantidad o "Paga con" escribe el código en ese campo 🔴
- **Pantalla / flujo:** Vender, flujos 3 y 8.
- **Evidencia:** `hooks/useBarcodeScanner.ts:30-37` (si hay un `INPUT` enfocado, ignora el escáner); `components/pos/CartLines.tsx:39,52-58` (el patrón `^\d*[.,]?\d{0,3}$` acepta cualquier cantidad de dígitos y cada tecla llama `updateQuantity`); `components/pos/CheckoutSection.tsx:330-341` ("Paga con" sin tope). El campo de búsqueda sí está cubierto por su Enter (`pos/page.tsx:445-459`).
- **Qué vive la usuaria:** escribe "3" en la cantidad de la lata, el cursor queda ahí, escanea el siguiente producto: el lector "teclea" `7501055300112` en el campo y la lata queda en 7 501 055 300 112 unidades, con un total absurdo (el servidor lo rechaza solo al cobrar, con un mensaje técnico, o lo acepta si cabe en el límite de 99 999). Con "Paga con" pasa lo mismo: el código se vuelve un billete y el cambio sale disparatado.
- **Recomendación:** (1) en `CampoNumero` limitar la cantidad al máximo del backend (99 999) y a 7 dígitos, y hacer `blur()` con Enter/Tab; (2) en el hook, detectar ráfagas rápidas (≥ 6 teclas con < 30 ms) también cuando el foco está en un campo numérico que no sea el buscador, evitar que se escriban (`preventDefault` desde la 2.ª tecla de la ráfaga) y despachar `onScan`; (3) en "Paga con", tope de 6 dígitos.
- **Esfuerzo:** M
- **Confianza:** Probable (mecánica confirmada en código; conviene reproducir con un lector).

### CAJ-08 — Escáner: umbral de 30 ms, sin largo mínimo, agrega con caja cerrada (persiste UX-06 d, e) 🟡
- **Pantalla / flujo:** Vender, flujo 3.
- **Evidencia:** `hooks/useBarcodeScanner.ts:42` (más de 30 ms entre teclas reinicia el búfer), `:46-50` (cualquier longitud ≥ 1 se despacha), `pos/page.tsx:462-475` (agrega aunque `cajaActiva` sea null; activo con los diálogos abiertos, `enabled: mounted`).
- **Qué vive la usuaria:** con un lector Bluetooth o económico (≈ 40–80 ms entre teclas) no pasa nada: ni producto, ni aviso, y lo atribuye a que "el sistema no sirve". Con la caja cerrada arma todo el ticket y lo descubre al abrirlo. Con un diálogo abierto y un botón enfocado (por ejemplo "Sacar dinero → Pagar algo") un escaneo agrega al ticket por detrás.
- **Recomendación:** subir el umbral a ~80 ms con un mínimo de 4 caracteres; `enabled: mounted && !hayDialogoAbierto`; con la caja cerrada mostrar "Abre la caja para vender" con botón "Abrir caja" en lugar de agregar (o agregar y avisar); en "no encontrado" añadir "Buscar por nombre" (UX-06 e).
- **Esfuerzo:** M
- **Confianza:** Hipótesis: ver en vivo (depende del lector).

### CAJ-09 — Buscar a mano: no se limpia al tocar, sin ✕, ícono de escáner que no es botón 🟡
- **Pantalla / flujo:** Vender, flujo 4.
- **Evidencia:** `app/dashboard/pos/page.tsx:664` (tocar la fila no limpia `searchTerm`; el Enter sí lo hace, `:455`), `:582-589` (el `<Input>` no es `type="search"` y no tiene botón de borrar), `:589` (`<ScanBarcode>` decorativo a la derecha).
- **Qué vive la usuaria:** para vender 3 productos a mano, después de cada toque tiene que borrar la búsqueda manualmente (mantener "retroceso" en el celular). El ícono del código de barras parece botón de "escanear con la cámara" y no hace nada.
- **Recomendación:** al tocar una fila con búsqueda activa, limpiar el campo y devolver el foco; botón ✕ visible cuando hay texto (`aria-label="Borrar búsqueda"`); Escape también limpia; quitar el ícono de escáner o convertirlo en ayuda ("Escanea con el lector").
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-10 — Enter solo agrega con un único resultado; con varios manda al mouse 🟡
- **Pantalla / flujo:** Vender, flujo 4 (laptop).
- **Evidencia:** `app/dashboard/pos/page.tsx:445-459` (con más de 1 resultado muestra "Hay varios resultados: toca el producto…").
- **Qué vive la usuaria:** "azúcar" devuelve "Libra" y "Bolsa 5 lb": Enter no elige, no se puede bajar con flechas y debe tomar el mouse.
- **Recomendación:** flechas ↑/↓ para resaltar una fila (la primera ya resaltada) y Enter para agregar la resaltada; o Enter agrega la primera cuando una coincide exactamente con el nombre.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código.

### CAJ-11 — Sin atajos de teclado; Enter en "Paga con" no cobra (persiste UX-07) 🟡
- **Pantalla / flujo:** Vender, laptop.
- **Evidencia:** `components/pos/CheckoutSection.tsx:330-341` (el campo no está dentro de un `<form>` ni tiene `onKeyDown`), `app/dashboard/pos/page.tsx:582-587` (sin `autoFocus`; el foco no vuelve al buscador tras `handleCheckout`, `:340-356`).
- **Qué vive la usuaria:** con la laptop, después de escanear debe tomar el mouse para llegar a "Paga con" y a "Procesar pago"; tras cobrar, tiene que hacer clic en el buscador antes de buscar.
- **Recomendación:** (a) Enter en "Paga con" = cobrar (si hay productos y caja); (b) tecla `/` o `F2` = foco al buscador; `F4` = foco a "Paga con"; (c) enfocar el buscador al entrar a Vender y tras cada venta; (d) Escape limpia el buscador; (e) mostrar los atajos como una línea de ayuda discreta.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código.

### CAJ-12 — "Agregar como producto nuevo" aparece aunque el producto exista en otra categoría 🟡
- **Pantalla / flujo:** Vender, flujos 4 y 6.
- **Evidencia:** `app/dashboard/pos/page.tsx:386-393` (el filtro combina categoría y texto), `:649-657` (la lista vacía ofrece crear el producto sin avisar que hay un filtro activo).
- **Qué vive la usuaria:** deja puesta la ficha "Lácteos", busca "azúcar" y el sistema dice "No se encontraron productos… Agrégalo y véndelo ahora". Lo crea: ahora hay dos "Azúcar", una "por revisar", y la dueña tendrá que limpiar el catálogo.
- **Recomendación:** si hay búsqueda y ficha activa, buscar en todas las categorías y mostrar "Hay resultados en otras categorías" con botón "Ver en Todos"; ofrecer crear solo cuando la búsqueda en todas las categorías queda en cero.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-13 — Celular: tocar un producto no se nota en la fila y el encabezado se come la pantalla 🟡
- **Pantalla / flujo:** Vender, flujo 3 (celular).
- **Evidencia:** `app/dashboard/pos/page.tsx:662-681` (la fila no cambia al agregar; el aviso "Agregado" solo se dispara con escáner y Enter, `:439-442`), `:508-627` (encabezado pegajoso: título/caja, apagón, buscador, fichas, banner) más el encabezado móvil de 56 px (`app/dashboard/layout.tsx:23`), la barra del ticket y la barra inferior.
- **Qué vive la usuaria:** toca "Coca-Cola" dos veces sin querer o creyendo que no pasó; solo el total de la barra cambia. En un teléfono de 667 px quedan más o menos 4 filas visibles entre barras. Estimación: 56 + ~215 + 56 + ~64 = ~390 px fijos.
- **Recomendación:** insignia "× 2" en la fila cuando ya está en el ticket; vibración corta o aviso breve también al tocar (mismo id que el del escáner); reducir el encabezado en celular (ocultar "Caja abierta" cuando no hay nada que decir, fichas en una línea).
- **Esfuerzo:** M
- **Confianza:** Hipótesis: ver en vivo (alturas reales a 375 × 667).

### Flujos 5, 9, 10 — Armar y corregir el ticket

### CAJ-14 — Cada línea ocupa 3 filas; atajos ½ y 1½ en productos que no son de peso 🟡
- **Pantalla / flujo:** Ticket, flujos 5 y 9.
- **Evidencia:** `components/pos/CartLines.tsx:94-209` (fila 1: nombre y basura; fila 2: cantidad y total; fila 3: atajos y "Vender por monto"), `:12-16` (los atajos ½, 1, 1½ salen siempre).
- **Qué vive la usuaria:** con 3 productos el ticket mide ~420 px y empuja "Procesar pago" fuera de vista (ver CAJ-18). Una "Coca-Cola" muestra "½" al lado de "1": un toque accidental la vende por la mitad (se cobra 0.5 × precio).
- **Recomendación:** mostrar ½ / 1½ / "Vender por monto" solo en presentaciones de peso o medida (Libra, Onza, Kilo) y compactar el resto a una sola fila (nombre + cantidad + total); si se quiere conservar, pasar los atajos a un menú "⋯" por línea.
- **Esfuerzo:** M
- **Confianza:** Hipótesis: ver en vivo (que el servidor acepte 0.5 de unidad lo permite la regla D-03).

### CAJ-15 — Quitar una línea (basura o "−" desde 1) no se puede deshacer 🟡
- **Pantalla / flujo:** Ticket, flujo 9.
- **Evidencia:** `components/pos/CartLines.tsx:104-110` (quita sin confirmar), `:128-134` + `src/store/cartStore.ts:77-80` (`updateQuantity(id, 0)` llama a `removeItem`).
- **Qué vive la usuaria:** a la segunda vez que toca "−" para pasar de 2 a 1 y a 0, el producto desaparece, con una línea de cantidad personalizada o de monto incluida; para recuperarlo debe volver a buscarlo y a reescribir la cantidad.
- **Recomendación:** aviso breve "Quitaste «Queso» · Deshacer" (acción de Sonner que reinserta la línea tal como estaba), y que "−" se detenga en 1 (la basura es la que quita).
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-16 — Precio congelado en el ticket guardado: total y cambio distintos a lo cobrado 🟡
- **Pantalla / flujo:** Ticket y cobro, flujo 8.
- **Evidencia:** `src/store/cartStore.ts:62-77` (guarda `precio` al agregar) y `:121-135` (persiste en `localStorage`), `app/dashboard/pos/page.tsx:296-300` (al cobrar solo se envían `presentacion_id` y `cantidad`: el servidor cobra con el precio actual), `:325` (el resultado usa el total del servidor).
- **Qué vive la usuaria:** la dueña cambió un precio a las 7 a. m. o hay un ticket que quedó de ayer; la cajera ve $4.50, el cliente paga $5, le da $0.50 de cambio, y la venta se registra en $4.75: el aviso final dice "Cambio: $0.25". Ya entregó mal el cambio.
- **Recomendación:** al montar Vender y cada vez que se refresca el catálogo, reconciliar `precio` de cada línea con la presentación actual y, si cambió, avisar "El precio de «X» cambió: ahora $Y". No bloquea.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código.

### Flujos 7 y 8 — Cobrar

### CAJ-17 — Avisos de stock apilados (15 s cada uno) pueden tapar el cambio ⚪
- **Pantalla / flujo:** Cobrar, flujo 7.
- **Evidencia:** `app/dashboard/pos/page.tsx:332-338` (un aviso de éxito de 8 s y un aviso ámbar de 15 s por cada línea sin stock).
- **Qué vive la usuaria:** vende 4 productos sin stock registrado: 4 avisos ámbar de 15 s y el de "Venta registrada · Cambio" queda detrás en la pila. La tarjeta "Última venta" sí queda como respaldo.
- **Recomendación:** un solo aviso agrupado "3 productos se vendieron sin stock registrado" con duración corta (6 s); el detalle, en Inventario.
- **Esfuerzo:** S
- **Confianza:** Hipótesis: ver en vivo.

### CAJ-18 — Celular: "Procesar pago" fuera de vista, sin el total y con otro nombre 🟡
- **Pantalla / flujo:** Cobrar, flujo 8 (celular).
- **Evidencia:** `app/dashboard/pos/page.tsx:730-758` (barra del ticket: "3 productos … $X >"), `:761-795` (hoja con `max-h-[90dvh] overflow-y-auto`, `components/ui/bottom-sheet.tsx:33`), `components/pos/CheckoutSection.tsx:290-458` (orden: total, "Paga con", billetes, "Falta/Cambio", bloque Modo apagón, y al final el botón de 56 px).
- **Qué vive la usuaria:** el cliente espera. Toca la barra, ve las 3 líneas, escribe $20 y tiene que hacer scroll para encontrar "Procesar pago". El botón no dice cuánto cobra y la palabra es "Procesar pago", no "Cobrar". La barra tampoco dice "Cobrar".
- **Recomendación:** pie fijo en la hoja con el botón "Cobrar $12.50" siempre visible (con `sticky bottom-0` y el área segura); mover el bloque "Modo apagón" a un enlace chico "¿Venta del cuaderno?" al final; en la barra, el texto "Cobrar · 3 productos · $12.50".
- **Esfuerzo:** M
- **Confianza:** Hipótesis: ver en vivo (con 3 productos a 375 × 667 el contenido pasa de ~850 px frente a ~600 px de la hoja).

### CAJ-19 — "Paga con" queda escrito al vaciar el ticket y falsea el cambio del siguiente 🟡
- **Pantalla / flujo:** Cobrar, flujo 10.
- **Evidencia:** `app/dashboard/pos/page.tsx:481-484` y `:919` (`pedirVaciar` y "Sí, vaciar" solo llaman `clearCart()`); `setPagoCliente("")` solo ocurre al cobrar con éxito (`:347`).
- **Qué vive la usuaria:** el cliente se arrepiente, vacía el ticket con "Paga con $20" ya escrito; atiende al siguiente, que compra $3: aparece "Cambio $17.00" sin que haya escrito nada.
- **Recomendación:** limpiar `pagoCliente` junto con el ticket (en `clearCart` o con un efecto cuando `items.length === 0`).
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-20 — Respuesta perdida + recarga = cobro duplicado (la clave vive solo en memoria) 🔴
- **Pantalla / flujo:** Cobrar, flujo 19.
- **Evidencia:** `app/dashboard/pos/page.tsx:167` (`idemRef = useRef(...)`), `:309-315` (la clave se reutiliza solo dentro de la misma página), `src/store/cartStore.ts:121-125` (el ticket sí sobrevive a la recarga). Backend: `docs/domain/ventas-y-devoluciones.md` §Idempotencia.
- **Qué vive la usuaria:** aprieta "Procesar pago"; la venta llega al servidor pero se cae el internet antes de la respuesta; ve "No hay conexión…". Recarga la página (lo natural), el ticket sigue ahí, cobra otra vez: dos ventas, stock descontado dos veces y el efectivo esperado sube el doble.
- **Recomendación:** guardar `{ key, firma }` en `sessionStorage` (o junto al ticket persistido) y borrarla al cobrar con éxito o al cambiar el ticket; en el mensaje de "sin conexión" durante un cobro agregar "Antes de repetirlo, mira en Movimientos si la venta ya quedó".
- **Esfuerzo:** S
- **Confianza:** Probable (necesita una respuesta perdida con la solicitud entregada).

### CAJ-21 — El error de cobro sale arriba, fuera de vista y sin aviso emergente 🟡
- **Pantalla / flujo:** Cobrar, flujo 19.
- **Evidencia:** `components/pos/CheckoutSection.tsx:296-300` (el error es el primer elemento del bloque, arriba de "Total a cobrar"), `app/dashboard/pos/page.tsx:357-360` (solo `setCheckoutError`; sin `toast`).
- **Qué vive la usuaria:** en la hoja del celular, ya desplazada hacia el botón, toca "Procesar pago" y no pasa nada visible: el botón vuelve a su texto y el mensaje está unos cientos de píxeles más arriba. Toca de nuevo, confundida.
- **Recomendación:** además del mensaje, un `toast.error` con el mismo texto, y mover el cuadro de error justo encima del botón (o hacer scroll hasta él, `scrollIntoView`). Con el pie fijo de CAJ-18 queda resuelto.
- **Esfuerzo:** S
- **Confianza:** Probable (depende del scroll de la hoja; ver en vivo).

### CAJ-22 — Detalles: "Cobrada sin dato de pago" engañoso y falta el billete de $50 ⚪
- **Pantalla / flujo:** Cobrar.
- **Evidencia:** `components/pos/CheckoutSection.tsx:305-309` (sin cambio → "Cobrada sin dato de pago"; también cuando sí escribió un pago menor al total), `:227` (`BILLETES = [1, 5, 10, 20]`), `pos/page.tsx:326-343`.
- **Qué vive la usuaria:** el cliente pagó $3 de un total de $5 y la tarjeta dice "sin dato de pago", como si no lo hubiera escrito. En El Salvador circulan billetes de $50 y $100 y no hay botón.
- **Recomendación:** si hubo pago menor, decir "Pagó $3.00: faltaron $2.00 (la venta quedó registrada igual)"; sumar $50.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### Flujo 11 — Modo apagón

### CAJ-23 — Recargar apaga el modo y la venta del cuaderno se guarda con la hora de ahora (persiste UX-08 a medias) 🟡
- **Pantalla / flujo:** Modo apagón, flujo 11.
- **Evidencia:** `app/dashboard/pos/page.tsx:158-161` (`contingencia` y `fechaContingencia` son `useState`, sin persistencia), `:304-307` (sin modo, `fechaReal` es `undefined` y se registra con la hora actual), `src/store/cartStore.ts:121-125` (el ticket sí se conserva).
- **Qué vive la usuaria:** captura 15 ventas del cuaderno de ayer; a la décima el navegador recarga (o cambia de pestaña y el celular la descarta). El ticket sigue ahí, la franja ámbar ya no, el interruptor está apagado y la venta de ayer se registra con la hora de hoy, sin ningún aviso.
- **Recomendación:** guardar el modo y la fecha en `sessionStorage`; en la barra de arriba dejar el indicador mientras esté activo (ya existe).
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-24 — Tres nombres distintos y botón deshabilitado sin decir por qué 🟡
- **Pantalla / flujo:** Modo apagón y sin conexión, flujos 11 y 19.
- **Evidencia:** `components/pos/CheckoutSection.tsx:399` ("Modo apagón (ventas del cuaderno)"), `lib/api.ts:660-661` (el mensaje de sin conexión dice «Venta durante un apagón»), `app/dashboard/pos/page.tsx:570` ("Modo apagón activo…"), `CheckoutSection.tsx:277,449-457` (con `faltaFecha` el botón se deshabilita y sigue diciendo "Procesar pago").
- **Qué vive la usuaria:** el mensaje de error le manda a un control con otro nombre. Y si borra la fecha, el botón se apaga sin explicación (y un apagón de luz no es lo mismo que "se cayó el internet": el modo sirve para ambos).
- **Recomendación:** un solo nombre ("Venta del cuaderno") en el interruptor, la franja y el mensaje de error; el botón deshabilitado por fecha dice "Pon la fecha de la venta".
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### Flujo 12 — Sacar dinero

### CAJ-25 — Un monto mal digitado no lo puede corregir la cajera (ni nadie en pantalla si fue a la bóveda) 🟡
- **Pantalla / flujo:** Sacar dinero, flujo 12.
- **Evidencia:** `app/dashboard/movimientos/page.tsx:165` (`TIPOS_ANULABLES` no incluye `RETIRO_BOVEDA`), `:757-762` (solo `esAdmin` ve "Anular"), `components/pos/SacarDineroDialog.tsx:154-170` (sin clave de idempotencia).
- **Qué vive la usuaria:** quería pasar $5 a la bóveda y pasó $50. El resumen previo ayudó, pero ya está hecho: no puede deshacerlo; hasta la dueña solo puede "Traer de la bóveda" para compensar. Si falla la red y reintenta, puede registrar dos veces.
- **Recomendación:** (1) pedir un segundo toque "Sí, $50.00" cuando el monto supera un umbral (p. ej. $20) o es mayor al 50 % del esperado; (2) tras guardar, el aviso dice "Si te equivocaste, avísale a la dueña"; (3) plantear a la dueña, como decisión de negocio con opciones, si la cajera puede anular sus propios movimientos del turno abierto en los primeros minutos, y si `RETIRO_BOVEDA` debe poder anularse (con motivo).
- **Esfuerzo:** M (decisión de negocio)
- **Confianza:** Confirmado en código.

### CAJ-26 — En celular el botón dice solo "Sacar" ⚪
- **Pantalla / flujo:** Vender, encabezado.
- **Evidencia:** `app/dashboard/pos/page.tsx:536-537` (`<span className="sm:hidden">Sacar</span>`).
- **Qué vive la usuaria:** "Sacar" no dice qué: ¿un producto? ¿del ticket? El ícono de monedas ayuda, pero a la distancia de un mostrador, no mucho.
- **Recomendación:** "Gaveta" con el ícono o "Dinero"; o mantener "Sacar dinero" y bajar a 2 líneas en celular.
- **Esfuerzo:** S
- **Confianza:** Hipótesis: ver en vivo.

### Flujos 13 y 14 — Devolver y anular

### CAJ-27 — Un error al anular borra la lista entera y no deja reintentar (persiste UX-13) 🟡
- **Pantalla / flujo:** Movimientos, flujo 14.
- **Evidencia:** `app/dashboard/movimientos/page.tsx:368-371` (en error: `setError` y `setIsAnulando(false)`, cierra el diálogo), `:615-619` (si `error` existe, en lugar de la lista se muestra solo el cuadro rojo, sin botón).
- **Qué vive la usuaria:** al anular, el servidor responde un error (turno ya cerrado, sin conexión): se cierra el diálogo con el motivo escrito y toda la pantalla se vuelve un cuadro rojo. No hay lista ni "Reintentar"; debe tocar el botón de actualizar de la cabecera.
- **Recomendación:** dejar el diálogo abierto y mostrar el error dentro (ya existe `{error && …}` en `:826`), con el motivo conservado; reservar el cuadro rojo de página solo para la carga inicial y con botón "Reintentar".
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-28 — Anular y devolver terminan en silencio (persiste UX-14) 🟡
- **Pantalla / flujo:** Movimientos, flujos 13 y 14.
- **Evidencia:** `app/dashboard/movimientos/page.tsx:360-367` (anular: recarga y cierra, sin aviso), `components/movimientos/DevolucionDialog.tsx:393-401` (devolver: `onDone` y cierra).
- **Qué vive la usuaria:** toca "Confirmar devolución", el diálogo desaparece y la lista cambia sutilmente: no hay un "Listo". Para devolver dinero necesita saber la cifra final que entregó el sistema.
- **Recomendación:** aviso "Devolución registrada: entrega $2.50 al cliente" (usar el `total_reembolsado` de la respuesta) y "Venta #00123 anulada"; resaltar la fila afectada.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-29 — Celular: la fila de venta esconde hora y cantidad; no hay "anular la última" desde el POS 🟡
- **Pantalla / flujo:** Movimientos y Vender, flujos 13 y 14.
- **Evidencia:** `app/dashboard/movimientos/page.tsx:434-440` (la hora y las "uds" van con `hidden … sm:flex` / `sm:block`: en 375 px la fila solo muestra #número y total), `:553-581` (4 tarjetas antes de la lista), `:743-767` (el bloque de movimientos de dinero va antes de las ventas); `components/pos/CheckoutSection.tsx:302-311` (la tarjeta "Última venta" no tiene acciones).
- **Qué vive la usuaria:** acaba de cobrar y ve que se equivocó. Va a Movimientos, baja por 4 tarjetas y por los movimientos de dinero, y entre filas que solo dicen "#00042 $3.50" debe adivinar cuál es la de hace una hora. En el celular no distingue por hora.
- **Recomendación:** en celular mostrar la hora y "N productos" en una segunda línea de la fila; la lista de ventas arriba de las tarjetas para la cajera; y en la tarjeta "Última venta" de Vender un enlace "Me equivoqué → Anular o devolver" que lleve a esa venta (`/dashboard/movimientos?venta=ID`).
- **Esfuerzo:** M
- **Confianza:** Probable (hora oculta: confirmado en código; ver en vivo la distancia de scroll).

### CAJ-30 — Hay que teclear la cantidad de cada línea; el reembolso se calcula en pantalla 🟡
- **Pantalla / flujo:** Devolución, flujo 13.
- **Evidencia:** `components/movimientos/DevolucionDialog.tsx:441-453` (campo vacío por línea, sin botón "todo"), `:368-373` (`precioUnit = subtotal / cantidad`; el total a reembolsar se calcula en el cliente), `:459-460` ("Reingresar" / "Merma").
- **Qué vive la usuaria:** el cliente devuelve una lata de una venta de 3: teclea 1. Si devuelve toda la venta, debe teclear en cada línea. El "Total a reembolsar" puede diferir en centavos de lo que registra el servidor (prorrateo, NEG-10) y ella entrega el dinero antes de saberlo.
- **Recomendación:** botón "Todo" por línea (y "Devolver toda la venta"); mostrar la cifra definitiva que devuelva el servidor al terminar (CAJ-28); cambiar "Reingresar" por "Vuelve al estante" y "Merma" por "Se pierde".
- **Esfuerzo:** M
- **Confianza:** Probable.

### CAJ-31 — "Anular" desaparece en turnos cerrados sin explicar; textos con jerga ⚪
- **Pantalla / flujo:** Movimientos.
- **Evidencia:** `app/dashboard/movimientos/page.tsx:486-500` (el botón solo aparece con `turnoAbierto` y sin devoluciones; el mensaje "Ya tiene devoluciones" solo sale si el turno está abierto), `:814` ("restará el dinero del balance de la caja… irreversible"), `:831` (relleno rojo propio en lugar de la variante `destructive`).
- **Qué vive la usuaria:** quiere anular la venta de ayer y solo ve "Devolver", sin saber por qué.
- **Recomendación:** en turnos cerrados, texto "Esta venta es de un turno ya cerrado: no se puede anular, solo devolver"; el aviso de anular: "Se devuelve el producto al inventario y se quita el dinero de la gaveta."
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### Flujo 15 — Merma

### CAJ-32 — Pide "lote #", exige un motivo que repite lo ya elegido y no dice la unidad 🟡
- **Pantalla / flujo:** Merma, flujo 15.
- **Evidencia:** `components/inventario/AjusteInventarioDialog.tsx:183-198` (con más de un lote, el select "Lote #12 · quedan 30"), `:99-102` y `:243-253` (motivo obligatorio para la cajera), `:208-222` ("Cantidad a descontar" sin unidad), `:201-203` ("uds").
- **Qué vive la usuaria:** "se rompió un huevo": además de elegir "Quebrado / roto", tiene que escribir una frase y, si hay dos lotes, escoger un número de lote que no conoce. En un producto con presentaciones (cartón) no queda claro si "1" es un huevo o un cartón.
- **Recomendación:** para la cajera, tomar el lote más antiguo sin preguntar (ya es la regla FIFO); precargar el motivo con el tipo elegido ("Quebrado / roto") y dejarlo editable (cumple "motivo obligatorio" sin escribir); etiquetar la cantidad con la unidad base ("unidades sueltas").
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### Flujo 17 — Cerrar sesión

### CAJ-33 — Un toque en el ícono de salir borra el ticket en curso, sin preguntar 🟡
- **Pantalla / flujo:** Cerrar sesión, flujo 17.
- **Evidencia:** `hooks/useLogout.ts:18-22` (`Cookies.remove(...)` y `clearCart()`), `components/nav/sidebar.tsx:77-84` (ícono de 36 px pegado al interruptor de tema, un toque), `components/nav/user-menu.tsx:48-55`.
- **Qué vive la usuaria:** en la laptop, un clic mal dado en el ícono de salir (a un lado del de tema) pierde un ticket de 12 productos. En el celular son 2 toques.
- **Recomendación:** si hay productos en el ticket, preguntar "Tienes un ticket sin cobrar con 4 productos. Si cierras sesión se pierde." con "Seguir aquí" (principal) y "Cerrar sesión y borrar"; sin ticket, salir directo. En el sidebar, texto "Salir" junto al ícono.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### Transversales

### CAJ-34 — Sidebar mezcla "Cajero · POS" con "Cajera" ⚪
- **Pantalla / flujo:** Navegación, escritorio.
- **Evidencia:** `components/nav/sidebar.tsx:35` ("Cajero · POS" / "Administrador"), `:72` y `lib/roles.ts:4-5` ("Cajera", "Dueña (administradora)").
- **Qué vive la usuaria:** la misma barra dice "Cajero" arriba y "Cajera" abajo; "POS" no es palabra de tienda (UX-23 persiste en esto).
- **Recomendación:** usar `etiquetaRol(user?.rol)` en ambos lugares y quitar "POS".
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-35 — Jerga que sobra: "turno de caja", "Procesar pago", "balance", "Reingresar" ⚪
- **Pantalla / flujo:** Vender, Movimientos.
- **Evidencia:** `app/dashboard/pos/page.tsx:623` ("Debes abrir un turno de caja antes de vender"), `:818` ("Cerrar turno de caja"), `components/pos/AbrirCajaDialog.tsx:155`, `CheckoutSection.tsx:455` ("Procesar pago"), `movimientos/page.tsx:814` ("balance de la caja"), `DevolucionDialog.tsx:459` ("Reingresar"), `AjusteInventarioDialog.tsx:193` ("Lote #").
- **Qué vive la usuaria:** el glosario (`lib/glosario.ts`) fija "Gaveta"/"Bóveda", pero quedan palabras de sistema: "turno", "procesar", "balance", "reingresar". Es un tema de tono, no de bloqueo.
- **Recomendación:** "Abre la caja para empezar a vender", "Cerrar caja", "Cobrar", "se quita el dinero de la gaveta", "Vuelve al estante".
- **Esfuerzo:** S
- **Confianza:** Confirmado en código.

### CAJ-36 — Detalles: asa de la hoja que no se arrastra, parpadeo sin usuario, ticket en dos pestañas ⚪
- **Pantalla / flujo:** Navegación y Vender.
- **Evidencia:** `components/ui/bottom-sheet.tsx:36-37` (asa dibujada; la hoja usa el diálogo de Radix, sin gesto de arrastre), `hooks/useCurrentUser.ts:23-34` (el usuario se lee en un efecto: en el primer render `getNavItems(null)` devuelve vacío y `BottomNav` es `null`, `components/nav/bottom-nav.tsx:18`), `src/store/cartStore.ts:121-125` (`persist` sin escuchar el evento `storage`), `bottom-nav.tsx:35` (texto de 11 px).
- **Qué vive la usuaria:** intenta arrastrar la hoja para cerrarla y no pasa nada; al entrar, la barra de abajo aparece un instante después; con dos pestañas abiertas, cada una muestra su ticket y gana la última que escribe; las etiquetas de la barra son de 11 px.
- **Recomendación:** quitar el asa o implementar el gesto; leer la cookie de usuario en el estado inicial (o `useSyncExternalStore`) para que la barra no parpadee; sincronizar el ticket entre pestañas con `storage` o avisar; subir la etiqueta a 12 px.
- **Esfuerzo:** S
- **Confianza:** Hipótesis: ver en vivo (arrastre y parpadeo); lo demás confirmado en código.

---

## 6. Lo que está bien y hay que conservar

- **Pantalla Vender (escritorio):** catálogo a la izquierda y ticket con cobro fijo a la derecha; el cobro siempre visible, sin scroll. Es el layout correcto.
- **Total grande y cambio grande** (`text-4xl`, `text-2xl` verde) con "Falta" en rojo, billetes rápidos, "Exacto" y la tarjeta persistente "Última venta · Cambio". Es justo lo que la cajera mira.
- **Cantidades decimales y por monto** con atajos y el "≈ 0.4 libra" explicativo; el servidor decide la cantidad y el subtotal exacto.
- **Clave de idempotencia por intento de cobro** y botón deshabilitado mientras procesa: el doble toque no duplica.
- **Ticket persistente** (`tienda-carrito`) con almacenamiento a prueba de fallos y migración de versión.
- **Vender y avisar:** sin stock registrado se vende igual y se avisa; alta rápida en dos toques con el nombre o el código ya puestos.
- **Apertura de caja:** remanente propuesto, diferencia con botones de un toque y "No sé" ya marcado; nunca bloquea.
- **Cierre de caja:** diferencia en vivo ("Cuadra / Sobran / Faltan"), el botón explica qué falta y la etiqueta pasa a "obligatorio" solo cuando corresponde.
- **Sacar dinero:** solo las 2 opciones de la cajera, frase "Vas a sacar $X…" y botón "Confirmar $X".
- **Menú de usuario en celular** con nombre, rol y "Cerrar sesión"; barra inferior de 3 pestañas.
- **Errores de red con un texto útil** y un `ApiError` tipado (`red`, `sesion`, `permiso`…); "Sin conexión · Reintentar" en el encabezado en lugar de un falso "Caja cerrada".
- **Dialogos con `<form>`:** Enter confirma, Escape cancela, `autoFocus` en el primer campo; objetivos táctiles de 44 px en celular y `aria-label` en los íconos.
- **Búsqueda sin acentos y Enter** con un resultado o código exacto.
- **Merma:** motivo, error dentro del diálogo y mensaje de éxito con la cantidad y el producto.

## 7. Top 10: mayor impacto con menor esfuerzo

| # | ID | Qué hacer | Esfuerzo | Por qué primero |
|---|---|---|---|---|
| 1 | CAJ-20 | Guardar la clave de idempotencia en `sessionStorage` y decir "mira en Movimientos antes de repetir" | S | Evita ventas duplicadas |
| 2 | CAJ-19 | Limpiar "Paga con" al vaciar el ticket | S | Cambio falso, un renglón de código |
| 3 | CAJ-07 | Tope de dígitos en Cantidad y "Paga con" + `blur` con Enter | S–M | Un escaneo mal ubicado destruye el ticket |
| 4 | CAJ-04 | Aviso con el resultado del cierre ("Cuadró · fondo de mañana $X") | S | La cajera hoy no sabe si cerró |
| 5 | CAJ-21 / CAJ-18 | Pie fijo "Cobrar $X" en la hoja del celular y el error junto al botón | M | La acción principal al alcance del pulgar |
| 6 | CAJ-15 | "Quitaste X · Deshacer" y que "−" pare en 1 | S | Frecuente en cada venta |
| 7 | CAJ-27 / CAJ-28 | Error dentro del diálogo al anular y avisos de éxito en anular/devolver | S | Hoy la pantalla se pierde o calla |
| 8 | CAJ-09 | Limpiar la búsqueda al tocar, botón ✕, quitar el ícono de escáner falso | S | Menos toques en la venta a mano |
| 9 | CAJ-11 | Enter en "Paga con" cobra y `/` enfoca el buscador | S–M | Laptop sin mouse |
| 10 | CAJ-33 | Preguntar antes de cerrar sesión con un ticket en curso | S | Pérdida de ticket de un toque |

Siguientes, aún baratos: CAJ-12 (duplicados por categoría), CAJ-23 (modo apagón persistente), CAJ-03 (explicar la sesión vencida), CAJ-24 (un solo nombre para el modo apagón), CAJ-01 (teclado del login en celular).
