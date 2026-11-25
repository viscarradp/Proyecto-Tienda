# Auditoría integral de UX/UI — 2026-11-25

> **Informe congelado.** El estado vivo de cada corrección se lleva en `docs/roadmap/` (backlog, §5).
> Detalle completo, con evidencia `archivo:línea`, recorridos con conteo de toques e inventario de controles por pantalla,
> en [`2026-11-25-ux-ui/`](2026-11-25-ux-ui/).

## 1. Cómo se hizo

Cuatro miradas independientes sobre la misma app (frontend en `master` 2e4d24f, después del pulido de entrega):

| Informe | Rol | Qué revisó | Hallazgos |
|---|---|---|---|
| [01-cajera.md](2026-11-25-ux-ui/01-cajera.md) | Especialista en punto de venta | 19 flujos del mostrador con conteo de toques; controles de Vender, cobro, caja, devolver, mermas | 36 (🔴 2 · 🟡 24 · ⚪ 10) |
| [02-duena.md](2026-11-25-ux-ui/02-duena.md) | Especialista en herramientas de gestión para no contadores | 14 tareas de la dueña; arquitectura de la información; comprensión de cada cifra | 43 (🔴 3 · 🟡 30 · ⚪ 10) |
| [03-diseno-visual.md](2026-11-25-ux-ui/03-diseno-visual.md) | Diseño de interfaces y accesibilidad | Sistema de diseño real, jerarquía por pantalla, estados de interacción, responsive, accesibilidad, lenguaje | 43 (🔴 2 · 🟡 21 · ⚪ 20) |
| [04-recorrido-en-vivo.md](2026-11-25-ux-ui/04-recorrido-en-vivo.md) | Líder, en el navegador | Todas las pantallas en 1280 y 375 px, tema oscuro y claro, como dueña y como cajera | 21 (🟡 7 · ⚪ 14) |

Los tres primeros leyeron el código (solo lectura); el líder confirmó en el navegador lo marcado "ver en vivo" y verificó
cada 🔴 antes de consolidar. Varios hallazgos se repiten entre informes (el mismo problema visto desde la cajera, la dueña
y el diseño): abajo van agrupados por tema con todos sus IDs.

**Total: 143 hallazgos, 6 🔴 tras la verificación** (DUE-01 bajó a 🟡: la base guarda el costo con 4 decimales; el problema
es la carga en pantalla, no el dinero guardado).

## 2. Resumen ejecutivo

- **La base es buena.** Las decisiones grandes (vender y avisar, registrar y avisar, anular sin borrar, una gaveta, glosario
  Gaveta/Bóveda, "Este mes ganaste") se sienten en la pantalla y hay que conservarlas (§6).
- **Lo urgente es el dinero en el mostrador:** dos caminos pueden registrar mal una venta (cobro duplicado tras recargar;
  escaneo que escribe el código en la cantidad o en "Paga con") y otros tres dan un cambio o un total falso.
- **En el celular, la acción principal no siempre está al alcance:** el cobro queda al fondo de la hoja del ticket, los
  diálogos largos esconden su botón detrás del teclado y el encabezado se come un tercio de la pantalla.
- **La dueña ve números en los que todavía no puede confiar del todo:** la ganancia se infla sin aviso cuando se vendió
  sin costo; un aporte a la gaveta se rotula "en la bóveda"; hay dos cifras de "vendido"; el cierre de turno no muestra lo
  esperado ni la explicación de la cajera.
- **El sistema visual está a medio camino:** botones coloreados a mano, `destructive` pálido, cuatro estilos de tarjeta de
  cifra, contraste insuficiente del verde y el rojo en el tema claro, y nombres que cambian entre pantallas (Caja, Gaveta,
  Turno; Administrador, Administradora, Dueña).

## 3. Los 6 🔴 (verificados)

