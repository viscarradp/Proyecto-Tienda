# Recorrido en vivo del líder — 2026-11-25

> El líder recorrió la app en el navegador sobre la demo local (`erp_tienda_demo`): escritorio (1280 px) y celular
> (375 px), tema oscuro y claro, como dueña (`admin`) y como cajera (`karla`). Complementa los tres informes por código
> (`01-cajera.md`, `02-duena.md`, `03-diseno-visual.md`) con lo que solo se ve en pantalla. IDs `VIV-nn`. Informe
> congelado; el estado vivo va en `docs/roadmap/`.

## Resumen

| ID | Pantalla | Hallazgo | Sev. | Esfuerzo |
|---|---|---|---|---|
| VIV-01 | Movimientos | Un aporte a la **gaveta** se rotula "Dinero puesto en la **bóveda**" | 🟡 | S |
| VIV-02 | Movimientos | "¿Turno abandonado? · Cerrar forzado" aparece en el turno **activo de hoy** | 🟡 | S |
| VIV-03 | Inventario / Vender | Productos por peso muestran "45.5 uds", "4.428 uds": unidad equivocada y decimales crudos | 🟡 | M |
| VIV-04 | Inventario (celular) | La pestaña "Historial" se cae a una segunda línea | 🟡 | S |
| VIV-05 | Movimientos y Gastos (celular) | Tres/dos tarjetas de cifras llenan la primera pantalla; la tarea queda bajo el pliegue | 🟡 | S |
| VIV-06 | Transversal (tema claro) | Verde de dinero 3.7–4.0:1 y rojo 4.4:1: bajo el mínimo AA (4.5:1) en texto normal | 🟡 | S |
| VIV-07 | Inventario | El catálogo no muestra precios: hay que expandir cada producto | 🟡 | S |
| VIV-08 | Inventario | Subtítulo "Catálogo · Categorías · Compras" pero la pestaña se llama "Historial" | ⚪ | S |
| VIV-09 | Inventario | "Por revisar" aparece dos veces (categoría y etiqueta) | ⚪ | S |
| VIV-10 | Compra | Jerga: "Lotes de inventario", "Agregar lote", "Monto total calculado", "Haz clic"; título distinto al botón | ⚪ | S |
| VIV-11 | Inventario | "Inventario inicial" ocupa para siempre un botón de cabecera; en celular los botones son solo íconos | ⚪ | S |
| VIV-12 | Vender (escritorio) | La columna del código de barras va antes que el nombre y pesa más visualmente | ⚪ | S |
| VIV-13 | Estadísticas | "Ventas anuladas 0" en rojo; ratio "por cada $100" metido en la cascada de dinero | ⚪ | S |
| VIV-14 | Estadísticas | Tarjeta "Compra promedio" huérfana en una segunda fila | ⚪ | S |
| VIV-15 | Estadísticas | Dos cifras de ventas ($18.00 cobrado vs $16.75 vendido) sin explicar la diferencia | ⚪ | S |
| VIV-16 | Movimientos | Abreviaturas y métricas de relleno: "Desc.: +0.00", "1 op.", "(deuda ID 1)", "Turnos visibles" | ⚪ | S |
| VIV-17 | Transversal | Rol con género y nombre inconsistentes: "Administrador", "(Administradora)", "Cajero · POS", "Dueña" | ⚪ | S |
| VIV-18 | Gastos / Usuarios | "Control de gastos" vs menú "Gastos"; botón "Nuevo" sin decir qué | ⚪ | S |
| VIV-19 | Vender (celular) | Nombres truncados ("Coca-Cola 3…", "Jamón de pa…") | ⚪ | S |
| VIV-20 | Nuevo producto | No dice que el stock entra con una compra; placeholder del código en monoespaciada | ⚪ | S |
| VIV-21 | Movimientos (datos viejos) | Filas de apertura anteriores a L12 tienen `es_apertura=false` y muestran "Anular" | ⚪ | S |

## Hallazgos

