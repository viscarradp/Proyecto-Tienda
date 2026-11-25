# Auditoría UX/UI 03 — Diseño visual, sistema de componentes e interacción

Fecha: 2026-11-25 · Alcance: `erp-tienda-frontend/` (solo lectura, sin servidores ni pruebas) · IDs `VIS-01…VIS-43`.

Lo que dice "Hipótesis: ver en vivo" lo calculé a partir de clases y tokens, pero hay que mirarlo en pantalla. Los cálculos de ancho (columnas fijas contra el ancho disponible) son aritmética sobre el código, no capturas.

## 1. Resumen

1. El sistema de color es limpio (cero hex y cero `text-red-500` en `app/` y `components/`; todo sale de tokens). Los problemas están en el **significado** del color y en tres combinaciones que casi no se leen.
2. Lo que más hace ver la app "hecha en casa": botones coloreados a mano con `className`, tres o cuatro tarjetas de cifra distintas, cuatro formas de mostrar "cargando", y alturas de botón que cambian de pantalla en pantalla (96 sobrescrituras de `h-11 md:h-11`).
3. Los dos hallazgos 🔴 son técnicos y baratos: un aviso ámbar **ilegible en tema oscuro** (el tema por defecto) y diálogos **sin altura máxima**, que en celular dejan el botón de confirmar fuera de alcance (cierre de caja).
4. El rango 768–1130 px (tablet y laptop chica) es donde el POS y Inventario se rompen: el nombre del producto se queda sin ancho porque el menú lateral aparece en `md` pero el contenido sigue usando patrones de celular o columnas fijas.
5. L14 sigue en pie en lo esencial (labels con `htmlFor`: 0 sin asociar; íconos con nombre; objetivos táctiles por defecto h-11). Persisten dos restos de UX-26 (botones de Inventario sin nombre) y de UX-29 (feedback triple al vender).

| ID | Pantalla | Título | Sev. | Esfuerzo |
|---|---|---|---|---|
| VIS-01 | Compras (Inventario) | Aviso ámbar ilegible en tema oscuro | 🔴 | S |
| VIS-02 | Transversal | Contraste por verificar: primario oscuro, verde y rojo como texto | 🟡 | M |
| VIS-03 | Vender, Inventario, Movimientos | Botones de acción coloreados a mano (ámbar, verde, rojo sólido) | 🟡 | M |
| VIS-04 | Transversal | `destructive` es un tinte pálido: la confirmación pesa igual que Cancelar | 🟡 | S |
| VIS-05 | Gastos, Vender, Movimientos, Estadísticas | El color no significa siempre lo mismo | 🟡 | M |
| VIS-06 | Estadísticas | Tres umbrales distintos de "buen margen" | 🟡 | S |
| VIS-07 | Transversal | Tema oscuro por defecto e ignora el del sistema | ⚪ | S |
| VIS-08 | Diálogos | Fondo atenuado casi invisible (`bg-black/10`) | ⚪ | S |
| VIS-09 | Vender, Estadísticas, Inventario | Texto de 10 y 11 px en datos que la cajera necesita | 🟡 | S |
| VIS-10 | Estadísticas, Gastos, Inventario | Títulos de sección con tres estilos y saltos de nivel | ⚪ | S |
| VIS-11 | Movimientos, Gastos, Estadísticas | Cuatro tarjetas de cifra distintas | ⚪ | M |
| VIS-12 | Inventario | Dos botones del encabezado sin nombre bajo `lg` (persiste UX-26) | 🟡 | S |
| VIS-13 | Transversal | `h-11 md:h-11` repetido 96 veces: alturas de escritorio mezcladas | 🟡 | M |
| VIS-14 | Inventario | Muro de botones `outline` en el producto abierto | 🟡 | S |
| VIS-15 | Diálogos | Cancelar y pies de diálogo en tres estilos | ⚪ | S |
| VIS-16 | Gastos, Vender | Objetivos táctiles chicos que quedaron | ⚪ | S |
| VIS-17 | Vender (celular) | Encabezado pegajoso se come un tercio de la pantalla | 🟡 | M |
| VIS-18 | Vender (celular) | El cobro queda al final del scroll en la hoja del ticket | 🟡 | M |
| VIS-19 | Estadísticas | La ganancia se repite tres veces y hay 8 bloques al mismo nivel | 🟡 | M |
| VIS-20 | Gastos | Las deudas con proveedores quedan enterradas bajo el formulario | ⚪ | S |
| VIS-21 | Movimientos | Tarjetas de arriba con jerga y poco valor | ⚪ | S |
| VIS-22 | Login, Usuarios | Pulido de jerarquía | ⚪ | S |
| VIS-23 | Vender | Campo de cantidad sin foco visible real; botones crudos sin estilo de foco | 🟡 | S |
| VIS-24 | Formularios | Errores de campo: casi nada marca el campo ni se anuncia | 🟡 | M |
| VIS-25 | Diálogos | Botones `disabled` sin decir por qué | ⚪ | S |
| VIS-26 | Transversal | Cuatro patrones de "cargando" | ⚪ | M |
| VIS-27 | Vender | Tres avisos a la vez tras una venta (persiste UX-29) | ⚪ | S |
| VIS-28 | Diálogos | Diálogos sin altura máxima: el botón queda fuera de la pantalla | 🔴 | S |
| VIS-29 | Vender (1024–1130 px) | El nombre del producto se queda sin ancho | 🟡 | S |
| VIS-30 | Vender (768–1023 px) | Barra del carrito flotando y bajo el menú lateral | 🟡 | S |
| VIS-31 | Inventario (640–900 px) | La tabla de productos aplasta el nombre | 🟡 | S |
| VIS-32 | Estadísticas (768–1023 px) | Tarjetas de cifras demasiado angostas | 🟡 | S |
| VIS-33 | Menú inferior (dueña en celular) | Seis pestañas: los nombres se cortan | 🟡 | S |
| VIS-34 | Transversal | Encabezado desalineado con el contenido, `vh` y avisos entre 600 y 1023 px | ⚪ | S |
| VIS-35 | Estadísticas (celular) | Tabla de 6 columnas con scroll horizontal | ⚪ | S |
| VIS-36 | Transversal | Dos `h1`, menú lateral sin `aria-current`, mismo título de pestaña | ⚪ | S |
| VIS-37 | Transversal | Sin `prefers-reduced-motion`; barra del carrito pisa su nombre visible | ⚪ | S |
| VIS-38 | Vender, Movimientos, Gastos | "Caja", "Gaveta" y "Turno" mezclados | 🟡 | S |
| VIS-39 | Movimientos, Compras, Login | Jerga contable y de sistema en pantalla | 🟡 | S |
| VIS-40 | Menú y títulos | Nombre del menú distinto del título de la pantalla; "Procesar pago" | ⚪ | S |
| VIS-41 | Transversal | Abreviaturas y unidades escritas de varias formas | ⚪ | S |
| VIS-42 | Errores y ayudas | "contacta soporte", "Haz clic", dueño/dueña | ⚪ | S |
| VIS-43 | Transversal | Tres formatos de dinero y tres de fecha | ⚪ | S |

Conteo: 🔴 2 · 🟡 21 · ⚪ 20 (total 43).

---

## 2. Sistema de diseño real (lo que de verdad se usa)

### 2.1 Color

Tokens en `app/globals.css` (oklch), claro `:root` (líneas 56-110) y oscuro `.dark` (112-160). Familias: superficie (`background`, `card`, `popover`, `muted`, `secondary`, `accent`), acción (`primary` azul), semánticos (`success` verde, `warning` ámbar con `warning-text` aparte para texto, `destructive` rojo), `chart-1..5`, `sidebar-*`.

- **Sin colores sueltos.** Búsqueda de `text|bg|border-(red|green|amber|blue…)-NNN` y de hex en `app/` y `components/`: solo `bg-black/10` del overlay del diálogo (`components/ui/dialog.tsx:42`) y `bg-black` en `app/icon.tsx`. Esto está muy bien.
- **Asimetría de tokens de texto:** existe `warning-text` (texto ámbar oscuro en claro) pero no `success-text` ni `destructive-text`. El verde y el rojo se usan como texto en `text-xs`/`text-sm` con los mismos valores que como fondo (ver VIS-02).
- **`--warning-foreground`** es "texto sobre fondo ámbar sólido" (`oklch(0.205)` claro / `oklch(0.16)` oscuro). Se usa mal como texto sobre un tinte (VIS-01).
- **Significado real hoy:** verde = sobró/cuadra/ganancia/abierta/stock/éxito; rojo = error, faltó, pérdida, agotado, **y también** cualquier gasto y el "Falta" al cobrar; ámbar = aviso, "sin stock registrado", "por revisar", **y también** costos y "cierre declarado" (datos normales); azul `primary` = acción, selección, y datos neutros ("Vendido", "Compra promedio"). Ver VIS-05.

### 2.2 Tipografía

Fuente Geist Sans y Geist Mono (`app/layout.tsx`). Mono con `tabular-nums` para dinero (`MoneyValue`), buena decisión.