| ID | Qué pasa | Verificación |
|---|---|---|
| **CAJ-20** | Si se pierde la respuesta del cobro y la cajera recarga, el ticket sobrevive (se guarda en `localStorage`) pero la clave de idempotencia no (vive en un `useRef`): el segundo "Procesar pago" registra **otra venta**. | Confirmado en código: `src/store/cartStore.ts` (persist) y `pos/page.tsx:167,312`. |
| **CAJ-07** | Con el cursor en "Cantidad" o "Paga con", el lector de barras escribe el código en ese campo (el gancho del escáner se apaga si hay un input enfocado y los campos no limitan dígitos): cantidad 7401000000011 o un cambio absurdo. | Confirmado en código: `hooks/useBarcodeScanner.ts:29-37`. |
| **VIS-28** | Los diálogos no tienen altura máxima ni scroll: "Cerrar caja" mide 560 px y "Confirmar cierre" queda a 670 px; con el teclado del celular abierto solo se ven ~512 px. | **Confirmado en vivo** (375×812). `components/ui/dialog.tsx`. |
| **VIS-01** | Los avisos de una compra ("registrar y avisar") usan `text-warning-foreground` (casi negro) sobre fondo ámbar tenue: ilegibles en el tema oscuro, que es el de por defecto. | Confirmado en código: `CompraForm.tsx:285`, `globals.css:135`. |
| **DUE-02** | El diálogo de compra e inventario inicial se cierra con Esc o un clic afuera y **pierde todas las líneas** escritas. | **Confirmado en vivo** (Esc lo cerró en el recorrido). `inventario/page.tsx:871`. |
| **DUE-27** | Lo vendido sin stock registrado o de un producto "por revisar" entra con costo $0 hasta la siguiente compra: la ganancia sale inflada y Estadísticas no avisa. | Confirmado: `common/pendientes-stock.ts` (costo estimado) y ningún aviso en `stats/page.tsx`. |

## 4. Hallazgos por tema (con todos sus IDs)

### T1 · Cobrar sin errores de dinero 🔴
CAJ-20 cobro duplicado tras recargar · CAJ-07 escaneo en un campo · CAJ-19 "Paga con" sobrevive a "Vaciar" y falsea el
cambio · CAJ-16 precio congelado en el ticket guardado · CAJ-23 recargar apaga el modo apagón y la venta del cuaderno
queda con la hora de ahora · CAJ-33 cerrar sesión borra el ticket sin preguntar · CAJ-08 umbral del escáner y agrega con
caja cerrada.

### T2 · El mostrador en el celular
CAJ-18 / VIS-18 "Procesar pago" al fondo de la hoja, sin el total · CAJ-21 el error de cobro sale arriba, fuera de vista ·
CAJ-13 / VIS-17 tocar un producto no se nota y el encabezado se come la pantalla · CAJ-14 cada línea del ticket ocupa 3
filas · CAJ-15 quitar una línea no se deshace · VIV-19 nombres truncados · CAJ-26 botón "Sacar" · CAJ-17 avisos apilados
tapan el cambio · VIS-27 tres avisos tras una venta.

### T3 · Diálogos y formularios que esconden o pierden lo escrito 🔴
VIS-28 diálogo sin scroll · DUE-02 compra se pierde · DUE-03 los avisos de la compra no llegan a verse · VIS-01 aviso
ilegible · VIS-24 errores de campo no se marcan ni se anuncian · VIS-25 botones deshabilitados sin decir por qué · CAJ-06
validaciones del cierre por toast · DUE-20 / DUE-26 errores que salen detrás del diálogo.

### T4 · Abrir, cerrar y forzar la caja
CAJ-04 el cierre no muestra resultado y "reabrir automáticamente" lo vuelve invisible · VIV-02 "Cerrar forzado" ofrecido en
el turno activo de hoy · DUE-21 el turno cerrado no muestra esperado, vendido ni la explicación de la cajera · CAJ-05 la
respuesta tardía del último cierre pisa lo escrito · CAJ-25 un "Sacar dinero" mal digitado no se puede corregir · CAJ-31 /
DUE-15 "Anular" desaparece sin explicar.

### T5 · Feedback de cada acción
CAJ-27 un error al anular borra la lista (persiste UX-13) · CAJ-28 anular y devolver terminan en silencio (persiste UX-14) ·
DUE-11 cada acción de Inventario recarga todo · DUE-18 si fallan las deudas, la sección desaparece · VIS-26 cuatro patrones
de "cargando".

### T6 · Números en los que la dueña pueda confiar 🔴
DUE-27 ganancia inflada por costo $0 · VIV-01 aporte a la gaveta rotulado "en la bóveda" · DUE-30 / VIV-15 dos cifras de
"vendido" · DUE-31 "Faltó en la gaveta" incluye la bóveda · VIS-19 la ganancia repetida tres veces · VIV-13 "0 anuladas" en
rojo y un ratio en la cascada de dinero · VIV-14 / DUE-35 tarjeta huérfana y "Equipo $0" en verde · DUE-34 / VIS-06 tres
umbrales de "buen margen" · DUE-23 / VIV-16 "Ingresos de los turnos mostrados", "Desc.", "op." · VIV-03 / DUE-07 "4.428 uds"
en productos por libra · DUE-28 "perdiste" sin comparación · DUE-33 no se ve qué productos no dejan.