### VIV-01 — Un aporte a la gaveta se rotula "Dinero puesto en la bóveda" 🟡
- **Pantalla / flujo:** Movimientos → turno → "Dinero que se movió en este turno".
- **Evidencia:** `lib/glosario.ts:42` da un solo rótulo a `INGRESO_CAPITAL` ("Dinero puesto en la bóveda"), pero
  `INGRESO_CAPITAL` puede ir `DUEÑOS→GAVETA` (apertura con aporte, `POST /movimientos-financieros`) o `DUEÑOS→BOVEDA`
  (inyección). En la demo, la fila 1 del turno 10 es `DUEÑOS→GAVETA` y se lee "Dinero puesto en la bóveda: Aporte de
  la dueña al abrir la caja".
- **Qué vive la usuaria:** la dueña busca "¿dónde está mi dinero?" y la pantalla le dice que esos $14.55 están en la
  bóveda cuando están en la gaveta.
- **Recomendación:** rótulo según la cuenta destino: GAVETA → "Aporte de la dueña a la gaveta"; BÓVEDA → "Dinero
  puesto en la bóveda". Revisar los demás tipos con dos destinos posibles (`EGRESO_OPERATIVO`, `PAGO_PROVEEDOR`).
- **Esfuerzo:** S · **Confianza:** Confirmado en vivo y en código.

### VIV-02 — "Cerrar forzado" se ofrece en el turno activo de hoy 🟡
- **Pantalla / flujo:** Movimientos, como dueña.
- **Evidencia:** `app/dashboard/movimientos/page.tsx:720` muestra la franja "¿Turno abandonado sin cerrar?" con el
  botón "Cerrar forzado" para **todo** turno `ABIERTA` (`isAbierta && esAdmin`), aunque se haya abierto hace minutos.
- **Qué vive la usuaria:** la dueña revisa Movimientos desde su celular mientras la cajera vende; ve un botón ámbar que
  sugiere que el turno está "abandonado" y lo cierra a la fuerza a media jornada.
- **Recomendación:** mostrarla solo si el turno se abrió antes del día de negocio actual (o hace más de ~14 h). Si no,
  dejar el cierre forzado en un menú secundario.
- **Esfuerzo:** S · **Confianza:** Confirmado en vivo y en código.

### VIV-03 — Productos por peso con "uds" y decimales crudos 🟡
- **Pantalla / flujo:** Inventario (lista) y Vender (stock por fila).
- **Evidencia:** `app/dashboard/inventario/page.tsx:524` pinta `${formatCantidad(stock)} uds` para todo producto. En la
  demo: "Frijol rojo 45.5 uds", "Jamón de pavo 9.5 uds" (se venden por libra) y "Queso duro 4.428 uds"; en Vender,
  "4.428 stock". También `:561` ("Vendido sin registrar: … uds").
- **Qué vive la usuaria:** "¿4.428 unidades de queso?". No sabe si son libras, piezas o qué; tres decimales parecen un
  error del sistema.
- **Recomendación:** mostrar la unidad base del producto (la descripción de la presentación de factor 1, p. ej.
  "Libra" → "lb") y redondear a 2 decimales ("4.43 lb"). "uds" solo cuando la unidad base es una pieza.
- **Esfuerzo:** M · **Confianza:** Confirmado en vivo.

### VIV-04 — La pestaña "Historial" se cae a otra línea en el celular 🟡
- **Pantalla / flujo:** Inventario, 375 px.
- **Evidencia:** `app/dashboard/inventario/page.tsx:371` (`TabsList` con `flex-wrap`): "Catálogo | Categorías" en
  una línea y "Historial" sola debajo, sin fondo de pestaña.
- **Qué vive la usuaria:** parece un enlace suelto, no una pestaña; se ve roto.
- **Recomendación:** `grid grid-cols-3` (o pestañas con scroll horizontal) y textos cortos en móvil.
- **Esfuerzo:** S · **Confianza:** Confirmado en vivo.

### VIV-05 — En el celular, las tarjetas de cifras empujan la tarea fuera de la pantalla 🟡
- **Pantalla / flujo:** Movimientos y Gastos, 375 px.
- **Evidencia:** Movimientos apila "Gaveta (hoy)", "Ingresos de los turnos mostrados" y "Turnos visibles" a lo ancho
  (`movimientos/page.tsx:560-580`): la lista de turnos empieza bajo el pliegue. Gastos apila "Gaveta" y "Bóveda" y el
  formulario "Nuevo gasto" empieza a media pantalla.
- **Qué vive la usuaria:** abre Gastos para anotar el pago del agua y primero tiene que bajar; en Movimientos ve tres
  números y ninguna venta.