Escala real (conteo de clases en `app/` + `components/`, fuera de `ui/` no incluido aparte): `text-xs` 232, `text-sm` 164, `text-lg` 23, `text-xl` 17, `text-base` 16, `text-2xl` 7, `text-3xl` 6, `text-[10px]` 6, `text-[11px]` 4, `text-4xl` 1. Son **10 tamaños**, de los cuales dos son valores arbitrarios por debajo de 12 px.

| Rol | Cómo está hoy |
|---|---|
| Título de página | `text-lg font-semibold tracking-tight lg:text-xl` en las 6 pantallas (consistente). |
| Subtítulo de página | `text-xs text-muted-foreground` (consistente). |
| Título de sección | `font-semibold` (16 px, Gastos), `text-sm font-semibold` (Inventario), `text-sm font-semibold text-muted-foreground` (Estadísticas). Tres estilos. |
| Título de tarjeta de cifra | `text-xs uppercase` (StatCard, BalanceItem), `text-xs` sin mayúsculas (KPICard). |
| Etiqueta de formulario | `text-xs font-medium text-muted-foreground` en casi todo el sistema (consistente, pero de 12 px). |
| Cifra | `text-lg`, `text-xl`, `text-2xl`, `text-3xl`, `text-4xl` según la pantalla. |
| Título de diálogo | `text-base font-medium` del componente; algunos lo suben a `text-lg font-semibold` (`ProductDialog.tsx:204`, `EditProductDialog.tsx:233`). |

### 2.3 Espaciado y radios

- **Radio:** base 2 px (`--radius: 0.125rem`), todo sale casi recto. Las excepciones son intencionales (`rounded-full` en píldoras y asa del sheet). Consistente.
- **Espaciado de página:** encabezado `px-4 py-3 lg:px-8 lg:py-5`; contenido `px-4 py-6 md:px-8` en Movimientos/Gastos/Usuarios y `p-4 lg:px-8 lg:py-6` en Inventario/Estadísticas. Anchos máximos distintos: `max-w-6xl` (Movimientos), `max-w-4xl` (Gastos), `max-w-3xl` (Usuarios), sin tope en Inventario y Estadísticas. Tarjetas: `p-4` (StatCard), `p-5` (secciones), `p-5 md:p-6` (Gastos). Ver VIS-34.
- **Alturas de control:** el componente base es `h-11` en celular y `md:h-8` en escritorio, pero hay 96 sobrescrituras `h-11 md:h-11`, 23 `h-12 md:h-12` y 5 `h-14 md:h-14` (VIS-13).

### 2.4 Botones (uso real)

`Button` (`components/ui/button.tsx`): variantes `default`, `outline`, `secondary`, `ghost`, `destructive` (tinte pálido), `link`. Uso aproximado: `outline` 43, `secondary` 19 (casi todos "Cancelar"), `ghost` 6, `destructive` 2 explícitos (+ el de `ConfirmDialog`), `link` 1. Tamaños: `sm` 32, `icon` 12, `icon-sm` 2. Además, ~12 botones llevan colores a mano por `className` (VIS-03). Hay también ~25 `<button>` crudos (chips, filas, basura, atajos, períodos) con estilos propios.

- **Un solo primario por vista:** se cumple en general. Inventario: "Nuevo producto". Estadísticas: "Poner dinero". Vender: "Procesar pago". Gastos: "Registrar gasto". Excepciones menores: en Vender el encabezado muestra "Abrir caja" en ámbar sólido junto a un buscador y, cuando el catálogo no encuentra nada, "Agregar como producto nuevo" también es `default` (`pos/page.tsx:654`).
- **Destructivos:** no siempre son `destructive`: "Anular venta" confirma con rojo sólido a mano (`movimientos/page.tsx:831`), "Desactivar" usuario es `outline` con borde rojo (`usuarios/page.tsx:195`), "Vaciar" es `ghost` que se pone rojo al pasar el mouse (`pos/page.tsx:697`).
- **Íconos sin texto:** 12 de 14 botones `size="icon*"` tienen `aria-label` en el mismo bloque; los dos restantes llevan texto `sr-only` (`ui/dialog.tsx`, `ui/sheet.tsx`). Bien. El caso que falta es otro (VIS-12).

### 2.5 Patrones repetidos implementados distinto

| Patrón | Variantes encontradas (archivo) |
|---|---|
| **Cabecera de página** | Una sola receta (`header sticky top-0 z-20 border-b …`) copiada en Inventario (`inventario/page.tsx:342`), Movimientos (`:524`), Gastos (`:223`), Estadísticas (`:344`), Usuarios (`:154`). Vender tiene la suya, más alta, con caja y buscador (`pos/page.tsx:508`). No hay componente compartido. |
| **Tarjeta de cifra** | `StatCard` (`components/stat-card.tsx`, usada en Movimientos y Gastos), `KPICard` (`stats/page.tsx:~895`), `BalanceItem` (`stats/page.tsx:~927`), `FlujoCard` (`stats/page.tsx:~950`), tarjeta de Bóveda y de Patrimonio hechas a mano (`stats/page.tsx:467-523`). |
| **Tabla o lista** | `<table>` real solo en Estadísticas (`stats/page.tsx:651`); `components/ui/table.tsx` existe y no se usa. Inventario y Movimientos usan filas con `div`/`button` y encabezados falsos `hidden sm:flex`. Usuarios y Gastos: lista de tarjetas. |
| **Estado vacío** | Ícono grande con `opacity-20/30` + frase (`pos:496,650`, `inventario:406,448`, `movimientos:635,779`); recuadro con borde punteado (`movimientos:627`, `gastos:369`); frase suelta en cursiva (`inventario:594,641`). Solo algunos dicen qué hacer (el de Vender y el de Inventario sí; "No se encontraron turnos de caja" y "No hay gastos registrados recientemente." no). |
| **Cargando** | Esqueleto (`EsqueletoPagina`, antes de montar); ícono girando con texto "Cargando catálogo…" (`pos:632`); ícono girando solo (`stats:389`, `usuarios:301`); página atenuada al 50% (`stats:397`); `Loader2` dentro del botón (casi todos). `app/loading.tsx` es un cuarto estilo a pantalla completa. |
| **Error de carga** | Ícono rojo + texto + "Reintentar" (`pos:638`, `inventario:391`); caja roja sin botón (`movimientos:616`, `stats:383`, `gastos:283`). |
| **Confirmación** | `ConfirmDialog` (`components/confirm-dialog.tsx`) y diálogos a mano (`pos:911`, `inventario:927`, `movimientos:808,842`, `AnularDialog`). Cancelar: `outline` en uno, `secondary` en los demás. |
| **Aviso / feedback** | `toast` (74 llamadas), banner en línea (`CheckoutSection.tsx:76-96`, `pos:615-626`, `inventario:456`), texto en línea rojo en diálogos (`movimientos:826`, `usuarios:315`), `avisos` del servidor como `toast.warning` de 12-15 s. |
| **Píldoras de estado** | `StatePill` (5 tonos) y `Badge` (`inventario:520`) conviven; `Badge` casi no se usa. |

---

## 3. Hallazgos por tema

### 3.1 Color

### VIS-01 — Aviso ámbar ilegible en tema oscuro 🔴
- **Pantalla / flujo:** Inventario → Nueva compra / Inventario inicial (avisos del servidor).
- **Evidencia:** `components/inventario/CompraForm.tsx:285` usa `bg-warning/10 … text-warning-foreground`. En oscuro `--warning-foreground` es `oklch(0.16 0 0)` (`globals.css:135`), casi negro, sobre un fondo `card` de `oklch(0.205)` apenas teñido de ámbar.
- **Qué vive la usuaria:** la dueña registra una compra y el sistema le avisa algo (por principio "registrar y avisar", los avisos son la forma de decirle que algo quedó raro). El recuadro aparece pero el texto casi no se ve. En tema claro se lee bien, por eso no se notó; el tema por defecto es el oscuro.
- **Recomendación:** cambiar a `text-warning-text` (igual que el resto de avisos: `inventario/page.tsx:457`, `pos/page.tsx:568`). Buscar el mismo patrón: es la única aparición de `text-warning-foreground` sobre tinte.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-02 — Contraste por verificar: primario oscuro, verde y rojo como texto 🟡
- **Pantalla / flujo:** Transversal (botones primarios en oscuro; `text-success` y `text-destructive` en claro).
- **Evidencia:** `globals.css:121` (`--primary` oscuro `oklch(0.62 0.19 255)`) con `--primary-foreground` `oklch(0.985)`: estimo ~3.5:1 (AA pide 4.5:1 para texto `text-sm`). `globals.css:83` (`--success` claro `oklch(0.58 0.15 150)`) usado como texto `text-xs/sm` ("Caja abierta" `pos:515`, "Cuadra" `pos:847`, "Dinero disponible" `gastos:264`): estimo ~3.5–4:1 sobre blanco. `--destructive` claro sobre `bg-destructive/10` (botón `destructive`, pills, errores): ~4.3:1.
- **Qué vive la usuaria:** en el celular al sol, o con la pantalla al mínimo, los botones azules del tema oscuro y el verde pequeño del tema claro se leen con esfuerzo. UX-27 ya arregló `warning-text`; el verde y el rojo quedaron igual.
- **Recomendación:** medir con una herramienta de contraste. Si se confirma: oscurecer `--primary` oscuro a ~`oklch(0.55 0.19 255)` para el fondo del botón, y crear `--success-text` y `--destructive-text` (claros más oscuros, como se hizo con `warning-text`) para `MoneyValue tone`, `StatePill` y los `text-success` sueltos.
- **Esfuerzo:** M (medio día)
- **Confianza:** Hipótesis: ver en vivo (valores estimados desde oklch)