### T7 · "¿Dónde está mi dinero?" y la navegación de la dueña
DUE-32 el dinero repartido en tres bloques y las deudas afuera · DUE-24 la bóveda no tiene libro en pantalla · DUE-17 /
VIS-20 deudas enterradas al fondo de Gastos · DUE-36 la dueña aterriza en Vender · DUE-37 nombres del menú · VIS-33 /
DUE-38 seis pestañas en la barra inferior de 375 px · DUE-29 el aviso de bóveda inicial empuja la respuesta principal.

### T8 · Inventario y compras
DUE-01 costo por unidad base y `step=0.01` (hay que dividir la factura a mano) · DUE-04 cargar muchos productos · DUE-09
cambiar el precio sin ver el costo ni el margen · DUE-10 revisar "por revisar" cuesta 5–6 toques · DUE-12 historial de
compras sin buscador · DUE-13 / VIV-20 crear producto no dice cómo entra el stock · VIV-07 el catálogo no muestra precios ·
VIV-08 / VIV-09 / VIV-10 subtítulo, "Por revisar" duplicado y jerga de lotes · DUE-06 / VIS-12 / VIV-11 botones solo ícono ·
VIS-14 muro de botones en el producto abierto · DUE-14 "Desactivar" que a veces borra · CAJ-32 la merma pide "lote #".

### T9 · Sistema visual
VIS-03 botones coloreados a mano · VIS-04 `destructive` pálido · VIS-05 el color no significa siempre lo mismo · VIV-06 /
VIS-02 contraste del verde (3.7:1) y el rojo (4.4:1) en el tema claro · VIS-08 fondo de diálogo casi invisible · VIS-09
texto de 10–11 px · VIS-10 títulos de sección en tres estilos · VIS-11 cuatro tarjetas de cifra · VIS-13 alturas
mezcladas · VIS-15 pies de diálogo en tres estilos · VIS-07 tema oscuro por defecto que ignora el del sistema.

### T10 · Responsive y accesibilidad
VIS-29 / VIS-30 / VIS-31 / VIS-32 el rango 640–1130 px (tablet y laptop chica) mezcla patrones · VIV-04 "Historial" se cae
de línea · VIV-05 tarjetas que empujan la tarea fuera de la pantalla · VIS-34 / VIS-35 encabezado desalineado y tabla con
scroll horizontal · VIS-23 foco no visible en cantidad · VIS-16 objetivos táctiles chicos · VIS-36 dos `h1` y sin
`aria-current` · VIS-37 sin `prefers-reduced-motion`.

### T11 · Lenguaje
VIS-38 Caja / Gaveta / Turno · VIS-39 / DUE-42 / CAJ-35 jerga (lote, múltiplo, descuadre, declarado, capital, balance,
"Procesar pago", "Reingresar") · VIS-40 / VIV-18 títulos distintos del menú y botones que no dicen qué · CAJ-34 / VIV-17 /
DUE-39 "Administrador", "Administradora", "Cajero · POS", "Dueña" · VIS-41 / VIS-43 / DUE-43 tres formatos de dinero y de
fecha · VIS-42 "contacta soporte", "Haz clic" · CAJ-24 tres nombres para el modo apagón.

### T12 · Productividad con teclado y escáner
CAJ-09 la búsqueda no se limpia y el ícono de escáner no es botón · CAJ-10 Enter solo agrega con un resultado · CAJ-11 sin
atajos; Enter en "Paga con" no cobra · CAJ-12 "Agregar como nuevo" aunque exista en otra categoría · CAJ-29 / CAJ-30
devolver y anular la última desde el POS · CAJ-22 falta el billete de $50.

### T13 · Sesión y usuarios
CAJ-01 el usuario se autocapitaliza en el celular y no hay "ver contraseña" · CAJ-03 sesión vencida sin explicación
(persiste UX-25) · DUE-40 crear a la cajera no confirma la contraseña · DUE-41 la dueña puede quitarse el rol a sí misma ·
DUE-19 en Gastos, "Gaveta" por defecto aunque no haya turno · DUE-16 gastos del mes por categoría.

## 5. Plan propuesto (olas)

Cada ola sigue la forma de trabajo de siempre (subagentes en Sonnet con archivos sin cruzar, revisión, navegador, merge).
Las olas 1–5 son correcciones; la 6 necesita decisiones de producto; las funciones nuevas esperan al uso real.