- **Recomendación:** en móvil, cifras en una fila compacta de 2 columnas (o una sola línea resumen) y la tarea primero.
  Quitar "Turnos visibles" (ver VIV-16).
- **Esfuerzo:** S · **Confianza:** Confirmado en vivo.

### VIV-06 — Contraste del verde y el rojo de dinero en el tema claro 🟡
- **Pantalla / flujo:** todas las cifras de dinero en tema claro.
- **Evidencia:** medido en el navegador con los tokens de `app/globals.css` (tema claro): `--success` 3.67:1 sobre
  `--background` y 4.0:1 sobre `--card`; `--destructive` 4.38:1 y 4.77:1; `--warning` 2.32:1 (solo debe usarse como
  fondo o borde; para texto existe `--warning-text`, 6.18:1). El mínimo AA para texto normal es 4.5:1.
- **Qué vive la usuaria:** en el mostrador con luz de día (tema claro), los montos verdes de 12–16 px se leen lavados.
- **Recomendación:** oscurecer `--success` y `--destructive` del tema claro hasta ≥ 4.5:1 sobre `--background`, y
  verificar que ningún texto use `text-warning` (usar `text-warning-text`).
- **Esfuerzo:** S · **Confianza:** Medido.

### VIV-07 — El catálogo no muestra precios 🟡
- **Pantalla / flujo:** Inventario → Catálogo.
- **Evidencia:** columnas ID / Producto / Categoría / Stock / "Present." (cantidad de presentaciones,
  `inventario/page.tsx:528`). El precio solo aparece al expandir cada fila.
- **Qué vive la usuaria:** "¿a cuánto tengo la Coca?" obliga a expandir; revisar precios de 50 productos es expandir 50
  veces.
- **Recomendación:** mostrar el precio de la presentación principal (o "desde $X" si hay varias) en lugar de
  "1 pres.".
- **Esfuerzo:** S · **Confianza:** Confirmado en vivo.

### VIV-08 — Subtítulo de Inventario no coincide con sus pestañas ⚪
- **Evidencia:** `inventario/page.tsx:346` "Catálogo · Categorías · Compras"; las pestañas son "Catálogo",
  "Categorías", "Historial". **Recomendación:** quitar el subtítulo o igualar los nombres. **Esfuerzo:** S.

### VIV-09 — "Por revisar" duplicado ⚪
- **Evidencia:** en la lista, un producto dado de alta en caja muestra la categoría "Por revisar" **y** la etiqueta
  "Por revisar". **Recomendación:** una sola señal (la etiqueta) y la categoría real o "Sin categoría". **Esfuerzo:** S.

### VIV-10 — Jerga en el formulario de compra ⚪
- **Evidencia:** `components/inventario/CompraForm.tsx:356` "Lotes de inventario", `:358` "Agregar lote", `:364`
  "Haz clic…", `:429` "Monto total calculado"; título "Registro de compra" (`inventario/page.tsx:878`) frente al botón
  "Nueva compra". **Recomendación:** "Productos de la compra", "Agregar producto", "Toca…", "Total de la compra",
  título "Nueva compra". **Esfuerzo:** S.

### VIV-11 — Botones de cabecera de Inventario ⚪
- **Evidencia:** `inventario/page.tsx:352`. "Inventario inicial" (tarea del primer día) tiene el mismo peso que "Nueva
  compra" para siempre. En celular, ambos son solo íconos (`hidden lg:inline`).
- **Recomendación:** ocultar "Inventario inicial" cuando ya hay compras (o moverlo a un menú). En celular, mostrar la
  palabra "Compra" junto al ícono. **Esfuerzo:** S.

### VIV-12 — En Vender (escritorio) el código va antes que el nombre ⚪
- **Evidencia:** la primera columna de cada fila es el código (`7401000000011`, monoespaciado, alto contraste) y el
  nombre queda en segundo lugar. **Recomendación:** nombre primero; el código como texto secundario pequeño o solo en
  la búsqueda. **Esfuerzo:** S.

### VIV-13 — Señales de color confusas en la cascada de Estadísticas ⚪
- **Evidencia:** `stats/page.tsx:630` "Ventas anuladas" en rojo aun con 0. "Sobró en la gaveta $0.00" en negrita
  blanca y las demás líneas en gris. "Te quedan por cada $100 vendidos" (un ratio) metido entre líneas de dinero.