### VIS-03 — Botones de acción coloreados a mano 🟡
- **Pantalla / flujo:** Vender, Inventario, Movimientos.
- **Evidencia:** sobrescriben la variante con `className`: "Abrir caja" ámbar en el encabezado (`pos/page.tsx:559`) pero **verde** dentro del diálogo (`AbrirCajaDialog.tsx:222`); "Confirmar cierre" ámbar (`pos:901`); "Confirmar anulación" rojo sólido (`movimientos:831`) mientras `destructive` es un tinte; "Cerrar forzado" ámbar (`movimientos:870`); `AjusteInventarioDialog.tsx:264-265` alterna verde/ámbar; "Registrar merma", "Merma", "Encontré producto" son `outline` con borde y texto ámbar/verde (`inventario:624,630,657`).
- **Qué vive la usuaria:** el mismo flujo ("abrir caja") cambia de color de un paso al siguiente; hay botones ámbar, verdes, rojos y azules sin una regla que se pueda aprender. Se ve improvisado.
- **Recomendación:** agregar variantes `success` y `warning` (sólidas) al `Button` y reservarlas: `success` = confirmar algo que suma dinero o abre algo; `warning` = confirmar algo que cierra o descuadra; `destructive` sólido = anular. Cambiar el "Abrir caja" del encabezado a `default` (es la acción principal de la pantalla cuando no hay turno) y dejar el ámbar solo para el banner de aviso.
- **Esfuerzo:** M (medio día)
- **Confianza:** Confirmado en código

### VIS-04 — `destructive` es un tinte pálido 🟡
- **Pantalla / flujo:** `ConfirmDialog`, "Sí, vaciar" (`pos:919`), "Desactivar" usuario (`usuarios:327`), "Desactivar producto" (`inventario:936`).
- **Evidencia:** `components/ui/button.tsx:22` define `destructive` como `bg-destructive/10 text-destructive`. En el diálogo de confirmación queda al lado de Cancelar (`outline`/`secondary`) con casi el mismo peso visual.
- **Qué vive la usuaria:** el botón que ejecuta la acción irreversible se ve apagado y el que cancela se ve normal; la mano va al lugar equivocado o duda en cuál es cuál.
- **Recomendación:** dejar `destructive` como tinte para acciones en listas ("Desactivar" en una fila) y crear `destructive-solid` (o `variant="destructive" emphasis`) para el botón final de un diálogo de confirmación; usarlo en `ConfirmDialog`. Mantener el foco inicial en Cancelar.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-05 — El color no significa siempre lo mismo 🟡
- **Pantalla / flujo:** Gastos, Vender, Movimientos, Estadísticas.
- **Evidencia:** (a) cada gasto de la lista va en rojo `text-destructive` (`gastos:396`), igual que un error; (b) "Falta $X" al cobrar es un recuadro rojo (`CheckoutSection.tsx:153`) aunque es un estado normal de la venta; (c) "Cierre declarado" (`movimientos:696`), "Costó" (`stats:662`), la tarjeta "Lo que costó lo vendido" (`stats:448`) y "Lo que sacaste para ti" (`stats:~583`) van en ámbar (`tone="warning"`) siendo datos normales; (d) "Ventas 12 op." en verde (`movimientos:690`) y la etiqueta "Trasladar a bóveda" en verde (`pos:859`) sin ser ganancia; (e) "Vendido" y "Compra promedio" en azul de acción (`stats:440,461`).
- **Qué vive la usuaria:** si todo gasto es rojo, el rojo deja de avisar. Si el ámbar aparece en cifras normales, el aviso real ("por revisar") pierde fuerza.
- **Recomendación:** regla escrita en un comentario de `globals.css` y aplicada: verde = dinero que entra o resultado bueno; rojo = error, pérdida o descuadre (no gasto normal); ámbar = "mira esto" (aviso, pendiente, falta algo); azul = acción e interacción, no datos; gris = dato normal. Pasar gastos, costos y "cierre declarado" a `foreground`/`muted`; "Falta" a ámbar o neutro con negrita.
- **Esfuerzo:** M (medio día)
- **Confianza:** Confirmado en código

### VIS-06 — Tres umbrales distintos de "buen margen" 🟡
- **Pantalla / flujo:** Estadísticas.
- **Evidencia:** `marginTone` (`stats/page.tsx:113`) usa 25 y 10 (también la leyenda del gráfico, `:~560`); la tarjeta "Te quedan por cada $100…" usa 15 y pinta **rojo** todo lo que está bajo 15 (`:454`); `PLRow` tipo `pct` usa 15 (verde), 0–15 ámbar (`:~970`).
- **Qué vive la usuaria:** la dueña ve arriba "Te quedan $14 por cada $100" en rojo y abajo, en la tabla de productos, el mismo rango en ámbar. Se pregunta si está perdiendo cuando solo gana poco.
- **Recomendación:** una sola función `tonoMargen()` y un solo par de cifras (que lo decida la dueña, p. ej. 25/10), usada en las tres. Y no usar rojo para margen positivo: rojo solo bajo 0.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-07 — Tema oscuro por defecto, ignora el del sistema ⚪
- **Pantalla / flujo:** Transversal.
- **Evidencia:** `app/layout.tsx:38-40` (`defaultTheme="dark" enableSystem={false}`).
- **Qué vive la usuaria:** una tienda con luz de día abre la app y ve negro; hay botón de tema, pero hay que encontrarlo. Es decisión de producto del rediseño, no un error.
- **Recomendación:** decidir con la dueña; si prefiere claro, `defaultTheme="light"`. Mientras tanto, corregir VIS-01/02 porque el oscuro es el que ve todo el mundo.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Hipótesis: ver en vivo

### VIS-08 — Fondo atenuado del diálogo casi invisible ⚪
- **Pantalla / flujo:** Todos los diálogos.
- **Evidencia:** `components/ui/dialog.tsx:42` (`bg-black/10` + `backdrop-blur-xs`).
- **Qué vive la usuaria:** en tema oscuro un 10% de negro sobre gris oscuro casi no cambia nada; la pantalla de atrás sigue pareciendo activa y compite con el diálogo.
- **Recomendación:** `bg-black/40` (claro) y `/60` (oscuro).
- **Esfuerzo:** S (<1 h)
- **Confianza:** Hipótesis: ver en vivo

### 3.2 Tipografía

### VIS-09 — Texto de 10 y 11 px en datos que se usan 🟡
- **Pantalla / flujo:** Vender (columna de stock), Inventario, Estadísticas, menú inferior.
- **Evidencia:** `text-[10px]` en `pos/page.tsx:91,100,104` (unidad del stock y "vendido sin registrar"), `stats:942`, `EditProductDialog.tsx:360`; `text-[11px]` en `validacionPresentacion.tsx:54-55` (mensajes de error de campo), `bottom-nav.tsx:34`, `CheckoutSection.tsx:218`.
- **Qué vive la usuaria:** la cajera mira el stock de reojo mientras atiende; "7 six-pack" en 10 px gris es lo más difícil de leer de la fila. Los errores de validación de presentación (11 px) son el texto más importante del formulario.
- **Recomendación:** piso de 12 px (`text-xs`). Subir la unidad de stock a `text-xs` y los errores de campo a `text-xs`.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-10 — Títulos de sección con tres estilos y saltos de nivel ⚪
- **Pantalla / flujo:** Estadísticas, Gastos, Inventario, Movimientos.
- **Evidencia:** secciones de Estadísticas en `text-sm font-semibold text-muted-foreground` (`stats:470,499,531,589,638`, una sin `muted` en `:550`); Gastos en `font-semibold` normal (`gastos:279,363`); Inventario `text-sm font-semibold` (`inventario:685`). Los encabezados saltan de `h1` a `h3` (`movimientos:662`, `stats:402`, `inventario:685`).
- **Qué vive la usuaria:** en Estadísticas el título de cada bloque es más débil (gris, 14 px) que las cifras que contiene; cuesta ver dónde empieza cada bloque. Para un lector de pantalla, la estructura de títulos está rota.
- **Recomendación:** componente `<SeccionTitulo icono>` con `text-sm font-semibold text-foreground` y `h2` siempre; las ayudas debajo en `text-xs muted`.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-11 — Cuatro tarjetas de cifra distintas ⚪
- **Pantalla / flujo:** Movimientos, Gastos, Estadísticas.
- **Evidencia:** `StatCard` (`components/stat-card.tsx:28`: etiqueta en mayúsculas, `p-4`), `KPICard` (`stats:~895`: etiqueta sin mayúsculas, cifra `text-xl`), `BalanceItem` (`stats:~927`: mayúsculas, `text-base`), `FlujoCard`; las cifras de la misma jerarquía van en `text-lg` (Movimientos:562), `text-2xl` (:574), `text-3xl` (:569 y Gastos:243).
- **Qué vive la usuaria:** la dueña ve en una misma fila cifras de tres tamaños y etiquetas con y sin mayúsculas; no sabe cuál es la importante.
- **Recomendación:** extender `StatCard` con `size="lg" | "md"` y `tone`, y que `KPICard` y `BalanceItem` sean casos suyos. Etiqueta siempre sin mayúsculas forzadas (se leen mejor en español).
- **Esfuerzo:** M (medio día)
- **Confianza:** Confirmado en código