| Ola | Contenido | Hallazgos | Tamaño |
|---|---|---|---|
| **1 · Cobro y diálogos seguros** | Clave de idempotencia en `sessionStorage`; escaneo con un campo enfocado; limpiar "Paga con"; precio del ticket guardado; modo apagón persistente; confirmar antes de cerrar sesión con ticket; diálogos con altura máxima y pie fijo; compra que no se pierde y muestra sus avisos; aviso legible | CAJ-20, CAJ-07, CAJ-19, CAJ-16, CAJ-23, CAJ-33, VIS-28, VIS-01, DUE-02, DUE-03 | S–M · 2 subagentes |
| **2 · Mostrador en el celular** | Pie fijo "Cobrar $X" con el error al lado; líneas de ticket compactas y deshacer; encabezado que no se come la pantalla; resultado del cierre; "Cerrar forzado" solo en turnos viejos; feedback al anular y devolver | CAJ-18/VIS-18, CAJ-21, CAJ-13/VIS-17, CAJ-14, CAJ-15, VIV-19, CAJ-04, VIV-02, CAJ-27, CAJ-28, CAJ-17, VIS-27 | M · 2 subagentes |
| **3 · Números confiables** | Aviso "ventas sin costo registrado"; rótulos por cuenta destino; una sola cifra de "vendido"; cascada limpia; un umbral de margen; turno cerrado con esperado, vendido y explicación; unidades reales en productos por peso | DUE-27, VIV-01, DUE-30/VIV-15, DUE-31, VIS-19, VIV-13, VIV-14/DUE-35, DUE-34/VIS-06, DUE-23/VIV-16, DUE-21, VIV-03/DUE-07 | M · backend chico + frontend |
| **4 · Sistema visual y lenguaje** | Tokens de contraste del tema claro; variantes de botón (sin colores a mano, `destructive` sólido); una tarjeta de cifra; títulos y pies de diálogo; un glosario aplicado en todas las pantallas; errores de campo marcados | VIV-06/VIS-02, VIS-03, VIS-04, VIS-05, VIS-08–11, VIS-13, VIS-15, VIS-24, VIS-25, T11 completo | M · 2 subagentes |
| **5 · Responsive, accesibilidad e inventario cómodo** | Rango tablet; pestañas de Inventario; tarjetas compactas en móvil; foco visible; precio en el catálogo; compra con costo por presentación; textos de crear producto y compra | VIS-29–37, VIV-04, VIV-05, VIS-23, VIS-16, DUE-01, VIV-07, VIV-08–10, DUE-13/VIV-20, DUE-06/VIS-12/VIV-11, VIS-14, CAJ-32 | M · 2 subagentes |
| **6 · La casa de la dueña** (requiere decidir) | Dónde aterriza la dueña; nombres del menú; "Mi dinero" en un solo lugar con deudas y libro de bóveda; menú inferior de 4 + "Más" | DUE-36, DUE-37, DUE-32, DUE-24, DUE-17/VIS-20, VIS-33/DUE-38, DUE-29 | M–L |
| Después del uso real | Contar inventario, "qué comprar", comparación con el mes anterior, gastos por categoría, productos que no dejan | DUE-05, DUE-08, DUE-28, DUE-16, DUE-33 (se cruzan con D-07…D-14) | L |

**Decisiones para la ola 6** (propuesta del informe de la dueña, §3.4 de `02-duena.md`):
1. ¿La dueña aterriza en Estadísticas en vez de Vender? (recomendado: sí; la cajera sigue en Vender).
2. ¿Renombrar el menú? Estadísticas → "Mi negocio", Movimientos → "Ventas y turnos", Gastos → "Gastos y deudas".
3. ¿Opción mínima (reordenar Estadísticas y subir Deudas) u opción completa (una pantalla "Dinero")?
4. ¿Menú inferior de la dueña con 4 pestañas + "Más"?

## 6. Lo que está bien y hay que conservar

- "Este mes ganaste $X (de $Y vendidos)": responde la pregunta principal en una línea.
- Vender y avisar: "Sin stock registrado · vendido sin registrar" en la fila, sin bloquear.
- El ticket de escritorio con total grande, billetes rápidos y "Falta".
- Anular sin borrar: tachado con motivo y autor ("Era $6, no $60 — admin").
- El glosario Gaveta / Bóveda y "Sacar dinero" con cuatro opciones claras.
- Usuarios: "se desactivan, no se borran", con la explicación en pantalla.
- La cajera ve solo lo suyo (Vender, Inventario, Movimientos) y el 403 dice "Esto lo hace la dueña".
- L14 sigue en pie: etiquetas asociadas, botones de ícono con nombre, objetivos de 44 px en lo principal.
- Avisos del pulido de entrega: abajo y sin tapar la barra del cobro en el celular.