- **Recomendación:** color neutro cuando el valor es 0; el mismo peso para todas las líneas; el ratio fuera de la
  cascada (ya está en su tarjeta). **Esfuerzo:** S.

### VIV-14 — Tarjeta huérfana en Estadísticas ⚪
- **Evidencia:** cinco tarjetas en una grilla de cuatro (`stats/page.tsx:457`, "Compra promedio") dejan una sola en la
  segunda fila. **Recomendación:** cuatro tarjetas (bajar "Compra promedio" a la cascada) o grilla de cinco en escritorio.
  **Esfuerzo:** S.

### VIV-15 — Dos cifras de "ventas" sin explicación ⚪
- **Evidencia:** `stats/page.tsx:542` "Lo cobrado en ventas ($18.00) entra a la gaveta" y, arriba, "Vendido $16.75".
  La diferencia son $1.25 devueltos. **Recomendación:** "Cobraste $18.00 y devolviste $1.25". **Esfuerzo:** S.

### VIV-16 — Abreviaturas y métricas de relleno en Movimientos ⚪
- **Evidencia:** `movimientos/page.tsx:578` "Desc.: +0.00"; `:690` "1 op."; "(deuda ID 1)" en el abono; `:568`
  "Ingresos de los turnos mostrados" (cambia según cuántos turnos haya cargado la paginación); `:572` "Turnos
  visibles". **Recomendación:** palabras completas ("Descuadre", "1 venta", "Distribuidora La Fuente"); quitar
  "Turnos visibles"; titular el total "Ventas de estos 7 turnos". **Esfuerzo:** S.

### VIV-17 — Nombre y género del rol inconsistentes ⚪
- **Evidencia:** `components/nav/sidebar.tsx:35` "Administrador" / "Cajero · POS"; pie del menú "(Administradora)";
  Usuarios "Dueña (administradora)". **Recomendación:** un solo par en `lib/glosario.ts`: "Dueña" y "Cajera" (o neutros
  "Administración" y "Caja"). **Esfuerzo:** S.

### VIV-18 — Títulos y botones que no dicen qué ⚪
- **Evidencia:** `gastos/page.tsx:226` "Control de gastos" (el menú dice "Gastos"); Usuarios: botón "Nuevo".
  **Recomendación:** título igual al menú; "Nuevo usuario". **Esfuerzo:** S.

### VIV-19 — Nombres truncados en Vender (celular) ⚪
- **Evidencia:** a 375 px: "Coca-Cola 3…", "Jamón de pa…": el stock y el precio se quedan con el ancho.
  **Recomendación:** permitir dos líneas al nombre (`line-clamp-2`) y achicar la columna de stock. **Esfuerzo:** S.

### VIV-20 — Nuevo producto no dice cómo entra el stock ⚪
- **Evidencia:** el diálogo pide código, nombre, categoría y presentaciones, pero nunca existencias. El placeholder del
  código va en monoespaciada. **Recomendación:** texto de ayuda: "Las existencias se cargan con una compra o con
  Inventario inicial". Placeholder en la fuente normal. **Esfuerzo:** S.

### VIV-21 — Aperturas viejas muestran "Anular" ⚪ (dato, no código)
- **Evidencia:** la fila 1 del turno 10 de la demo es una apertura creada antes de L12 (`es_apertura=false`), así que
  `movimientos/page.tsx:759` muestra "Anular". Con datos nuevos no pasa. En Supabase pasará con las aperturas
  anteriores al `db push` (no hay datos importantes). **Recomendación:** ninguna en código; si se conservan datos
  viejos, marcar esas filas con un `UPDATE` puntual. **Esfuerzo:** S.

## Lo que está bien (conservar)

- "Este mes ganaste $X (de $Y vendidos)" arriba de Estadísticas: responde la pregunta en una línea.
- El panel del ticket en escritorio, los billetes rápidos y el "Procesar pago" grande.
- "Sin stock registrado · vendido sin registrar" en la fila del POS: avisa sin bloquear.
- Gastos anulados tachados con motivo y autor ("Era $6, no $60 — admin").
- La explicación en Usuarios ("se desactivan, no se borran").
- La sesión de la cajera: solo Vender, Inventario y Movimientos en la barra inferior.
- Aviso de venta registrada en el celular, abajo y sin tapar la barra del cobro.