### 3.3 Botones

### VIS-12 — Dos botones del encabezado sin nombre bajo `lg` (persiste UX-26) 🟡
- **Pantalla / flujo:** Inventario, encabezado (dueña en celular o tablet).
- **Evidencia:** `inventario/page.tsx:350-357`: "Inventario inicial" tiene su texto en `<span className="hidden lg:inline">` y "Nueva compra" en `hidden sm:inline`. Con `display:none` el texto sale del nombre accesible y el botón queda solo con ícono, sin `aria-label` ni `title`. En celular se ven dos botones `outline` con un paquete y un camión.
- **Qué vive la usuaria:** la dueña en el celular ve tres botones en la esquina; dos son íconos y no sabe cuál es compra y cuál inventario inicial. Un lector de pantalla los anuncia como "botón".
- **Recomendación:** `aria-label` y `title` en ambos. Mejor aún: en celular dejar solo "Nuevo producto" y "Compra" visibles y meter "Inventario inicial" (se usa una vez en la vida) en un menú "Más".
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-13 — `h-11 md:h-11` repetido 96 veces 🟡
- **Pantalla / flujo:** Transversal.
- **Evidencia:** el `Button` y el `Input` base son `h-11 md:h-8` (`ui/button.tsx:27`, `ui/input.tsx:12`); cada pantalla los pisa con `h-11 md:h-11` (96 sitios), `h-12 md:h-12` (23), `h-14 md:h-14` (5), `md:h-9`, `md:h-10`, `md:h-7`. Ejemplos: `pos:533,542,572`, `gastos:295,301,316,345`, `CheckoutSection.tsx:124,134,226`.
- **Qué vive la usuaria:** en laptop un botón mide 32 px en un diálogo y 44 px en el siguiente; los campos de un mismo formulario tienen alturas distintas (`gastos` mezcla 56, 48 y 44). Se ve sin ritmo.
- **Recomendación:** decidir la escala (propuesta: `default` 44/40, `lg` 48 para el campo de monto, `sm` 36) y definirla una vez en `button.tsx`/`input.tsx`; quitar las sobrescrituras con un reemplazo en bloque. Es mecánico.
- **Esfuerzo:** M (medio día)
- **Confianza:** Confirmado en código

### VIS-14 — Muro de botones `outline` en el producto abierto 🟡
- **Pantalla / flujo:** Inventario → producto expandido.
- **Evidencia:** `inventario/page.tsx:577-590` (Editar, Agregar, Desactivar), `:623-634` (Registrar merma, Encontré producto) y por cada lote un "Merma" más (`:656`). Todos `outline`, mismo tamaño; el de merma con borde ámbar.
- **Qué vive la usuaria:** al abrir un producto con 3 lotes aparecen unos 8 botones iguales; la acción frecuente (cambiar el precio, que ya es un botón con borde punteado) se pierde entre las raras ("Desactivar").
- **Recomendación:** dejar "Editar" visible y mandar "Agregar presentación" y "Desactivar" a un menú "⋯". La merma por lote como ícono con `aria-label` y la general solo una. Cada fila debe tener a lo más una acción visible.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-15 — Cancelar y pies de diálogo en tres estilos ⚪
- **Pantalla / flujo:** Diálogos.
- **Evidencia:** Cancelar es `secondary` en 19 sitios (p. ej. `pos:900`, `usuarios:323`) y `outline` en `ConfirmDialog` (`confirm-dialog.tsx:65`), `ghost` en `PrecioRapido`. El pie es `DialogFooter` con franja gris a sangre (`movimientos:827`, `stats:727`, `AnularDialog`, `DevolucionDialog`) o un `div flex justify-end` plano (`pos:899`, `gastos:442`, `usuarios:322`, `SacarDineroDialog:276`). Cierre: unos con "X" (`showCloseButton`) y otros sin (`={false}`) mezclados.
- **Qué vive la usuaria:** cada diálogo se ve un poco distinto; la franja del pie aparece en unos y no en otros.
- **Recomendación:** todos con `DialogFooter`, Cancelar `outline`, y la "X" solo en diálogos largos o de formulario.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-16 — Objetivos táctiles chicos que quedaron ⚪
- **Pantalla / flujo:** Gastos, cierre de caja.
- **Evidencia:** enlace "+ Nueva" categoría es `variant="link" h-auto p-0 text-xs` (`gastos:322-325`): ~16 px de alto. Casilla "Reabrir automáticamente" de 16 px con etiqueta `text-xs` (`pos:871-878`). Sidebar: salir y tema `h-9 w-9` (`sidebar.tsx:81`), solo escritorio, aceptable.
- **Qué vive la usuaria:** acertarle a "+ Nueva" en el celular con el pulgar falla.
- **Recomendación:** `min-h-11` en móvil al enlace (`py-3`) y a la fila de la casilla.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### 3.4 Jerarquía por pantalla

**Login** (`app/auth/login/page.tsx`). Lo primero que se ve: el cuadro con el ícono y "Tienda Karlita". Está bien; solo hay un campo de acción. Detalles en VIS-22 y VIS-24.

**Vender** (`pos/page.tsx`). Lo primero que se ve es el encabezado pegajoso: título "Nueva venta", estado de la caja, dos botones, buscador, chips. Lo importante (qué agregar al ticket, cuánto va) queda abajo. Compiten con la lista: el botón ámbar "Abrir caja", el banner y la barra del carrito. Orden propuesto: ver VIS-17 y VIS-18.

**Inventario**. Lo primero: título y tres botones del encabezado; luego pestañas y buscador. Es el orden correcto para la cajera. Compite: la franja ámbar "por revisar" con su botón (`:456`) cuando hay pendientes, y el muro de botones (VIS-14). Propuesta: buscador primero, franja como texto con enlace, acciones en menú.

**Movimientos**. Lo primero: cuatro tarjetas (Gaveta, Ingresos, Turnos visibles) antes que la lista de turnos. La dueña que llega a "¿qué pasó hoy?" tiene que pasar tres tarjetas, una con jerga (VIS-21).

**Gastos**. Lo primero: dos tarjetas de saldo (Gaveta y Bóveda) y un formulario largo. Para quien viene a anotar un gasto es correcto. Compite: las deudas con proveedores van después del formulario y antes del historial (VIS-20).

**Estadísticas**. Lo primero: la frase "Hoy ganaste $X" — acertado, es lo que la dueña quiere. Pero luego viene todo al mismo nivel (VIS-19).

**Usuarios**. Lo primero: un banner explicativo largo y luego la lista. La lista es lo importante (VIS-22).

**Diálogos principales:** Abrir caja y Cerrar caja (largos, VIS-28), Sacar dinero (bien: primero elige qué hacer, luego un solo formulario con resumen "Vas a pasar $X…", `SacarDineroDialog.tsx:~232`), Devolución, Alta rápida, Anular.

### VIS-17 — Encabezado pegajoso de Vender se come un tercio de la pantalla 🟡
- **Pantalla / flujo:** Vender, celular (375×667).
- **Evidencia:** `pos/page.tsx:508-627`: el bloque pegajoso suma fila de título/caja/botones (~76 px), buscador `h-12` (~60 px), chips `min-h-11` (~56 px) y, con caja cerrada, un banner (~32 px) = ~190-220 px. A eso se suman el encabezado móvil (56 px, `dashboard/layout.tsx:20`), la barra del carrito (~60 px) y el menú inferior (56 px): ~370-400 px de 667 quedan ocupados.
- **Qué vive la usuaria:** con el celular en el mostrador ve unas 4 filas de productos a la vez y tiene que desplazarse mucho para buscar.
- **Recomendación:** que el encabezado pegajoso sea solo el buscador; título y estado de caja en una línea compacta que se desplaza con la lista; chips que se desplacen (no pegajosos). Pasar "Sacar dinero" y "Cerrar caja" a un menú "Caja ▾" en celular.
- **Esfuerzo:** M (medio día)
- **Confianza:** Hipótesis: ver en vivo

### VIS-18 — El cobro queda al final del scroll en la hoja del ticket 🟡
- **Pantalla / flujo:** Vender, celular y tablet (< 1024 px).
- **Evidencia:** `pos/page.tsx:772-791`: dentro de `BottomSheetContent` (`max-h-[90dvh] overflow-y-auto`) las líneas (`CartLines`, ~150 px cada una: nombre, cantidad, atajos) van antes que `CheckoutSection` (Total, "Paga con", billetes, "Procesar pago"). En escritorio el cobro sí queda fijo (`:707`).
- **Qué vive la usuaria:** con 4 productos o más el total y "Procesar pago" quedan fuera de la hoja; hay que bajar el scroll en cada venta, con el cliente esperando.
- **Recomendación:** que la hoja sea columna con lista que desplaza (`flex-1 overflow-y-auto`) y pie fijo con "Total a cobrar" y el botón. Atajos de cantidad plegados (un toque en la línea los muestra).
- **Esfuerzo:** M (medio día)
- **Confianza:** Probable

### VIS-19 — La ganancia se repite tres veces y hay 8 bloques al mismo nivel 🟡
- **Pantalla / flujo:** Estadísticas.
- **Evidencia:** la frase de `Cabecera` (`stats:424`) ya dice "Hoy ganaste $X (de $Y vendidos)"; justo debajo las tarjetas KPI repiten "Ganancia" y "Vendido" (`:428-441`); el estado de resultados las vuelve a mostrar (`:~571-580`). Los bloques siguen: asistente de bóveda, 5 KPI (en 4 columnas queda una huérfana), Bóveda, "Lo que vale el negocio", flujo, gráfico, estado de resultados, tabla de productos, todos con el mismo borde y fondo.
- **Qué vive la usuaria:** la dueña ve la respuesta arriba y después una pared de tarjetas parecidas; no sabe qué más mirar ni cuándo parar.
- **Recomendación:** orden: 1) la frase "ganaste/perdiste"; 2) Bóveda y Gaveta con sus botones (dónde está su dinero); 3) "Lo que más vendes" y la tabla (qué comprar); 4) el resto plegado en "Ver cómo salió la ganancia" y "Entradas y salidas de dinero". Quitar "Ganancia" y "Vendido" de las KPI (ya están en la frase); dejar 3 KPI (costo, por cada $100, compra promedio) o integrarlas a la frase.
- **Esfuerzo:** M (medio día)
- **Confianza:** Confirmado en código

### VIS-20 — Las deudas con proveedores quedan enterradas bajo el formulario ⚪
- **Pantalla / flujo:** Gastos.
- **Evidencia:** `gastos/page.tsx:276-357`: tarjetas de saldo → formulario "Nuevo gasto" (5 campos) → `DeudasProveedores` → últimos gastos.
- **Qué vive la usuaria:** si debe dinero a un proveedor (algo que se paga en una fecha) tiene que bajar pasando el formulario para verlo.
- **Recomendación:** mostrar las deudas pendientes arriba, junto a los saldos, solo cuando existan; el formulario sigue siendo la acción principal.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Probable

### VIS-21 — Tarjetas de arriba de Movimientos con jerga y poco valor ⚪
- **Pantalla / flujo:** Movimientos.
- **Evidencia:** `movimientos/page.tsx:553-581`: "Ingresos de los turnos mostrados", "Turnos visibles" con "Desc.: +0.00 (sobró)" (sin `$`, hecho con `toFixed`).
- **Qué vive la usuaria:** "Ingresos de los turnos mostrados" cambia al buscar y no es un número que la dueña recuerde; "Desc." no se entiende.
- **Recomendación:** una sola tarjeta "Gaveta ahora" y una línea "Total vendido en los turnos de abajo"; "Desc." → "Sobró/Faltó $X" con `MoneyValue`.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-22 — Pulido de Login y Usuarios ⚪
- **Pantalla / flujo:** Login, Usuarios.
- **Evidencia:** Login: etiquetas `text-xs muted` sobre campos de 44 px (`login:108,122`), título como `div` (no hay `h1`), descripción con jerga (VIS-39). Usuarios: el banner largo antes de la lista (`usuarios:171`) y tres botones `outline` por fila (`:211-236`).
- **Qué vive la usuaria:** la dueña abre Usuarios para cambiar una contraseña y primero lee un párrafo.
- **Recomendación:** banner de una línea y plegable; botones de fila: "Contraseña" visible y "Rol / Desactivar" en menú.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Probable

### 3.5 Estados de interacción

Matriz de lo que revisé en `components/ui/*` (base shadcn): `Button`, `Input`, `Select`, `Badge`, `Tabs` tienen `focus-visible:ring-3 ring-ring/50`, `disabled:opacity-50`, `aria-invalid`, `active:translate-y-px` (solo botón). Hover existe en botones y filas. **Lo que está en el base está bien.** Los huecos son los controles que no pasan por el base:

### VIS-23 — Campo de cantidad sin foco visible real; botones crudos sin estilo de foco 🟡
- **Pantalla / flujo:** Vender (el control más usado por la cajera).
- **Evidencia:** `CartLines.tsx:60` (`CampoNumero`): `outline-none … focus:bg-muted/50` y `border-0`; el único indicio de foco es un fondo 50% gris, dentro de un contenedor que no cambia. Otros `<button>` y `<a>` crudos sin `focus-visible:`: chips (`pos:596-609`), atajos de cantidad (`CartLines.tsx:175`), basura (`:104`), filas del catálogo (`pos:662`), períodos (`stats:354`), enlaces del menú lateral y del inferior (`sidebar.tsx:52`, `bottom-nav.tsx:34`), cobro "Modo apagón" (`CheckoutSection.tsx:168`). Dependen del contorno del navegador, cuyo color el CSS base reemplaza por `ring/50` (`globals.css:162`, `* { outline-ring/50 }`), o sea un azul al 50%.
- **Qué vive la usuaria:** con el lector de códigos y teclado (sin mouse) o con Tab, no sabe en qué línea está ni si el siguiente Enter cobra o borra.
- **Recomendación:** clase utilitaria única `foco` = `focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2` y aplicarla a los crudos; en `CampoNumero` un `focus-within:ring-3 ring-ring/50` en el contenedor.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código para `CampoNumero`; Hipótesis: ver en vivo para el resto

### VIS-24 — Errores de campo: casi nada marca el campo ni se anuncia 🟡
- **Pantalla / flujo:** Formularios (Login, cierre de caja, gastos, usuarios, compras).
- **Evidencia:** `aria-invalid` aparece una sola vez en toda la app fuera de `ui/` (`pos/page.tsx:894`). La validación del cierre de caja es por `toast.error` (`pos:222-236`); los errores en línea son cajas rojas sin `role="alert"` (`login:101`, `gastos:283`, `AltaRapidaDialog.tsx:~118`, `CompraForm.tsx:278`, `movimientos:826`) salvo en Usuarios (`:315`). Los `required` dependen de la burbuja nativa del navegador.
- **Qué vive la usuaria:** en el login, si la contraseña está mal, el mensaje aparece sin que un lector de pantalla lo anuncie y el campo no se marca; en el cierre de caja, el error sale como aviso flotante que desaparece, lejos del campo.
- **Recomendación:** componente `<CampoError>` (`role="alert"`, ícono, texto) y `aria-invalid` + `aria-describedby` en el campo con error. Los estilos de `aria-invalid` ya existen en `Input` y `Select`; solo falta activarlo.
- **Esfuerzo:** M (medio día)
- **Confianza:** Confirmado en código

### VIS-25 — Botones `disabled` sin decir por qué ⚪
- **Pantalla / flujo:** Diálogos de anulación, bóveda, gasto.
- **Evidencia:** "Confirmar anulación" deshabilitado hasta escribir el motivo, sin indicar que es obligatorio (`movimientos:831`, `AnularDialog`); "Guardar" del asistente de bóveda (`stats:415`); "Registrar compra" sin lotes (`CompraForm.tsx:~437`). Bien resuelto: el cierre de caja cambia el texto del botón a "Explica la diferencia para cerrar" (`pos:903`) y "Abre la caja primero" (`CheckoutSection.tsx:236`).
- **Qué vive la usuaria:** el botón gris no responde y no sabe qué le falta.
- **Recomendación:** replicar el patrón del cierre de caja: etiqueta "(obligatorio)" en el campo y texto del botón con lo que falta.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-26 — Cuatro patrones de "cargando" ⚪
- **Pantalla / flujo:** Transversal.
- **Evidencia:** ver tabla de §2.5. Además `ConfirmDialog` deshabilita el botón al confirmar pero sin ícono girando (`confirm-dialog.tsx:72-79`).
- **Qué vive la usuaria:** unas pantallas muestran el esqueleto, otras un círculo con texto, otras un círculo solo, otras se atenúan. El esqueleto (`EsqueletoPagina`) es el mejor y solo se usa antes de montar.
- **Recomendación:** usar el esqueleto para carga inicial de página y el spinner solo dentro de botones; atenuar al refrescar (como Estadísticas, que está bien resuelto).
- **Esfuerzo:** M (medio día)
- **Confianza:** Confirmado en código

### VIS-27 — Tres avisos a la vez tras una venta (persiste UX-29) ⚪
- **Pantalla / flujo:** Vender.
- **Evidencia:** al cobrar, `pos/page.tsx:332` lanza un toast "Venta registrada · Total…", `CheckoutSection.tsx:76` muestra el recuadro "¡Venta registrada!" 3 s (`pos:351-356`) y el recuadro de "Última venta · Cambio" (`:87`). La puntuación difiere ("¡Venta registrada!" y "Venta registrada · Total: …").
- **Qué vive la usuaria:** lo que importa (el cambio, en grande) compite con dos avisos de lo mismo.
- **Recomendación:** dejar solo el recuadro grande de cambio y un toast corto solo para los `avisos` del servidor.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### 3.6 Responsive

Lectura de clases Tailwind. Breakpoints reales: `sm` 640, `md` 768 (aparece el menú lateral de 256 px y desaparece el menú inferior), `lg` 1024 (aparece el panel de ticket de 380 px).

### VIS-28 — Diálogos sin altura máxima: el botón queda fuera de la pantalla 🔴
- **Pantalla / flujo:** Cerrar caja, Abrir caja con diferencia, Devolución, Alta rápida, Compra y otros diálogos de formulario, en celular.
- **Evidencia:** `components/ui/dialog.tsx:62` fija el contenido con `fixed top-1/2 left-1/2 -translate-y-1/2` y **sin** `max-h` ni `overflow-y-auto`. Solo tres diálogos lo agregan a mano (`ProductDialog.tsx:202`, `EditProductDialog.tsx:239`, `inventario:882`, y esos con `vh` y no `dvh`). El de cierre de caja (`pos:814-907`) tiene encabezado, aviso de esperado, dos campos `h-12`, diferencia en vivo, fondo siguiente, observaciones y botones: estimo ~600 px; con teclado abierto en un celular queda un viewport de ~300 px.
- **Qué vive la usuaria:** al cerrar el turno, el diálogo es más alto que la pantalla; al estar centrado y fijo, se corta arriba y abajo y no hay scroll. No puede llegar a "Confirmar cierre". Está trabada con el turno abierto (o tiene que girar el celular).
- **Recomendación:** en `DialogContent` base: `max-h-[calc(100dvh-2rem)] overflow-y-auto`, y que `DialogFooter` sea pegajoso (`sticky bottom-0`) para que el botón siempre se vea. Cambiar los `vh` por `dvh`.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Probable (Hipótesis: ver en vivo con teclado abierto)

### VIS-29 — En Vender, entre 1024 y ~1130 px el nombre del producto se queda sin ancho 🟡
- **Pantalla / flujo:** Vender, tablet horizontal o laptop chica.
- **Evidencia:** a 1024 px el catálogo mide `1024 − 256 (menú) − 380 (ticket) = 388` px; con `lg:px-6` quedan 340. Cada fila reserva: código 96 (`hidden sm:block`, `pos:667`), stock 96 (`StockCelda`), precio 80, botón 36 y 4 separaciones de 12 = ~356 px. El `flex-1` del nombre queda en 0 o negativo y se ve truncado a nada. A 1100 px quedan ~60 px.
- **Qué vive la usuaria:** en una tablet horizontal ve filas con código, stock y precio, pero no el nombre del producto.
- **Recomendación:** ocultar el código bajo `xl` (`hidden xl:block`) y bajar el ticket a `w-[320px] xl:w-[380px]`. Alternativa: usar `lg` solo para el modo de ticket en hoja y `xl` para el panel lateral.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Probable (aritmética sobre las clases; confirmar en vivo)

### VIS-30 — En Vender, entre 768 y 1023 px la barra del carrito flota bajo el menú lateral 🟡
- **Pantalla / flujo:** Vender, tablet vertical.
- **Evidencia:** la barra `fixed inset-x-0 … lg:hidden` con `bottom: calc(3.5rem + env(safe-area-inset-bottom))` (`pos:730-736`) asume el menú inferior, que desde `md` desaparece (`bottom-nav.tsx` es `md:hidden`). Resultado: la barra queda 56 px por encima del borde, ocupa todo el ancho (también bajo el menú lateral, `z-50` del `aside`) y deja una franja vacía debajo por donde se ve pasar la lista. `pb-36` de la lista (`:659`) también sobra.
- **Qué vive la usuaria:** en la tablet la barra parece rota: sube de más, su texto queda medio tapado por el menú lateral y la lista se asoma por debajo.
- **Recomendación:** `bottom-0 md:left-64` y `bottom: calc(3.5rem + …)` solo bajo `md` (usar `max-md:` para el offset).
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código (aspecto: ver en vivo)

### VIS-31 — La tabla de productos de Inventario aplasta el nombre entre 640 y ~900 px 🟡
- **Pantalla / flujo:** Inventario (tablet vertical).
- **Evidencia:** `inventario/page.tsx:476-483,502-529`: las columnas aparecen en `sm` (640) con anchos fijos: ícono 24 + ID 56 + categoría 128 + stock 96 + "Present." 96 = 400 px más 5 separaciones de 12 y padding de fila 32. A 768 px (menú lateral de 256, contenido 512, menos `p-4` = 480) el nombre queda en ~0-30 px; a 640-767 (sin menú lateral) en ~100 px.
- **Qué vive la usuaria:** en tablet vertical ve la tabla con todas las columnas y el nombre del producto cortado a unas letras.
- **Recomendación:** mostrar las columnas de escritorio desde `lg` (no `sm`); entre `sm` y `lg` usar el formato de celular (nombre, "Categoría · 3 pres." debajo, píldora de stock). Quitar la columna ID (la cajera no la usa) y "Present." (repite lo de debajo).
- **Esfuerzo:** S (<1 h)
- **Confianza:** Probable (aritmética sobre las clases)

### VIS-32 — Tarjetas de cifras demasiado angostas en Estadísticas entre 768 y 1023 px 🟡
- **Pantalla / flujo:** Estadísticas (tablet vertical).
- **Evidencia:** `stats:427` `grid-cols-2 md:grid-cols-4` con 5 tarjetas: a 768 px el contenido útil es ~448 px (menú lateral 256 y `p-4`), o sea ~100 px por tarjeta (68 px útiles). La cifra `font-mono text-xl` ("$1,234.50" ≈ 108 px) no cabe y la etiqueta larga "Te quedan por cada $100 vendidos (antes de gastos)" se envuelve en 5 o 6 líneas. La quinta tarjeta queda sola en una segunda fila.
- **Qué vive la usuaria:** la dueña con una tablet ve números que se salen de su recuadro.
- **Recomendación:** `grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`; al quitar "Ganancia" y "Vendido" (VIS-19) quedan 3 y encaja en `lg:grid-cols-3`.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Hipótesis: ver en vivo

### VIS-33 — Seis pestañas en el menú inferior: los nombres se cortan 🟡
- **Pantalla / flujo:** Todo el sistema, dueña en celular.
- **Evidencia:** `bottom-nav.tsx:29-40`: 6 ítems ADMIN en 375 px = ~62 px por ítem, menos `px-1` = ~54 px; con `text-[11px] font-medium` y `truncate`, "Estadísticas" (~62 px) y "Movimientos" (~58 px) se cortan ("Estadísti…").
- **Qué vive la usuaria:** la dueña ve etiquetas cortadas en el menú principal. La cajera tiene 3 ítems y no lo sufre.
- **Recomendación:** para ADMIN en celular, dejar Vender, Inventario, Movimientos y Estadísticas, y juntar "Gastos" y "Usuarios" en un quinto ítem "Más". O acortar etiquetas del menú inferior ("Stats"/"Gastos" → mejor "Números").
- **Esfuerzo:** S (<1 h)
- **Confianza:** Probable

### VIS-34 — Encabezado desalineado con el contenido, `vh` y avisos entre 600 y 1023 px ⚪
- **Pantalla / flujo:** Movimientos, Gastos, Usuarios; diálogos; avisos.
- **Evidencia:** (a) encabezado `px-4 lg:px-8` pero contenido `md:px-8`, así que entre 768 y 1023 px el título está a 16 px y el contenido a 32 px (`movimientos:524/549`, `gastos:223/235`, `usuarios:154/171`); (b) `max-h-[80vh]`, `75vh`, `90vh` en diálogos (`inventario:882`, `EditProductDialog.tsx:239`, `ProductDialog.tsx:202`) en vez de `dvh`; (c) `mobileOffset` del `Toaster` solo aplica bajo 600 px (`layout.tsx:44`), por lo que entre 600 y 1023 el aviso (abajo-centro, 24 px) cae sobre la barra del carrito.
- **Qué vive la usuaria:** pequeñas desalineaciones y avisos que tapan botones en tablet.
- **Recomendación:** misma `px` en encabezado y contenido (`md:px-8` en los dos); `dvh`; `offset` del toaster también para `md` e inferior.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código (a, b); Hipótesis: ver en vivo (c)

### VIS-35 — Tabla de Estadísticas de 6 columnas en celular ⚪
- **Pantalla / flujo:** Estadísticas → "Productos — cuánto dejan".
- **Evidencia:** `stats:651-696`: `overflow-x-auto` con 6 columnas; el nombre no queda fijo (`sticky left-0`).
- **Qué vive la usuaria:** al desplazar a la derecha para ver "Ganancia", pierde de vista qué producto es.
- **Recomendación:** en celular, tarjeta por producto (nombre + "Vendiste $X, dejó $Y") o primera columna pegajosa.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Hipótesis: ver en vivo

### 3.7 Accesibilidad

Verificado que sigue bien tras L14: todos los `<Label>` tienen `htmlFor` (0 sin asociar fuera de `ui/`); botones de ícono con `aria-label` (12 de 14, los 2 restantes con `sr-only`); chips con `aria-pressed`; menú de usuario móvil (`user-menu.tsx`); interruptor de modo apagón con `role="switch"`; `ConfirmDialog` con foco inicial en Cancelar; diálogos Radix (trampa de foco y Escape); la tabla de Estadísticas es `<table>` real; el gráfico tiene la tabla equivalente debajo. Lo que faltó:

### VIS-36 — Dos `h1`, menú lateral sin `aria-current`, mismo título de pestaña ⚪
- **Pantalla / flujo:** Transversal.
- **Evidencia:** `sidebar.tsx:33` pone `<h1>Tienda Karlita</h1>` y cada página tiene su propio `h1` (en escritorio hay dos). Los enlaces del menú lateral no marcan `aria-current="page"` (`sidebar.tsx:51-62`; el inferior sí, `bottom-nav.tsx:31`). Todo el sistema usa el mismo `<title>` "ERP Tienda Karlita" (`layout.tsx:17`; las páginas son `'use client'` y no exportan `metadata`). El `<nav>` del menú no tiene `aria-label`.
- **Qué vive la usuaria:** con lector de pantalla no se anuncia a qué sección cambió ni qué es el contenido principal; las pestañas del navegador se llaman todas igual.
- **Recomendación:** marca como `<p>`; `aria-current` en el lateral; `aria-label="Menú principal"`; título por sección con un `layout.tsx` por carpeta con `metadata` ("Vender · Tienda Karlita").
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-37 — Sin `prefers-reduced-motion`; barra del carrito pisa su nombre visible ⚪
- **Pantalla / flujo:** Transversal, Vender.
- **Evidencia:** no hay `motion-reduce`/`prefers-reduced-motion` en `app/` ni `components/` (animaciones: `animate-pulse`, `animate-spin`, zoom de diálogos). La barra del carrito tiene `aria-label="Ver ticket"` (`pos:733`) que reemplaza el texto visible ("3 productos · $5.00"): el nombre accesible no contiene lo que se ve (WCAG 2.5.3). La clase `cn-toast` en `sonner.tsx:41` no existe en ningún CSS (código muerto).
- **Qué vive la usuaria:** poco; es pulido.
- **Recomendación:** `@media (prefers-reduced-motion: reduce)` global en `globals.css` que anule animaciones; `aria-label` = "Ver ticket: 3 productos, $5.00".
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### 3.8 Lenguaje de la interfaz

El tuteo es consistente (no encontré voseo ni "usted"; UX-30c está resuelto). Mayúsculas: títulos y botones en minúscula después de la primera palabra ("Nueva venta", "Cerrar caja"), sin "Title Case" en pantalla (solo en comentarios del código, p. ej. "ABRIR CAJA"). Bien.

### VIS-38 — "Caja", "Gaveta" y "Turno" mezclados 🟡
- **Pantalla / flujo:** Vender, Movimientos, Gastos.
- **Evidencia:** el glosario (`lib/glosario.ts`) dice Gaveta = el efectivo del mostrador, pero el estado del turno se llama "Caja abierta / Abrir caja / Cerrar caja / Abre la caja primero" (`pos:516,545,561`, `CheckoutSection.tsx:236`), "turno de caja" (`pos:623`, `AbrirCajaDialog.tsx:154`) y, en Movimientos, la tarjeta "Gaveta (hoy)" muestra "Abierta/Cerrada" (`movimientos:555-563`); Gastos dice "No hay turno abierto" (`gastos:250`) y "abre la caja en Vender".
- **Qué vive la usuaria:** "¿la caja es la gaveta?". El glosario quería evitar justo esa duda.
- **Recomendación:** decidir y escribirlo en `glosario.ts`: "Caja" = el turno (abrir/cerrar), "Gaveta" = el efectivo. Entonces la tarjeta de Movimientos debe llamarse "Caja de hoy: Abierta" y no "Gaveta (hoy)"; Gastos: "No hay caja abierta".
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-39 — Jerga contable y de sistema en pantalla 🟡
- **Pantalla / flujo:** Movimientos, Compras, Login, cierre de caja.
- **Evidencia:** "Descuadre" y "Desc.:" (`movimientos:578,699`; la cierre de caja ya usa "Faltan/Sobran/Cuadra", `pos:850-854`); "Ingresos de los turnos mostrados" (`movimientos:568`); "Fondo siguiente turno" (`pos:870`); "aporte del dueño en especie (capital)" (`CompraForm.tsx:299`) y "Capital de la dueña" (`:222`, el glosario usa "dueña"); "Cuenta de origen", "Efectivo esperado (sistema)" (`pos:827`); login: "Ingresa tus credenciales para acceder al ERP" (`login:95`); "Tu rol no tiene acceso" (`forbidden-state.tsx:24`).
- **Qué vive la usuaria:** la dueña no es contadora; "capital en especie" o "descuadre" le suenan a reporte de contador.
- **Recomendación:** tabla de reemplazos (abajo, §4) y pasarlos al glosario.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-40 — Nombre del menú distinto del título de la pantalla; "Procesar pago" ⚪
- **Pantalla / flujo:** Menú, Vender.
- **Evidencia:** menú "Vender" → título "Nueva venta" (`pos:511`); "Estadísticas" → "¿Cómo va el negocio?" (`stats:347`); "Gastos" → "Control de gastos" (`gastos:226`). Inventario, Movimientos y Usuarios coinciden. "Procesar pago" (`CheckoutSection.tsx:240`) mientras la pantalla dice "Total a cobrar" y "Cobrada".
- **Qué vive la usuaria:** apretó "Estadísticas" y ve otro título; el botón que cierra la venta usa un verbo de sistema.
- **Recomendación:** el título repite el nombre del menú (el subtítulo ya explica); la pregunta "¿Cómo va el negocio?" pasa a ser subtítulo. Botón "Cobrar $12.50" (con la cifra).
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-41 — Abreviaturas y unidades escritas de varias formas ⚪
- **Pantalla / flujo:** Transversal.
- **Evidencia:** "Present." / "pres." / "Presentaciones" (`inventario:482,508,528,569`); "uds" / "Uds." / "unidades" / "op." / "c/u"; "Artículos" (`movimientos:774`) frente a "productos" (`pos:748`); "Merma" (Inventario) frente a "Mercadería echada a perder" (Estadísticas); "Agotado" (`inventario:524`, rojo) frente a "Sin stock registrado" (`pos:93`, ámbar) para stock ≤ 0, cuando por regla D-01 se puede vender igual; "Retiro personal" (movimiento) frente a "Lo que sacaste para ti" (Estadísticas); "($)" en la etiqueta frente a un "$" dentro del campo (`CheckoutSection.tsx:114`).
- **Qué vive la usuaria:** el mismo concepto se llama distinto según la pantalla. "Agotado" en rojo en Inventario contradice que se puede vender.
- **Recomendación:** ver tabla §4. En especial, Inventario debe decir "Sin stock" en ámbar, igual que Vender.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-42 — Errores y ayudas que no dicen qué hacer o cambian de tono ⚪
- **Pantalla / flujo:** Error, Sin permiso, Compras, validaciones.
- **Evidencia:** `app/error.tsx:26` ("contacta soporte": la tienda no tiene soporte; la dueña es la persona de contacto) y `forbidden-state.tsx:24` ("contacta al administrador"); `CompraForm.tsx:364` ("Haz clic en…", en celular se toca); `PrecioRapido.tsx:~74` (`title="Tocar para cambiar el precio"`, el `title` no existe en táctil); `pos:222` ("Por favor ingresa…") frente a las demás validaciones sin "por favor"; mensajes de error "Error al cerrar caja" (`pos:258`) frente a "No se pudo…" (`pos:359`); estados vacíos "No hay gastos registrados recientemente." y "No se encontraron turnos de caja" no dicen qué hacer.
- **Qué vive la usuaria:** mensajes de distinto tono; el de error general manda a un "soporte" que no existe.
- **Recomendación:** "Algo falló. Intenta de nuevo; si sigue, avísale a la dueña / a quien te instaló el sistema" (decidir quién); verbo "toca"; fórmula única para errores: "No se pudo [verbo]. [Qué hacer]." Estados vacíos con una acción ("Anota el primero").
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

### VIS-43 — Tres formatos de dinero y tres de fecha ⚪
- **Pantalla / flujo:** Transversal.
- **Evidencia:** dinero: `formatMoney` (`lib/format.ts:6`) en la mayoría; `toLocaleString("en-US",{style:"currency"})` en línea (`gastos:159,206,397`, `inventario:218`); y `toFixed(2)` sin `$` (`movimientos:578`) o con `$` pegado a mano (`pos:236`, `DeudasProveedores.tsx:104`). Fechas: `toLocaleDateString('es-ES')` (`gastos:383`), `'es-SV'` (`inventario:652,790`, `DeudasProveedores.tsx:44`) y `date-fns` con `"dd MMM yyyy"` (`movimientos:607,667`).
- **Qué vive la usuaria:** la misma fecha sale como "25 nov." en una pantalla y "25/11/2026" en otra; "Desc.: +0.00" no lleva `$`.
- **Recomendación:** `lib/format.ts` con `formatFecha()` y `formatFechaHora()` (es-SV) y reemplazar los usos en línea de `toLocaleString`/`toFixed`.
- **Esfuerzo:** S (<1 h)
- **Confianza:** Confirmado en código

---

## 4. Tabla de inconsistencias de lenguaje

| Término A | Término B | Dónde |
|---|---|---|
| "Caja abierta / Abrir caja" (el turno) | "Gaveta (hoy): Abierta" (la misma cosa) | `pos:516,561`; `movimientos:555-563` |
| "No hay turno abierto" | "Abre la caja en Vender" | `gastos:250`; `gastos` aviso |
| Menú "Vender" | Título "Nueva venta" | `navigation.ts`; `pos:511` |
| Menú "Estadísticas" | Título "¿Cómo va el negocio?" | `navigation.ts`; `stats:347` |
| Menú "Gastos" | Título "Control de gastos" | `navigation.ts`; `gastos:226` |
| "Procesar pago" | "Total a cobrar" / "Cobrada" | `CheckoutSection.tsx:100,240` |
| "Ticket" | "Ticket de compra" | `pos:694` / `pos:764` |
| "Descuadre" / "Desc." | "Faltó / Sobró" y "Faltan / Sobran / Cuadra" | `movimientos:578,699` / `pos:850-854`, `glosario.ts` |
| "Ingresos de los turnos mostrados" | "Vendido" | `movimientos:568` / `stats:436` |
| "Fondo siguiente turno" | "Empezó con" / "Efectivo con el que empiezas" | `pos:870` / `movimientos:685` / `AbrirCajaDialog.tsx` |
| "Agotado" (rojo) | "Sin stock registrado" (ámbar) | `inventario:524` / `pos:93` |
| "Merma" | "Mercadería echada a perder" | `inventario:626,660` / `stats` P&L |
| "Retiro personal" | "Lo que sacaste para ti" | `glosario.ts` movimiento / Estadísticas |
| "Capital de la dueña" / "aporte del dueño" | "dueña" en el resto | `CompraForm.tsx:222,299` |
| "Present." / "pres." | "Presentaciones" | `inventario:482,508,528,569` |
| "Artículos" | "productos" | `movimientos:774` / `pos:748` |
| "uds" / "Uds." / "op." | "unidades" / "ventas" | `inventario`, `stats`, `movimientos:690` |
| "Haz clic en…" | "toca…" | `CompraForm.tsx:364` / `pos:653` |
| "contacta soporte" / "contacta al administrador" | "La dueña puede cambiarla en Usuarios" | `error.tsx:26`, `forbidden-state.tsx:24` / `login:150` |
| "Por favor ingresa…" | validaciones sin "por favor" | `pos:222` |
| "¡Venta registrada!" | "Venta registrada · Total…" / "Listo: sacaste…" / "Agregado: X" | `CheckoutSection.tsx:78`; `pos:332`; `SacarDineroDialog.tsx:~159` |
| "Error al cerrar caja" | "No se pudo registrar la venta" | `pos:258` / `pos:359` |
| "Monto ($)" (en la etiqueta) | "$" dentro del campo | `SacarDineroDialog` / `CheckoutSection.tsx:114` |
| "Credenciales", "ERP" | "tu nombre y tu contraseña" | `login:95` |

---

## 5. Lo que está bien y hay que conservar

- **Tokens de color sin colores sueltos** y tema claro/oscuro completo, con `warning-text` aparte para texto.
- **`MoneyValue` en mono con cifras tabulares**: el dinero siempre se lee alineado.
- **Radio de 2 px** coherente, sin redondeos mezclados.
- **Componentes base shadcn con foco, `aria-invalid` y deshabilitado** ya resueltos.
- **Tamaño táctil de 44 px por defecto en móvil** (`h-11 md:h-8`) y `size-11` en iconos.
- **Labels asociados al 100%** y botones de ícono con nombre (L14 se mantiene).
- **`ConfirmDialog`**: dice qué pasa, foco inicial en Cancelar.
- **Cierre de caja**: la diferencia en vivo ("Cuadra / Sobran / Faltan") y el botón que cambia a "Explica la diferencia para cerrar" son el mejor ejemplo de `disabled` explicado; copiarlo.
- **"Sacar dinero"**: elegir primero qué hacer y un resumen de una frase "Vas a pasar $X…" antes de confirmar.
- **Frase de Estadísticas** ("Hoy ganaste $X (de $Y vendidos)") con "qué mirar primero" si pierde: es lo que la dueña necesita.
- **Estadísticas se atenúa mientras recarga** (`aria-busy`) en vez de borrar los números.
- **Alta rápida desde el buscador vacío** ("Agregar como producto nuevo") y el estado vacío de Vender que dice qué hacer.
- **Precio editable en línea** (`PrecioRapido`) con borde punteado como pista.
- **`aria-pressed`, `role="switch"`, `aria-current` (en el menú inferior), `role="status"` en la diferencia del cierre**.
- **Texto de la interfaz en tuteo y español de tienda**, con el glosario como fuente (aunque falta aplicarlo a "Caja", ver VIS-38).
- **Menú de usuario en celular** con cierre de sesión (resuelve UX-28).

---

## 6. Top 10 de mayor impacto con menor esfuerzo

| # | ID | Cambio | Esfuerzo |
|---|---|---|---|
| 1 | VIS-28 | `max-h-[calc(100dvh-2rem)] overflow-y-auto` en `DialogContent` y pie pegajoso | S |
| 2 | VIS-01 | `text-warning-foreground` → `text-warning-text` en `CompraForm.tsx:285` | S |
| 3 | VIS-12 | `aria-label`/`title` a los dos botones de Inventario (y mover "Inventario inicial" a "Más") | S |
| 4 | VIS-29 / 31 / 30 | Columnas y panel por `xl` en Vender, tabla desde `lg` en Inventario, barra del carrito sin offset en `md` | S |
| 5 | VIS-33 | Menú inferior de la dueña con 4 + "Más" | S |
| 6 | VIS-04 | Botón destructivo sólido para confirmar en `ConfirmDialog` | S |
| 7 | VIS-18 | Cobro fijo abajo en la hoja del ticket del celular | M |
| 8 | VIS-38 / 39 / 40 | Aplicar el glosario: Caja = turno, Gaveta = efectivo; fuera "Descuadre", "capital"; títulos = menú | S |
| 9 | VIS-23 / 24 | Foco visible en `CampoNumero` y `aria-invalid` + `role="alert"` en errores | S/M |
| 10 | VIS-06 / 05 | Una función de tono de margen y regla de color (rojo solo para error/pérdida) | S/M |

---

## 7. Pregunta final: ¿qué haría que esta app se vea "hecha en casa"?

**Cinco cosas que delatan que es casera:**

1. **Botones de colores sueltos** (ámbar, verde, rojo, azul) que cambian dentro del mismo flujo; en una app comercial el color del botón principal es siempre el mismo (VIS-03).
2. **Cada pantalla con su propia tarjeta de cifra** y tamaños de número que no siguen una escala; y alturas de botón y de campo distintas en cada formulario (VIS-11, VIS-13).
3. **Cuatro formas de "cargando" y de "no hay nada"**, y avisos que se repiten (toast, recuadro y tarjeta a la vez) en vez de uno solo (VIS-26, VIS-27).
4. **Textos con jerga y abreviaturas** ("Desc.:", "pres.", "op.", "capital en especie", "credenciales", "ERP") y el mismo concepto con tres nombres (Caja, Gaveta, Turno) (VIS-38 a VIS-41).
5. **Se rompe al cambiar de tamaño**: el nombre del producto desaparece en tablet, la barra del carrito flota, el diálogo no cabe en el celular, los íconos sin etiqueta (VIS-28 a VIS-31, VIS-12).

**Las cinco correcciones visuales más baratas que más la profesionalizan:**

1. **Altura máxima y pie pegajoso en los diálogos** (VIS-28) y subir el fondo atenuado del diálogo (VIS-08). Una línea en un componente cambia la sensación de toda la app.
2. **Un solo juego de variantes de botón** (`success`, `warning`, `destructive` sólido) y borrar los `className` de color a mano (VIS-03, VIS-04).
3. **Escalas únicas**: alturas de control (`default`, `lg`) definidas en `button.tsx`/`input.tsx` y quitar los 96 `h-11 md:h-11` (VIS-13); piso de 12 px de texto (VIS-09).
4. **Un componente `SeccionTitulo` y un `StatCard` con tamaños** para que cada bloque de Estadísticas y Movimientos empiece igual (VIS-10, VIS-11).
5. **Pasar el glosario por la pantalla con buscar y reemplazar**: Caja/Gaveta, "Descuadre"→"Faltó/Sobró", "Procesar pago"→"Cobrar $X", títulos iguales al menú, y formatos de fecha y dinero únicos (VIS-38 a VIS-43).
