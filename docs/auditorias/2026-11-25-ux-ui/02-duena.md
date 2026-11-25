# Auditoría UX/UI — la dueña (gestión)

> Fecha: 2026-11-25. Lente: la dueña, que no es contadora y quiere saber si gana, dónde está su dinero y qué tiene que
> comprar o arreglar. Solo lectura sobre `erp-tienda-frontend/` (más lectura puntual del backend para confirmar qué datos
> llegan a la pantalla). Nada se ejecutó en el navegador: lo que solo se ve en pantalla va marcado **Hipótesis: ver en
> vivo**. Lo resuelto en la auditoría de ayer (UX-01…UX-30) no se repite; lo que sigue vivo va como `(persiste UX-nn)`.

## 1. Resumen

1. **Lo de ayer mejoró mucho.** Estadísticas ya abre con "Este mes ganaste $X", hay glosario Gaveta/Bóveda, anular sin
   borrar, deudas con abono, buscador y precio en un toque. La base es buena.
2. **Lo más peligroso es de dinero y de confianza en los números:** una compra no se puede registrar con el costo exacto de
   un six-pack ni con centavos repetidos (el total no coincide con la factura), el diálogo de compra pierde todo lo escrito
   con un clic afuera, y la **ganancia sale inflada sin aviso** cuando se vendió algo sin costo registrado.
3. **La dueña no puede auditar su dinero:** no hay libro de la bóveda en pantalla (el endpoint existe), el cierre de turno no
   muestra cuánto "debía haber" ni la explicación que escribió la cajera, y el dinero está repartido en cuatro pantallas.
4. **La pantalla de Estadísticas responde en 10 segundos si se gana o se pierde, pero no si "va bien"** (sin comparación) y
   un aviso fijo de bóveda la empuja hacia abajo; repite cifras y tiene dos "Vendido" distintos.
5. **Tareas administrativas largas:** cargar el inventario inicial (~5 toques por línea, sin importar ni escáner con foco),
   contar el inventario (no existe "conteo": hay que calcular la diferencia a mano por producto) y revisar "por revisar"
   (5–6 toques por producto).

**Total: 43 hallazgos — 3 🔴, 30 🟡, 10 ⚪.**

| ID | Pantalla | Título | Sev. | Esf. |
|---|---|---|---|---|
| DUE-01 | Inventario / Compra | Costo y cantidad solo en unidad base y con tope de 2 decimales: el total no coincide con la factura | 🔴 | M |
| DUE-02 | Inventario / Compra | El diálogo de compra e inventario inicial pierde todo con un clic afuera o Esc | 🔴 | S |
| DUE-03 | Inventario / Compra | Los avisos de la compra se pierden (el diálogo se cierra antes de mostrarlos) | 🟡 | S |
| DUE-04 | Inventario / Compra | Cargar muchos productos: línea nueva sin foco, al final, sin avisar duplicados | 🟡 | M |
| DUE-05 | Inventario | "Contar el inventario" no existe: hay que calcular la diferencia a mano, producto por producto | 🟡 | L |
| DUE-06 | Inventario | "Inventario inicial" y "Nueva compra" son solo íconos en celular y tablet (persiste UX-26/27) | 🟡 | S |
| DUE-07 | Inventario | El stock se muestra en unidades base; el POS ya lo muestra en six-packs | 🟡 | S |
| DUE-08 | Inventario | Nada responde "¿qué tengo que comprar?": sin filtro de agotados ni orden | 🟡 | M |
| DUE-09 | Inventario | Cambiar el precio no muestra el costo ni cuánto se gana | 🟡 | M |
| DUE-10 | Inventario | Revisar "por revisar" toma 5–6 toques por producto y la marca no se limpia sola | 🟡 | M |
| DUE-11 | Inventario | Cada acción recarga toda la pantalla con spinner (se pierde el lugar) | 🟡 | S |
| DUE-12 | Inventario | Historial de compras sin buscador ni paginación; la pestaña se llama "Historial" | 🟡 | M |
| DUE-13 | Inventario / Producto | Crear producto: tres nombres para lo mismo y no hay "siguiente paso" (cargar stock) | 🟡 | S |
| DUE-14 | Inventario | "Desactivar" a veces borra de verdad y el botón no es destructivo | ⚪ | S |
| DUE-15 | Gastos / Movimientos | Anular solo sirve con el turno abierto y el botón desaparece sin explicar | 🟡 | S |
| DUE-16 | Gastos | No se puede ver "cuánto llevo este mes" por categoría; lista de 15 sin filtro | 🟡 | M |
| DUE-17 | Gastos / Deudas | Las deudas viven al fondo de "Control de gastos", por compra y con proveedor de texto libre | 🟡 | M |
| DUE-18 | Gastos / Deudas | Si falla la carga de deudas, la sección desaparece sin aviso | 🟡 | S |
| DUE-19 | Gastos | Gaveta sin turno no muestra monto y "Gaveta" sigue como origen por defecto | 🟡 | S |
| DUE-20 | Gastos | Nueva categoría: el error sale detrás del diálogo; "Fijo/Variable" es jerga sin uso | ⚪ | S |
| DUE-21 | Movimientos | El cierre de turno no muestra lo esperado, lo vendido ni la explicación de la cajera | 🟡 | M |
| DUE-22 | Movimientos | Buscar por fecha no funciona con lo que se ve en pantalla; no hay selector de fecha | 🟡 | S |
| DUE-23 | Movimientos | Tarjetas "Ingresos de los turnos mostrados" y "Desc." sin período claro ni signo de dinero | 🟡 | S |
| DUE-24 | Movimientos / Estadísticas | No hay libro de la bóveda en pantalla (el endpoint ya existe) | 🟡 | M |
| DUE-25 | Movimientos | Escribir un número de venta también filtra los turnos con ese id | ⚪ | S |
| DUE-26 | Movimientos | Cierre forzado y anular venta: copy de sistema ("Solo ADMIN", "balance") y error fuera del diálogo | ⚪ | S |
| DUE-27 | Estadísticas | La ganancia sale inflada si se vendió sin costo registrado (costo $0) y nada avisa | 🔴 | M |
| DUE-28 | Estadísticas | "Hoy perdiste" / "Este mes perdiste" sin comparación ni contexto puede llevar a decidir mal | 🟡 | M |
| DUE-29 | Estadísticas | El aviso de bóveda inicial es permanente y empuja la respuesta principal | 🟡 | S |
| DUE-30 | Estadísticas | "Vendido" aparece con dos cifras distintas en la misma pantalla | 🟡 | S |
| DUE-31 | Estadísticas | "Faltó en la gaveta" incluye lo que falta en la bóveda; el arqueo no avisa que baja la ganancia | 🟡 | S |
| DUE-32 | Estadísticas | "¿Dónde está mi dinero?" está partido en tres bloques y las deudas quedan afuera | 🟡 | M |
| DUE-33 | Estadísticas | No se ve qué productos "no dejan": tabla ordenada por unidades y cortada en 15 | 🟡 | M |
| DUE-34 | Estadísticas | Tres umbrales distintos de "buen margen" (15, 25 y 10) | ⚪ | S |
| DUE-35 | Estadísticas | 5 tarjetas en rejilla de 4, "Equipo y muebles" siempre $0 y verde con $0 | ⚪ | S |
| DUE-36 | Navegación | La dueña aterriza en Vender, no en cómo va el negocio | 🟡 | S |
| DUE-37 | Navegación | Los nombres del menú no son los que la dueña busca y el dinero está repartido | 🟡 | M |
| DUE-38 | Navegación | Seis ítems en la barra inferior de 375 px: etiquetas apretadas | ⚪ | S |
| DUE-39 | Navegación | Textos de sistema: "Administrador", "Cajero · POS", "contacta al administrador" | ⚪ | S |
| DUE-40 | Usuarios | Crear a la cajera: no confirma la contraseña ni dice cuál es su usuario de entrada | 🟡 | S |
| DUE-41 | Usuarios | La dueña puede cambiarse el rol a sí misma sin confirmación | ⚪ | S |
| DUE-42 | Lenguaje | Jerga contable y de sistema que se coló (lote, múltiplo, descuadre, declarado, capital…) | 🟡 | S |
| DUE-43 | Lenguaje | Fechas con tres formatos y números sin $ o con signos distintos | ⚪ | S |

---

## 2. Recorrido de tareas de la dueña

Los toques se cuentan desde el menú, sin contar el teclado. Son estimaciones leídas del código (cada selector cuenta 2:
abrir y elegir). "Sabe que salió bien" = qué confirmación recibe.

### 2.1 Primer día: cargar el inventario inicial y declarar el efectivo guardado
- **Pasos:** (a) Inventario → pestaña Categorías → escribir → Crear (por categoría: ~3 toques). (b) "Nuevo producto" por cada
  producto (~10 toques, ver 2.2). (c) Botón "Inventario inicial" → por **cada línea**: Agregar lote, abrir selector de
  producto, buscar, elegir, cantidad, costo = ~5 toques; al final "Cargar inventario inicial". (d) Efectivo guardado:
  Estadísticas → asistente "¿Cuánto efectivo tienes guardado…?" → escribir → Guardar (3 toques). (e) El efectivo de la
  gaveta se declara al abrir turno en Vender (fuera de mi alcance).
- **Toques para 40 productos:** ~40×10 + 40×5 ≈ 600. No hay importación ni lista de tareas.
- **Tiene que saber de antemano:** que el inventario inicial es un botón aparte (en pantallas menores a `lg` es solo un ícono,
  DUE-06); qué es un "lote"; que el costo se escribe **por unidad base** (DUE-01); que la bóveda inicial se declara en
  *Estadísticas* y no en Inventario ni en Gastos.
- **¿Sabe que salió bien?** Parcial: toast de 8 s en la compra; el aviso de la bóveda solo desaparece al guardar. No hay un
  "ya cargaste N productos con stock" ni una lista de qué falta (productos sin lote quedan "Agotado").
- **Puntos de duda:** DUE-01, DUE-02, DUE-04, DUE-06, DUE-13, DUE-29, DUE-42.

### 2.2 Crear un producto con dos presentaciones (unidad y six-pack) y código de barras
- **Pasos:** Inventario → "Nuevo producto" (1) → escanear código (el campo ya tiene foco) → Nombre (1) → Categoría (0 si repite
  la última, 2 si no) → Unidad ya viene con "Unidad", factor 1: precio (1) → "Agregar" (1) → descripción "Six-pack" (1) →
  código del six-pack (1) → múltiplo 1→6 (1) → precio (1) → "Crear producto" (1). **≈10 toques.**
- **Tiene que saber:** que "Múltiplo" = unidades que trae; que el código de la primera presentación va arriba y el de las demás
  dentro de su tarjeta (`ProductDialog.tsx:215-226` vs `305-312`).
- **¿Sabe que salió bien?** Sí: toast "Producto «X» creado". Pero no hay siguiente paso (cargar cuánto tiene y cuánto costó). DUE-13.

### 2.3 Cambiar el precio de un producto
- **Pasos:** Inventario (1) → buscar (escribir) → tocar el producto para abrirlo (1) → tocar el precio con borde punteado (1) →
  escribir → Enter o "Guardar" (1). **4 toques.** Mejor que ayer (era 4 + diálogo con historial).
- **Tiene que saber:** que el precio con borde punteado es tocable (solo hay un `title`, que en celular no se ve).
- **¿Sabe que salió bien?** Sí: toast "cambiado de $A a $B". Pero tras guardar toda la lista se recarga con spinner (DUE-11) y no
  se le muestra el costo ni la ganancia del nuevo precio (DUE-09).

### 2.4 Registrar una compra pagada desde la gaveta y otra al crédito
- **Pagada:** Inventario → "Nueva compra" (1, en celular solo ícono) → Proveedor (escribir) → Estado (ya "Pagado") → "¿De dónde
  salió el dinero?" (2) → por línea: Agregar lote (1), producto (2), cantidad (1), costo (1) → "Registrar compra" (1).
  **≈8 toques + 5 por producto adicional.** Si se equivoca de origen o falta turno, el error aparece dentro del formulario.
- **Al crédito:** igual, cambiando Estado (2) y sin origen. El texto del formulario y el toast dicen "la pagas desde Gastos →
  Deudas": bien.
- **Tiene que saber:** que la **cantidad y el costo van por unidad base** (si compró 4 six-packs de 6 a $5 cada uno, debe
  escribir 24 y $0.8333, que el campo no acepta). DUE-01.
- **¿Sabe que salió bien?** Toast de 8 s. Los **avisos** (p. ej. "la gaveta quedó en −$5") **no llegan a verse** porque el diálogo
  se cierra al terminar (DUE-03).

### 2.5 Abonar a una deuda con un proveedor
- **Pasos:** Gastos (1) → bajar hasta "Deudas con proveedores" (en celular está después del formulario completo) → "Pagar /
  abonar" (1) → el monto ya trae la deuda completa → origen "Gaveta" por defecto → "Registrar pago" (1). **3 toques + scroll.**
- **Puntos de duda:** si no hay turno abierto, el default "Gaveta" falla (DUE-19); no hay forma de pagar "todo lo de Pepsi"
  porque se lista por compra (DUE-17). Si la carga falla la sección desaparece (DUE-18).
- **¿Sabe que salió bien?** Toast "Abono registrado"; la tarjeta baja de saldo. Bien.

### 2.6 Registrar un gasto (luz, agua) y anular uno mal registrado
- **Registrar:** Gastos (1) → monto (escribir) → origen (ya Gaveta) → descripción (escribir) → categoría (2, opcional) →
  "Registrar gasto" (1). **≈3–5 toques.** No hay atajos de "Luz", "Agua", "Internet" (hay que escribir cada vez).
- **Anular:** en "Últimos gastos" → "Anular" (1) → motivo (escribir) → "Anular" (1). **2 toques**, con confirmación que dice qué
  pasa con el dinero. Bien. **Pero** el botón solo aparece si el gasto es de la bóveda o de la gaveta *del turno que sigue
  abierto*; un gasto mal registrado ayer desde la gaveta no tiene botón y no se explica por qué (DUE-15).
- **¿Sabe que salió bien?** Toast + avisos como toast de 12 s. Bien.

### 2.7 Revisar los productos "por revisar" que dio de alta la cajera
- **Pasos:** Inventario (1) → banner ámbar "N productos por revisar" → "Ver solo los por revisar" (1) → tocar el producto (1) →
  "Editar" (1) → corregir precio/categoría → "Guardar cambios" (1) → (el diálogo se cierra) → "Ya lo revisé" (1).
  **5–6 toques por producto.**
- **Duda:** la edición no limpia la marca; "Ya lo revisé" no verifica nada; no se ve el costo ni quién lo creó (DUE-10).
- **¿Sabe que salió bien?** El producto desaparece del filtro; no hay toast. Débil.

### 2.8 Contar el inventario y ajustar
- **Pasos por producto:** Inventario → buscar → tocar producto → "Encontré producto" o "Registrar merma" → (si "quitar") elegir
  lote → escribir **la diferencia** → tipo ("Ajuste de conteo") → "Sumar al inventario"/"Registrar merma". **≈7 toques por producto**
  y la dueña tiene que restar mentalmente "lo que cuento − lo que dice el sistema", **en unidades base** y por lote.
- **No existe** una pantalla de conteo ("escribe lo que contaste y el sistema ajusta"). DUE-05.
- **¿Sabe que salió bien?** Toast "Se sumaron N". Una pérdida por conteo cae en "Mercadería echada a perder" de Estadísticas
  (DUE-31/42), que suena a otra cosa.

### 2.9 "¿Cuánto gané este mes?" y "¿cuánto gané hoy?"
- **Este mes:** Estadísticas (1). La pantalla abre en "Este mes" con la frase "Este mes ganaste $X (de $Y vendidos)": **1 toque,
  menos de 10 s.** **Hoy:** botón "Hoy" (1 más).
- **Riesgos:** DUE-27 (ganancia inflada), DUE-28 (hoy/mes sin contexto), DUE-29 (aviso de bóveda arriba), DUE-30 (dos "Vendido").
- **¿Sabe que salió bien?** Sí, es de lo mejor de la app.

### 2.10 "¿Dónde está mi dinero?" (gaveta, bóveda, deudas)
- **Pasos:** Estadísticas (1) → bajar: bloque Bóveda (saldo) → "Lo que vale el negocio" (Efectivo = Gaveta + Bóveda, en letra
  de 10 px) → "Entradas y salidas de dinero" (de nuevo Gaveta y Bóveda) → las **deudas por proveedor** no están: hay que ir a Gastos.
  **3–4 pantallas/bloques para armar una respuesta.** DUE-32, DUE-24, DUE-37.
- **Sabe que salió bien:** no hay un total "tengo en mano: $X; debo: $Y".

### 2.11 Arqueo de bóveda con faltante
- **Pasos:** Estadísticas (1) → bajar hasta Bóveda (en celular pasa 1.5 pantallas por la cabecera y 5 tarjetas) → "Contar la
  bóveda" (1) → escribir lo contado → ve "pasará de $A a $B: faltan $C" → si ≥ $1, motivo obligatorio (escribir) →
  "Confirmar: dejar $B" (1). **3 toques.** Muy bien resuelto (diferencia en vivo, motivo explicado).
- **Duda:** el aviso final no dice que **el faltante baja la ganancia del mes** (DUE-31); y el dinero que "falta" por un retiro
  personal no anotado se cuenta como pérdida del negocio.

### 2.12 Encontrar una venta de ayer y ver qué se vendió
- **Con número:** Movimientos (1) → escribir el número → aparece la venta abierta con su desglose: **1 toque.** Muy bien.
- **Sin número:** Movimientos (1) → tocar el turno de ayer (1; es el segundo de la lista) → tocar la venta por hora/monto (1) →
  desglose por producto. **3 toques**, pero no se puede buscar por producto, monto ni fecha con selector; escribir la fecha como
  se ve ("24 nov") **no filtra** (DUE-22).
- **¿Sabe que salió bien?** Sí, ve nombre de producto, cantidad y precio c/u y quién vendió.

### 2.13 Revisar el cierre de turno y entender un descuadre
- **Pasos:** Movimientos (1) → turno (el encabezado ya muestra "Empezó con / Ventas N op. / Cierre declarado / Descuadre
  faltó $X") → abrir el turno (1) → ve "Dinero que se movió en este turno" con quién hizo cada cosa.
- **Lo que falta para entenderlo:** cuánto debía haber ("esperado"), cuánto se vendió en dinero, y **la explicación que la
  cajera escribió al cerrar** (el servidor la guarda en `observaciones` pero la pantalla no la pide ni la pinta). DUE-21.
- **¿Sabe que salió bien?** Sabe que faltó; no sabe por qué.

### 2.14 Crear a la cajera, cambiarle la contraseña y desactivarla
- **Crear:** Usuarios (1) → "Nuevo" (1) → nombre → rol (ya "Cajera") → contraseña → "Guardar" (1). **3 toques.**
- **Contraseña:** "Contraseña" (1) → escribir → "Guardar" (1). **2 toques.**
- **Desactivar:** "Desactivar" (1) → confirmación que explica qué pasa y que se puede revertir → "Desactivar" (1). **2 toques.**
  Muy bien explicado (botón destructivo, texto claro).
- **Dudas:** la contraseña no se ve ni se confirma, y no se dice que "Nombre" es lo que la cajera escribe para entrar (DUE-40).

---

## 3. Arquitectura de la información

### 3.1 ¿El menú tiene los nombres correctos?
Menú de la dueña (`lib/navigation.ts:33-40`): **Vender · Inventario · Movimientos · Gastos · Estadísticas · Usuarios.**

| Nombre actual | Lo que la dueña espera / lo que hay | Veredicto |
|---|---|---|
| Vender | La caja. | Bien. |
| Inventario | Productos, categorías, compras, mermas. | Bien, aunque la pestaña "Historial" no dice de qué (compras y mermas). |
| Movimientos | Turnos, ventas, cierres, salidas de dinero. | Ambiguo: la dueña buscaría "Ventas" o "Cierres / Turnos". "Movimientos" suena a movimientos de dinero. |
| Gastos | Gastos **y deudas con proveedores**. | Incompleto: las deudas no se anuncian. |
| Estadísticas | La pantalla se titula "¿Cómo va el negocio?". | Nombre técnico; la propia pantalla usa otro. |
| Usuarios | Cajera y dueña. | Bien. |

### 3.2 ¿Cada cosa está donde la dueña la buscaría?
- **Deudas con proveedores en Gastos:** razonable ("lo que pago"), pero están al fondo, después del formulario y sin entrada
  propia (DUE-17). Las **compras** (que originan la deuda) están en Inventario.
- **Bóveda en Estadísticas:** el *saldo* sí es información de "cómo va"; pero los botones **Poner dinero / Contar la bóveda**
  son acciones y viven en una pantalla de lectura. Además "Traer de la bóveda", "Retiro personal" y "Aporte de capital" están
  en Vender → "Sacar dinero". Resultado: **cuatro lugares para mover dinero** (Vender, Gastos, Estadísticas, Inventario→Compra).
- **Efectivo de la gaveta** aparece en Gastos (solo con turno abierto), Movimientos (solo "Abierta/Cerrada", sin monto) y
  Estadísticas (Patrimonio y Flujo). Tres respuestas distintas a "¿cuánto hay en la gaveta?".
- **Pendientes de la dueña** (productos "por revisar", "vendido sin registrar", turno abandonado, bóveda negativa, deudas): cada
  uno vive en una pantalla distinta y ninguno se anuncia fuera de ella.
- **Reportes por producto ("qué no me deja")**: solo una tabla cortada en 15 dentro de Estadísticas.

### 3.3 Estadísticas (1033 líneas): ¿qué ve primero, qué sobra, qué falta?
Orden actual (`stats/page.tsx`): asistente de bóveda inicial (condicional, 400) → **frase de cabecera** (424) → 5 KPI (427-463) →
Bóveda (466) → Lo que vale el negocio (497) → Entradas y salidas de dinero (529) → Gráfico "Lo que más vendes" (548) →
Cómo salió la ganancia (588) + tabla de productos (637).

- **Ve primero (bien):** la frase "Este mes ganaste/perdiste $X (de $Y vendidos)" con color. Responde "¿estoy ganando?" en 10 s.
- **Sobra / se repite:**
  - Los 5 KPI repiten cifras que vuelven a salir en "Cómo salió la ganancia" (Ganancia, Vendido, Lo que costó, Por cada $100).
  - Gaveta y Bóveda salen tres veces (Bóveda, Patrimonio>Efectivo, Flujo).
  - Gráfico y tabla muestran los mismos productos.
  - "Compra promedio" no ayuda a decidir nada.
- **Falta:** comparación con el período anterior; un aviso de "ganancia poco confiable" cuando hay ventas sin costo (DUE-27);
  deudas junto al dinero; qué hay que comprar o arreglar (agotados, por revisar, vendido sin registrar, deuda vencida).

### 3.4 Reorganización propuesta (concreta, sin tocar reglas de negocio)
**Opción mínima (S–M, recomendada primero):**
1. Que la dueña **aterrice en Estadísticas** (`getHomeRoute`), no en Vender (DUE-36).
2. Renombrar: Estadísticas → **"Mi negocio"** (o "¿Cómo voy?"); Movimientos → **"Ventas y turnos"**; Gastos → **"Gastos y deudas"**;
   pestaña "Historial" de Inventario → **"Compras y mermas"** (DUE-37).
3. En Estadísticas, **tres bloques en este orden:** (a) la frase + período + un renglón "Qué hacer" (pendientes); (b) **"Mi
   dinero"**: Gaveta · Bóveda · = Efectivo total, **− Lo que debo** (con enlace a Deudas), y los botones Poner/Contar; (c) "Cómo salió
   la ganancia" (la lista que ya existe) con los KPI eliminados por duplicados. "Entradas y salidas" y "Lo que vale el negocio"
   pasan a un bloque plegable "Más detalle". Productos: una sola tabla con botón "Lo que menos deja" (DUE-33).
4. En Gastos, subir **"Deudas con proveedores"** arriba del formulario cuando haya deudas (o poner pestañas "Gastos | Deudas").

**Opción completa (L):** una pantalla **"Dinero"** que reúna Gaveta, Bóveda (con su libro, DUE-24), Gastos, Deudas, y las
acciones Poner/Contar/Traer/Retiro; Estadísticas queda solo para "¿gano?" y productos. Eso reduce de cuatro a un lugar el
"mover y ver dinero".

---

## 4. Comprensión de los números

| Cifra | Dónde | Qué significa | ¿Se entiende sin contador? | ¿Coincide con otra pantalla? | Signo/color | ¿Dice el período? |
|---|---|---|---|---|---|---|
| "Este mes ganaste $X" | Estadísticas, cabecera | Utilidad neta del período | Sí (frase + nota "después de pagar mercadería, gastos y faltantes") | Es la misma "Ganancia" del KPI y del P&L | Verde/rojo bien | Sí ("Hoy", "Este mes", "7 días") |
| KPI "Vendido" | Estadísticas | Ventas − devoluciones | Sí | **No**: el P&L muestra otro "Vendido" (bruto) (DUE-30) | Neutro | Implícito |
| P&L "Vendido" | Estadísticas | Ventas brutas | Sí | **No** coincide con el KPI si hay devoluciones | Neutro | Sí (título) |
| "Lo que costó lo vendido" | Estadísticas | Costo FIFO | Sí | Sí | Ámbar (sin razón) | Implícito |
| "Te quedan por cada $100 vendidos (antes de gastos)" | Estadísticas | Margen bruto % | Sí (buena traducción) | Umbral de color distinto en tabla (DUE-34) | Verde si ≥15 | Implícito |
| "Compra promedio" | Estadísticas | Ticket promedio | Sí | No aparece en otra | Azul | Implícito |
| "Faltó en la gaveta" | Estadísticas P&L | Faltantes de gaveta **y de bóveda** | **No**, el nombre miente (DUE-31) | — | "− $" muted | Sí |
| "Mercadería echada a perder" | Estadísticas P&L | Mermas: quebrado, vencido, robo, **conteo** | Parcial (DUE-31/42) | Inventario las llama "Mermas y conteos" | "− $" muted | Sí |
| Bóveda $X | Estadísticas, Gastos | Saldo de la bóveda | Sí | Gastos dice "Dinero disponible" aunque sea $0 (verde) | Verde ≥0; negativo explicado | **Sin período** (hoy) |
| Patrimonio "Lo que vale el negocio" | Estadísticas | Mercadería + efectivo + equipo − deudas | Parcial: "Equipo y muebles" siempre $0 | Efectivo = Gaveta+Bóveda de otros bloques | Verde/rojo | "— hoy" |
| "Lo que debes" | Estadísticas | Suma de saldos pendientes | Sí | = "Total adeudado" en Gastos (otro nombre) | Rojo con "−" | Hoy |
| Gaveta $X | Gastos | Efectivo esperado del turno abierto | Sí con turno; **sin turno no hay monto** | Estadísticas sí lo muestra (remanente) (DUE-19) | Neutro | Turno actual |
| "Ingresos de los turnos mostrados" | Movimientos | Ventas − devoluciones de los turnos cargados | Parcial: "mostrados" depende de cuántos cargó | Estadísticas lo llama "Vendido" (DUE-23) | Neutro | **No** |
| "Turnos visibles · Desc.: +5.00 (sobró)" | Movimientos | Suma de diferencias de cierre | **No** ("Desc.", sin $) | — | Verde con 0 | No |
| "Ventas 12 op." (por turno) | Movimientos | Cantidad de ventas **incluidas anuladas** | **No** ("op.") y no dice dinero | Las cards solo suman completadas | Verde (es conteo) | Turno |
| "Cierre declarado" / "Descuadre faltó $X" | Movimientos | Efectivo contado y diferencia | "Declarado" y "Descuadre" son jerga | — | Rojo/verde bien; "declarado" en ámbar (parece alerta) | Turno |
| Margen por producto "$32.50" y pastilla | Estadísticas tabla | Ganancia por cada $100 | Sí | Umbrales 25/10 vs 15 | Verde/ámbar/rojo | Sí |
| Stock "44 uds" | Inventario | Unidades base | Parcial para six-pack (DUE-07) | POS muestra "7 six-packs + 2" | Verde/"Agotado" | Hoy |
| Costo "@ $0.85" en lotes | Inventario | Costo por unidad base | **No** ("@") | — | Neutro | — |

**Jerga contable colada:** "Lotes de inventario activos", "Múltiplo", "Factor conversión", "Estado de pago", "Capital de la dueña",
"aporte del dueño en especie", "Origen del inventario", "Descuadre", "Cierre declarado", "Desc.", "op.", "Turno #", "Cerrar
forzado — Solo ADMIN", "balance de la caja", "Tipo de gasto: Fijo/Variable", "Present.", columna "ID" con ceros (0007).

### Respuestas explícitas
- **¿En 10 segundos la dueña sabe si este mes va bien?** **Sabe si gana o pierde**, sí (la frase de cabecera es muy buena). **No sabe si "va bien"**: no hay comparación
  con el mes pasado ni con una meta, y si el aviso de bóveda inicial está visible, la respuesta queda debajo. Además la cifra
  puede estar inflada (DUE-27).
- **¿Algún número puede llevarla a una mala decisión?** Sí, tres:
  1. **Ganancia inflada** cuando se vendió sin stock/costo (costo estimado $0) o un producto "por revisar" sin compra: cree que
     ganó más (DUE-27). Podría comprar de más o retirar dinero que no existe.
  2. **Costo de una compra mal calculado** por tener que dividir un six-pack en unidades con 2 decimales (DUE-01): el total
     pagado en el sistema no coincide con la factura y el costo FIFO sale distinto.
  3. **"Hoy perdiste"/"Este mes perdiste"** por un gasto grande de un día (luz, alquiler) sin comparar (DUE-28); y "Faltó en la
     gaveta" que incluye bóveda (DUE-31) puede hacerle sospechar de la cajera por un faltante de la bóveda.
- **¿Qué tarea administrativa frecuente toma demasiados pasos?** Cargar productos e inventario inicial (~15 toques por producto),
  **contar el inventario** (~7 por producto y con resta mental) y **revisar "por revisar"** (5–6).
- **¿Las listas largas se pueden buscar y filtrar donde hace falta?**
  - Productos: **buscador sí** (nombre, presentación, código, sin acentos); **filtro** solo "por revisar" y "desactivados"; sin
    agotados, categoría ni orden (DUE-08).
  - Compras (historial): **no** (DUE-12). Mermas: últimas 30 sin filtro.
  - Gastos: últimos 15, **sin** buscador ni mes (DUE-16).
  - Movimientos: por número de venta sí; por fecha, producto o monto **no** (DUE-22).
  - Deudas: sin buscador (hoy son pocas). Productos top: sin buscador, 15 máximo.

---

## 5. Inventario de controles por pantalla

Leyenda: "Deshab." = se deshabilita mientras trabaja; "Conf." = confirmación si es destructivo.

### 5.1 Inventario (`app/dashboard/inventario/page.tsx` + `components/inventario/*`)
| Control | Qué hace | Variante / jerarquía | Feedback | Deshab. | Conf. | Problema |
|---|---|---|---|---|---|---|
| "Inventario inicial" (cabecera) | Abre el formulario de carga inicial | outline; texto solo en `lg`+ | — | no | n/a | **Sin texto ni `aria-label` bajo 1024 px** (DUE-06) |
| "Nueva compra" | Abre el formulario de compra | outline; texto solo en `sm`+ | — | no | n/a | **Solo ícono de camión en celular** (DUE-06) |
| "Nuevo producto" / "Producto" | Abre alta de producto | default (único primario) | — | no | n/a | Bien |
| Buscador | Filtra productos | input | filtra al escribir | n/a | n/a | Bien; sin filtros extra (DUE-08) |
| "Ver desactivados" | Cambia la lista | outline/default según estado | cambia título | no | n/a | Bien |
| "Ver solo los por revisar" | Filtra por revisar | outline ámbar | cambia texto | no | n/a | Bien |
| Fila del producto | Abre/cierra detalle | fila clicable | chevron | no | n/a | Todas las acciones están dentro del acordeón |
| "Ya lo revisé" | Quita la marca | default sm | spinner | sí | no | No verifica nada (DUE-10) |
| "Editar" / "Agregar" / "Desactivar" | Abren diálogos | los tres outline sm iguales | — | no | "Desactivar" sí | Tres botones con el mismo peso; "Desactivar" a veces **borra** y no es destructivo (DUE-14) |
| Precio con borde punteado | Edición en el lugar | botón punteado | toast con "de $A a $B" | sí (input/Guardar) | no (reversible, deja historial) | Poco evidente que se toca (solo `title`); sin costo ni margen (DUE-09) |
| "Registrar merma" / "Merma" (por lote) | Quita unidades | outline ámbar | toast | sí | no (se puede anular) | La palabra "merma" ok; no hay "contar" (DUE-05) |
| "Encontré producto" | Suma unidades | outline verde | toast | sí | no | Nombre claro (bien) |
| Tabs Catálogo/Categorías/Historial | Cambia de vista | tabs | — | no | n/a | "Historial" vago (DUE-12) |
| Borrar categoría (ícono papelera) | Borra categoría | ghost icon con `aria-label` | ConfirmDialog | sí | sí | Bien |
| "Anular compra" / "Anular" merma | Anula sin borrar | outline sm | toast | sí | sí (con motivo) | Bien; escondido en el acordeón |
| Compra: "Estado de pago", "¿De dónde salió el dinero?" | Selectores | select | — | sí | n/a | Origen sin default (bien) |
| Compra: producto (buscador propio) | Elige producto | botón-select | — | no | n/a | Sin acentos; no avisa duplicados (DUE-04) |
| Compra: "Agregar lote" / quitar lote ✕ | Líneas | outline / ghost | — | no | **no** | Quitar línea sin confirmar con datos escritos (menor) |
| Compra: Cantidad / Costo unit. | Campos | input numérico `step 0.01` en costo | — | sí | n/a | **Costo con tope de 2 decimales y por unidad base** (DUE-01) |
| "Registrar compra" / "Cargar inventario inicial" | Envía | default grande | toast 8 s | sí | no | Avisos perdidos (DUE-03); todo se pierde si cierra el diálogo (DUE-02) |
| Nuevo producto: "Agregar" presentación | Añade tarjeta | outline sm | — | no | sí al quitar con datos | Bien |
| "Crear producto" | Envía | default | toast | sí | n/a | Sin "siguiente paso" (DUE-13) |
| Editar producto: historial de precios (ícono reloj) | Muestra historial | ghost icon con `aria-label` | panel | no | n/a | Acción de valor escondida en ícono de 20 px en escritorio (`md:size-5`) |
| "Guardar cambios" / "Guardar de todos modos" | Envía | default | cierra | sí | aviso si cambia múltiplo con ventas | Bien (registrar y avisar) |

### 5.2 Gastos y deudas (`app/dashboard/gastos/page.tsx`, `components/gastos/*`)
| Control | Qué hace | Variante / jerarquía | Feedback | Deshab. | Conf. | Problema |
|---|---|---|---|---|---|---|
| Actualizar (ícono ↻) | Recarga | outline icon con `aria-label` | giro | sí | n/a | Bien |
| "Registrar gasto" | Registra | default grande | toast + avisos 12 s | sí | no | Bien. Sin atajos de gastos frecuentes |
| "+ Nueva" categoría | Abre diálogo | link | — | no | n/a | Link pequeño pegado al label |
| "Crear categoría" | Envía | default | toast | sí | n/a | Error aparece **detrás** del diálogo (DUE-20) |
| "Anular" gasto | Abre AnularDialog | outline sm | toast | sí | sí (motivo + efecto) | Desaparece sin explicar (DUE-15) |
| "Pagar / abonar" | Abre diálogo | default | — | no | n/a | Bien, texto claro |
| "Registrar pago" (abono) | Envía | default | toast + avisos | sí | no | Valida que no pase de lo debido; default Gaveta (DUE-19) |
| "Abonos hechos (N)" | Despliega historial | fila con chevron | — | no | n/a | Bien |

### 5.3 Movimientos (`app/dashboard/movimientos/page.tsx`)
| Control | Qué hace | Variante / jerarquía | Feedback | Deshab. | Conf. | Problema |
|---|---|---|---|---|---|---|
| Buscador "turno, gasto o nº de venta" | Filtra / busca venta | input | resultado arriba | n/a | n/a | No filtra por fecha visible (DUE-22), mezcla con id de turno (DUE-25) |
| Actualizar (ícono) | Recarga | outline icon con `aria-label` | giro | sí | n/a | Bien |
| Fila de turno | Abre/cierra | tarjeta clicable | chevron | no | n/a | Bien |
| "Cerrar forzado" | Cierra turno ajeno | outline ámbar sm | diálogo | sí | sí (efectivo + justificación) | Visible en **todo** turno abierto, incluso el que la cajera usa ahora (DUE-26) |
| "Anular" (movimiento) | Abre AnularDialog | outline sm | toast | sí | sí | Solo con turno abierto, sin explicar (DUE-15) |
| "Devolver" | Abre DevolucionDialog | outline azul sm | — | — | (fuera de alcance) | Bien |
| "Anular venta" | Diálogo de motivo | outline rojo sm | — | sí | sí | Copy técnico (DUE-26); botón de envío con `bg-destructive` manual |
| "Ver turnos anteriores" | Pagina | outline | spinner | sí | n/a | Bien |

### 5.4 Estadísticas (`app/dashboard/stats/page.tsx`)
| Control | Qué hace | Variante / jerarquía | Feedback | Deshab. | Conf. | Problema |
|---|---|---|---|---|---|---|
| Hoy / 7 días / Este mes / Historial | Cambia período | grupo de píldoras `aria-pressed` | atenúa y recarga | no | n/a | Bien; "Historial" desde 2020 (ok) |
| Actualizar (ícono) | Recarga | outline icon con `aria-label` | giro | sí | n/a | Bien |
| Asistente "efectivo guardado" + "Guardar" | Crea el aporte inicial | default | toast | sí | no | Permanente y sin cerrar (DUE-29) |
| "Poner dinero" | Abre diálogo | **default** | — | no | n/a | Compite con "Contar" — ver abajo |
| "Contar la bóveda" | Abre diálogo | outline | — | no | n/a | Es la acción de control principal y queda de segunda |
| "Poner el dinero" | Envía | default | vista previa "pasará de A a B" | sí | no | Bien |
| "Confirmar: dejar $X" | Envía el arqueo | default | vista previa en vivo, motivo obligatorio ≥$1 | sí | sí (vista previa + botón explícito) | Bien; falta avisar que baja la ganancia (DUE-31) |
| Gráfico / tabla de productos | Lectura | — | tooltip | n/a | n/a | Sin orden ni "peores" (DUE-33) |

### 5.5 Usuarios (`app/dashboard/usuarios/page.tsx`)
| Control | Qué hace | Variante / jerarquía | Feedback | Deshab. | Conf. | Problema |
|---|---|---|---|---|---|---|
| "Nuevo" | Alta | default | — | no | n/a | Bien |
| "Rol" / "Contraseña" | Diálogos | outline sm con texto + ícono | toast | sí | no | La dueña puede degradarse sola (DUE-41); sin ver contraseña (DUE-40) |
| "Desactivar" | Desactiva | outline rojo, oculto para uno mismo | toast | sí | sí (destructivo, explica efecto) | Bien |
| "Reactivar" | Reactiva | outline | toast | sí | sí | Bien |

### 5.6 Navegación (`components/nav/*`, `forbidden-state.tsx`)
| Control | Qué hace | Problema |
|---|---|---|
| Sidebar (6 ítems) | Navega | Sin contadores/avisos (por revisar, deudas, turno abierto) |
| Barra inferior (6 ítems, 11 px) | Navega en celular | Etiquetas apretadas a 375 px (DUE-38, hipótesis) |
| Cerrar sesión (ícono con `aria-label`) | Sale | Bien (celular: menú de usuario) |
| "Ir a mi inicio" (ForbiddenState) | Vuelve | Texto "contacta al administrador" (DUE-39) |

---

## 6. Hallazgos por pantalla

### Inventario y compras

### DUE-01 — Costo y cantidad solo en unidad base y con tope de 2 decimales: el total no coincide con la factura 🔴
- **Pantalla / flujo:** Inventario → Nueva compra / Inventario inicial (tareas 2.1 y 2.4).
- **Evidencia:** `components/inventario/CompraForm.tsx:393-402` (Cantidad `step=0.001`, **Costo unit. `step="0.01"`**), `205-209` (monto
  = Σ cantidad × costo) y `248-253` (manda `producto_id` y cantidad sin presentación). El backend acepta hasta 4 decimales en el
  costo (`erp-tienda-backend/src/compras/dto/*` `IsDinero({ decimales: 4 })`) y **recalcula** `monto_total` desde las líneas
  (`compras.service.ts:45,111`). El formulario no pide la presentación (caja, six-pack, fardo): el lote es siempre en unidades base.
- **Qué vive la usuaria:** Compra 4 six-packs de gaseosa a $5.00 cada uno ($20). Tiene que escribir cantidad 24 y costo
  $0.8333; el navegador no deja enviar (el campo solo admite centésimas) y le sugiere "0.83 o 0.84". Si escribe 0.83, el
  sistema registra $19.92 (y baja la gaveta o la deuda en $19.92, no en $20) y el costo FIFO queda en $0.83. Con 40 líneas
  de este tipo, el costo y la ganancia se desvían de lo que de verdad pagó.
- **Recomendación:** (1) en cada línea, un selector de **presentación** (Unidad / Six-pack / Caja) y cantidad "cuántas
  compré"; el formulario calcula las unidades base y el costo por unidad. (2) Campo **"Cuánto pagué por esta línea"** (total
  de línea) como alternativa al costo unitario; el costo unitario se calcula con 4 decimales y se muestra "≈ $0.8333 c/u".
  (3) Subir el `step` del costo a `0.0001` (mínimo, mientras llega lo anterior) y mostrar el total que se guardará, para
  que lo compare con la factura.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-02 — El diálogo de compra e inventario inicial pierde todo con un clic afuera o Esc 🔴
- **Pantalla / flujo:** Inventario → Inventario inicial / Nueva compra (tarea 2.1).
- **Evidencia:** `app/dashboard/inventario/page.tsx:871-892` (el `CompraForm` vive dentro del `Dialog`, que se desmonta al cerrar;
  `onOpenChange={setCompraDialogOpen}`) y `components/ui/dialog.tsx` no bloquea `onInteractOutside`. Todo el estado
  (`lineas`, proveedor, origen) vive en `CompraForm` (`157-164`). Mismo patrón, con menos costo, en `ProductDialog.tsx:201`
  (`handleClose` borra el formulario).
- **Qué vive la usuaria:** Lleva 25 productos cargados en el inventario inicial. En la laptop toca fuera del diálogo (o
  presiona Esc al querer cerrar una lista) y desaparecen las 25 líneas, sin pregunta ni forma de recuperarlas. Es el momento
  del mayor esfuerzo del primer día.
- **Recomendación:** en `CompraForm`, si hay líneas o texto, `onInteractOutside`/`onEscapeKeyDown` con `preventDefault()` y un
  `ConfirmDialog` ("¿Descartar lo que cargaste? Perderás N productos"). Opcional: guardar el borrador en `sessionStorage`.
  Aplicar lo mismo a `ProductDialog` cuando tenga datos.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código (que el clic afuera cierre es Hipótesis: ver en vivo)

### DUE-03 — Los avisos de la compra se pierden 🟡
- **Pantalla / flujo:** Compra (tarea 2.4).
- **Evidencia:** `CompraForm.tsx:263-268` guarda `res.avisos` en `setAvisos` y luego llama `onSuccess()`; en
  `inventario/page.tsx:886-889` `onSuccess` cierra el diálogo (`setCompraDialogOpen(false)`), así que el bloque ámbar de
  `CompraForm.tsx:284-290` nunca llega a verse. El toast solo trae el texto genérico.
- **Qué vive la usuaria:** Paga una compra con la gaveta y el sistema le avisa que la gaveta quedó negativa; ella no ve nada y
  piensa que todo cuadra. Rompe la regla "registrar y avisar".
- **Recomendación:** igual que Gastos y Deudas: `for (const aviso of res.avisos ?? []) toast.warning(aviso, { duration: 12000 })`
  antes de cerrar.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-04 — Cargar muchos productos: línea nueva sin foco, al final y sin avisar duplicados 🟡
- **Pantalla / flujo:** Inventario inicial (tarea 2.1).
- **Evidencia:** `CompraForm.tsx:166-174` y `191-197` (la línea se agrega al final con cantidad "1" y sin enfocar nada);
  `34-139` selector propio con `toLowerCase()` (no normaliza acentos como el buscador del catálogo) y filtra por código solo con
  igualdad exacta (`62`); no hay detección de producto repetido.
- **Qué vive la usuaria:** Escanea un producto: aparece una línea nueva al final de una lista de 30, fuera de vista dentro del
  diálogo con scroll; tiene que bajar, tocar cantidad, tocar costo. Si escanea el mismo producto dos veces, lleva dos líneas sin
  aviso. Buscar "jamon" no encuentra "Jamón".
- **Recomendación:** al escanear o "Agregar lote", **enfocar el campo Cantidad de la línea nueva** y hacer scroll a ella (o
  poner la línea nueva arriba); si el producto ya está en la lista, sumar 1 a la cantidad y avisar con un toast; usar
  `normalizarBusqueda` en el selector; agregar un resumen fijo "N productos · Total $X" visible sin scroll.
- **Esfuerzo:** M
- **Confianza:** Probable

### DUE-05 — "Contar el inventario" no existe: hay que calcular la diferencia a mano, producto por producto 🟡
- **Pantalla / flujo:** Inventario → producto → "Registrar merma" / "Encontré producto" (tarea 2.8).
- **Evidencia:** `components/inventario/AjusteInventarioDialog.tsx:45-131`: pide "Cantidad a descontar" / "Cantidad que
  encontré" (la **diferencia**, en unidades base) y, para quitar, "¿De qué lote? (el más viejo sale primero)" (`185`). No hay
  campo "Cuánto cuento ahora". El dueño debe restar sola y elegir entre "Quitar (merma)" y "Encontré (conteo)" (`157-170`).
- **Qué vive la usuaria:** Cuenta 12 latas; el sistema dice 15. Debe pensar: "faltan 3, entonces Quitar, tipo Ajuste de conteo,
  lote #14 (¿cuál era?)". Para 80 productos es una tarde. Si cuenta cajas y six-packs, además convierte a unidades.
- **Recomendación:** modo **"Contar"** por producto: muestra "El sistema dice: 15 uds (2 six-packs + 3)" y un campo "Contaste:";
  al escribir 12 muestra "Faltan 3 (≈ $2.55 de costo)"; el botón elige solo quitar o sumar y reparte por FIFO sin preguntar
  por el lote. Después, una pantalla "Conteo" para recorrer productos por categoría (L).
- **Esfuerzo:** L (el modo "Contar" de un producto: M)
- **Confianza:** Confirmado en código

### DUE-06 — "Inventario inicial" y "Nueva compra" son solo íconos en celular y tablet 🟡 (persiste UX-26/27)
- **Pantalla / flujo:** Inventario, cabecera (tareas 2.1, 2.4).
- **Evidencia:** `inventario/page.tsx:350-357`: `<span className="hidden lg:inline">Inventario inicial</span>` y `<span className="hidden
  sm:inline">Nueva compra</span>`; los `Button` no llevan `aria-label` ni `title`. Bajo `lg` (1024 px) "Inventario inicial" es un
  paquete con "+" y bajo `sm` "Nueva compra" es un camión.
- **Qué vive la usuaria:** En el celular ve tres botones: [paquete+] [camión] [+ Producto]. Para la acción más importante del
  primer día (cargar el inventario) tiene que adivinar cuál es.
- **Recomendación:** mostrar siempre el texto (en celular, dos filas: "Producto" arriba, "Compra" y "Inventario inicial" en un
  menú "⋯ Más"); como mínimo `aria-label` y `title`. Hoy L14 contó "botones de ícono sin nombre: 0" y aquí siguen dos.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código (aspecto real: Hipótesis: ver en vivo)

### DUE-07 — El stock se muestra en unidades base; el POS ya lo muestra en six-packs 🟡
- **Pantalla / flujo:** Inventario, lista y lotes (tarea 2.8).
- **Evidencia:** `inventario/page.tsx:523-525` (`formatCantidad(stock) uds`), `648` (lotes en "uds"), `514` ("Vendido sin
  registrar: N"). `lib/format.ts` ya tiene `stockEnPresentacion` (7 six-packs + 2 sueltas) pero Inventario no lo usa.
- **Qué vive la usuaria:** El POS le dice "7 six-packs + 2" y Inventario "44 uds": cree que no cuadran. Al contar el estante
  cuenta cajas, no latas.
- **Recomendación:** en la fila expandida, bajo "Stock", mostrar "44 uds = 7 six-packs + 2 sueltas" usando la presentación de
  mayor factor; en la lista, dejar "44 uds" pero con el desglose en el detalle.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-08 — Nada responde "¿qué tengo que comprar?" 🟡
- **Pantalla / flujo:** Inventario → Catálogo.
- **Evidencia:** `inventario/page.tsx:417-441` (solo buscador y "desactivados"), `455-473` (solo "por revisar"). Sin filtro de
  agotados, sin orden, sin categoría; la lista va por orden del servidor. La decisión D-10 (stock bajo) quedó para después del
  primer mes; esto es solo el mínimo.
- **Qué vive la usuaria:** Quiere saber qué se acabó para hacer el pedido: tiene que recorrer todo el catálogo buscando pastillas
  rojas "Agotado".
- **Recomendación:** (sin tocar D-10) chips de filtro "Todos · Agotados (N) · Por revisar (N) · Vendido sin registrar (N)" y
  orden por nombre/stock; "Copiar lista de agotados" para mandarla al proveedor por WhatsApp (M). El número N de agotados
  también puede ir en el menú.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-09 — Cambiar el precio no muestra el costo ni cuánto se gana 🟡
- **Pantalla / flujo:** Inventario → precio rápido y alta de producto (tarea 2.3).
- **Evidencia:** `components/inventario/PrecioRapido.tsx:56-65` guarda sin mirar el costo; `validacionPresentacion.tsx:528-531`
  avisa solo cuando el precio es exactamente $0. Los costos están disponibles en `prod.lotes_inventario`
  (`inventario/page.tsx:649`) pero no se cruzan con el precio.
- **Qué vive la usuaria:** Sube un precio de $1.00 a $0.90 por error de dedo o por competir, sin notar que el último lote costó
  $0.95: vende con pérdida. Nada se lo dice (y por el principio "apoyar, no imponer" no debe bloquearse).
- **Recomendación:** bajo el precio, **aviso ámbar sin bloquear**: "Con el costo actual ($0.95) ganas −$0.05 por unidad" o, en
  positivo, "Ganas $0.40 por unidad (42 de cada $100)". En el diálogo de alta, avisar cuando haya costo conocido.
- **Esfuerzo:** M
- **Confianza:** Probable

### DUE-10 — Revisar "por revisar" toma 5–6 toques por producto y la marca no se limpia sola 🟡
- **Pantalla / flujo:** Inventario → por revisar (tarea 2.7).
- **Evidencia:** `inventario/page.tsx:455-473` (banner), `536-555` ("Editar" y "Ya lo revisé" son botones separados; el texto dice
  "Completa precio y categoría con «Editar» y luego márcalo"), `EditProductDialog.tsx:192-193` (guardar cierra y no cambia
  `por_revisar`). `handleYaRevise` (`281-296`) marca sin comprobar que haya precio, categoría o costo.
- **Qué vive la usuaria:** Revisa 12 productos de la cajera: por cada uno abre, edita, guarda, y recién entonces toca "Ya lo
  revisé". No ve quién lo creó, cuándo, cuánto se vendió ni que el costo sigue en $0 (que además alimenta DUE-27).
- **Recomendación:** en el diálogo de Editar de un producto "por revisar", un botón **"Guardar y marcar como revisado"**;
  mostrar "Creado por Karla el 24 nov · vendido 8 uds · sin costo registrado"; si no tiene costo, un enlace "Registrar compra de
  este producto".
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-11 — Cada acción recarga toda la pantalla con spinner 🟡
- **Pantalla / flujo:** Inventario (tareas 2.3, 2.7, 2.8).
- **Evidencia:** `inventario/page.tsx:152-185` (`loadData` pone `loading=true`) y `386-401`/`401`: mientras `loading` el contenido
  de las pestañas se reemplaza por el spinner "Cargando inventario…". `onGuardado={() => loadData(true)}` (`609`) y los demás
  `onSuccess` llaman lo mismo.
- **Qué vive la usuaria:** Cambia el precio de 10 productos seguidos: tras cada Enter toda la lista desaparece, la página vuelve
  arriba y tiene que volver a encontrar el producto (el buscador conserva el texto, pero el scroll no).
- **Recomendación:** recarga silenciosa (mantener la lista y atenuarla como ya hace Estadísticas con `opacity-50`), y mostrar el
  spinner a pantalla completa solo en la primera carga.
- **Esfuerzo:** S
- **Confianza:** Hipótesis: ver en vivo

### DUE-12 — Historial de compras sin buscador ni paginación; la pestaña se llama "Historial" 🟡
- **Pantalla / flujo:** Inventario → Historial.
- **Evidencia:** `inventario/page.tsx:161` (`apiFetch("/compras")`, todas), `740-860` (sin buscador, sin filtro de proveedor, fecha o
  estado), `168` (mermas: solo las 30 más recientes). La cabecera dice "Catálogo · Categorías · Compras" (`346`) y la pestaña "Historial".
- **Qué vive la usuaria:** Pregunta "¿cuánto le compré a Pepsi este año?" o "¿esa compra de mayo estaba pagada?": solo puede
  desplazarse; con el tiempo la lista crecerá sin freno.
- **Recomendación:** renombrar la pestaña **"Compras y mermas"**; añadir buscador por proveedor y chips "Todas · A crédito ·
  Anuladas"; paginar de 20 en 20 con "Ver más"; total del mes bajo el título.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-13 — Crear producto: tres nombres para lo mismo y no hay "siguiente paso" 🟡
- **Pantalla / flujo:** Inventario → Nuevo producto / Agregar presentación (tarea 2.2).
- **Evidencia:** `ProductDialog.tsx:314` "Múltiplo (unidades que trae)", `453` "Factor conversión" (diálogo de presentación),
  `EditProductDialog.tsx:307` "Múltiplo"; `inventario/page.tsx:603` muestra "×6". Código de barras de la primera presentación en
  `215-226` y el de las demás dentro de su tarjeta (`305-312`). `AddPresentacionDialog` no muestra toast al guardar (`415-416`).
  Tras "Crear producto" solo hay un toast (`190`).
- **Qué vive la usuaria:** Crea "Gaseosa" y no sabe que "Factor conversión" es lo mismo que el "Múltiplo" del producto nuevo. Al
  terminar queda con un producto "Agotado" y no hay un botón para decir cuántos tiene ni cuánto costó.
- **Recomendación:** un solo nombre, **"Unidades que trae (ej. 6 para un six-pack)"**, en los tres lugares; que el código de
  cada presentación esté dentro de su tarjeta (también la primera); toast en "Agregar presentación"; tras crear, toast con acción
  "Registrar compra de este producto".
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-14 — "Desactivar" a veces borra de verdad y el botón no es destructivo ⚪
- **Pantalla / flujo:** Inventario → producto → Desactivar.
- **Evidencia:** `inventario/page.tsx:926-945`: el texto dice "Si ya tiene ventas o compras, se desactiva… Si nunca se usó, se
  elimina del catálogo", el botón se llama "Desactivar" y es `default` (azul) aunque el efecto puede ser un borrado.
- **Qué vive la usuaria:** Un producto recién creado por error se "desactiva" y desaparece para siempre sin pasar por "Ver
  desactivados".
- **Recomendación:** el diálogo debe decidir el texto: si el producto no tiene historial, título "Eliminar «X»" con botón
  destructivo; si tiene, "Desactivar". La API puede devolver el uso (como `GET /presentaciones/:id/uso`).
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### Gastos y deudas

### DUE-15 — Anular solo sirve con el turno abierto y el botón desaparece sin explicar 🟡
- **Pantalla / flujo:** Gastos → Últimos gastos; Movimientos → ventas y movimientos (tarea 2.6).
- **Evidencia:** `gastos/page.tsx:215-217` (`sePuedeAnular`: bóveda siempre; gaveta solo si `caja_turno_id === cajaActiva?.id`) y
  `391-395`; `movimientos/page.tsx:486-500` (Anular venta solo con `turnoAbierto`) y `758-760` (anular movimiento solo `isAbierta`).
- **Qué vive la usuaria:** Descubre hoy que ayer registró $60 en vez de $6 desde la gaveta. Abre Gastos: el gasto está ahí, **sin
  botón Anular**, y nada dice por qué ni qué hacer. Piensa que el sistema no tiene arreglo.
- **Recomendación:** mostrar el botón **deshabilitado con motivo** ("Ese turno ya cerró: no se puede devolver dinero a la
  gaveta. Para corregirlo, anota un gasto/ingreso de ajuste hoy") o dejar el texto bajo el gasto. Es copy, no cambio de regla.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-16 — No se puede ver "cuánto llevo este mes" por categoría 🟡
- **Pantalla / flujo:** Gastos (tarea 2.6) y Estadísticas.
- **Evidencia:** `gastos/page.tsx:103` (`limit=15`) y `360-404` (lista sin filtro, sin total, sin agrupar). `stats/page.tsx:609` solo
  muestra "Gastos del negocio" como un total; no existe reporte por categoría (`reportes.service.ts` no agrupa por categoría).
- **Qué vive la usuaria:** Cada gasto lleva categoría ("Luz", "Agua", "Otros"), pero nunca la ve sumada. No puede responder "¿cuánto
  me cuesta la luz al mes?" ni si "Otros" es enorme.
- **Recomendación:** en Gastos, una franja "Este mes: $X en gastos" con chips por categoría (suma por categoría de los gastos
  cargados del mes); selector de mes y buscador. En Estadísticas, el renglón "Gastos del negocio" desplegable por categoría.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-17 — Las deudas viven al fondo de "Control de gastos", por compra y con proveedor de texto libre 🟡
- **Pantalla / flujo:** Gastos → Deudas con proveedores (tarea 2.5).
- **Evidencia:** `gastos/page.tsx:357` (después del formulario completo); `DeudasProveedores.tsx:149-170` (una tarjeta por compra, no por
  proveedor); `CompraForm.tsx:308` (campo `proveedor` libre: "Pepsi", "pepsi", "Distribuidora Pepsi"); el número "Lo que debes" de
  Estadísticas (`stats/page.tsx:515`) no enlaza a Gastos.
- **Qué vive la usuaria:** En celular baja más de una pantalla para ver cuánto debe. Tiene cinco compras fiadas a "Pepsi" y cuatro
  nombres distintos; no puede decir "le pago $100 a Pepsi" y repartirlo.
- **Recomendación:** (1) mover Deudas arriba cuando existan; (2) autocompletar proveedor con los ya usados (`<datalist>`);
  (3) agrupar por proveedor con subtotal y botón "Pagar a Pepsi" que reparte entre sus compras (M–L); (4) enlace desde "Lo que
  debes" en Estadísticas.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-18 — Si falla la carga de deudas, la sección desaparece sin aviso 🟡
- **Pantalla / flujo:** Gastos → Deudas.
- **Evidencia:** `DeudasProveedores.tsx:64-76` (`catch → setOculta(true)`) y `82` (`if (oculta) return null`). Está pensado para el 403
  de la cajera, pero cualquier falla de red lo dispara.
- **Qué vive la usuaria:** Con internet inestable, la tarjeta de deudas simplemente no está. Interpreta "no debo nada" y no
  abona ni compra con cabeza.
- **Recomendación:** ocultar solo si el error es 403 (`tipoDeError`); en otros errores mostrar "No se pudieron cargar las deudas.
  Reintentar".
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-19 — Gaveta sin turno no muestra monto y "Gaveta" sigue como origen por defecto 🟡
- **Pantalla / flujo:** Gastos (tarjetas y formulario) y Deudas.
- **Evidencia:** `gastos/page.tsx:241-252` (sin turno: "No hay turno abierto", sin cifra) frente a `stats/page.tsx:512` (muestra el
  remanente de la gaveta); `85` y `DeudasProveedores.tsx:59` fijan `GAVETA` por defecto aunque no haya turno (la validación
  aparece solo al enviar, `gastos/page.tsx:134-137`).
- **Qué vive la usuaria:** Por la mañana, antes de abrir la caja, registra la luz: el formulario le deja llenar todo y recién al
  enviar le dice que no hay turno abierto. La tarjeta "Gaveta" no le dice cuánto hay.
- **Recomendación:** sin turno, mostrar "Gaveta: $X (lo que quedó al cerrar)" como Estadísticas y preseleccionar **Bóveda** (con el
  texto "No hay turno abierto, se pagará de la bóveda"); lo mismo en el abono.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-20 — Nueva categoría de gasto: el error sale detrás del diálogo; "Fijo/Variable" es jerga sin uso ⚪
- **Pantalla / flujo:** Gastos → "+ Nueva".
- **Evidencia:** `gastos/page.tsx:176-203` usa `setError` (la caja roja de `282-286`, que está debajo del diálogo) y `430-441` pide "Tipo de
  gasto: Variable/Fijo" sin que ningún reporte lo use.
- **Qué vive la usuaria:** Si el nombre ya existe, el diálogo parece no hacer nada; el error está tapado.
- **Recomendación:** error dentro del diálogo; quitar "Tipo de gasto" o dejarlo con valor por defecto oculto.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### Movimientos

### DUE-21 — El cierre de turno no muestra lo esperado, lo vendido ni la explicación de la cajera 🟡
- **Pantalla / flujo:** Movimientos → turno cerrado (tarea 2.13).
- **Evidencia:** `movimientos/page.tsx:685-706` solo muestra "Empezó con", "Ventas N op.", "Cierre declarado" y "Descuadre". La interfaz
  `CajaTurno` (`90-102`) ni siquiera declara `observaciones`; el servidor sí la guarda (`cajas_turnos.service.ts:265-288`) y la devuelve
  (`include` del turno, `360-375`). Tampoco pinta `efectivo_esperado` (sí está en la interfaz, `96`).
- **Qué vive la usuaria:** Ve "Faltó $3.50" y no sabe contra qué. No sabe cuánto se vendió en dinero ese turno (solo "12 op."), ni
  qué escribió la cajera ("le di vuelto de más"). Para cerrar la duda tiene que preguntarle a la persona, en persona.
- **Recomendación:** en el encabezado: "Debía haber $X · Contó $Y · Faltó $Z" y "Vendido $V"; en el detalle, una caja "Lo que
  escribió Karla al cerrar: «…»" (y la justificación del cierre forzado). Contar solo ventas completadas en "N ventas".
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-22 — Buscar por fecha no funciona con lo que se ve en pantalla; no hay selector de fecha 🟡
- **Pantalla / flujo:** Movimientos (tarea 2.12).
- **Evidencia:** `movimientos/page.tsx:324` compara con `"dd/MMM/yyyy HH:mm"` ("25/nov/2026 09:00") pero el encabezado muestra
  `"dd MMM yyyy"` y la hora aparte (`667-669`, "25 nov 2026"). Escribir "25 nov" no coincide; "25/nov" sí. El placeholder (`535`) no
  menciona fechas. No hay selector de fecha ni búsqueda por producto o monto (la venta solo se busca por número, `286-314`).
- **Qué vive la usuaria:** Escribe "24 nov" para ver lo de ayer y la lista queda vacía ("Ningún turno cargado coincide").
- **Recomendación:** un selector de fecha ("Ver el día: [24 nov]") que filtre turnos y ventas en el servidor; y, mientras llega,
  normalizar la búsqueda para aceptar "24 nov", "24/11", "ayer".
- **Esfuerzo:** S (normalizar) / M (selector con filtro de servidor)
- **Confianza:** Confirmado en código (cómo imprime `es` el mes: Hipótesis: ver en vivo)

### DUE-23 — Tarjetas "Ingresos de los turnos mostrados" y "Desc." sin período claro ni signo de dinero 🟡
- **Pantalla / flujo:** Movimientos (tarjetas superiores).
- **Evidencia:** `movimientos/page.tsx:568-570` ("Ingresos de los turnos mostrados"; depende de cuántas páginas de 7 cargó, `167`),
  `572-580` ("Turnos visibles" y "Desc.: +5.00 (sobró)" sin "$", `578`, y en verde incluso con `+0.00`).
- **Qué vive la usuaria:** Ve "Ingresos $842" y los compara con el "Vendido $1,120" de Estadísticas del mismo mes: no sabe por qué
  no coinciden (son períodos distintos y nombres distintos). "Desc." no le dice nada.
- **Recomendación:** llamarla **"Vendido (últimos N turnos)"** con la fecha del primero y del último; "Desc." → "Faltó/Sobró en
  los cierres: **−$12.50**"; con 0, neutral ("Cuadraron").
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-24 — No hay libro de la bóveda en pantalla 🟡
- **Pantalla / flujo:** Estadísticas → Bóveda; Movimientos (tareas 2.10, 2.11).
- **Evidencia:** el backend ya expone `GET /caja-general` solo para ADMIN (`caja_general.controller.ts:54-55`, y
  `docs/domain/roles-y-permisos.md`: "libro de la bóveda"), pero el frontend solo usa `/caja-general/saldo`, `/inyeccion` y `/arqueo`
  (`stats/page.tsx:214,259,293,319`). Movimientos solo pinta movimientos **ligados a un turno**; los aportes y arqueos de la bóveda
  no tienen turno.
- **Qué vive la usuaria:** Tiene $480 en la bóveda y no sabe cómo llegó a ese número: no puede ver el aporte inicial, los
  traslados de cada cierre, los pagos que hizo desde ahí ni el arqueo anterior.
- **Recomendación:** botón **"Ver movimientos de la bóveda"** bajo el saldo, con una lista paginada (fecha, qué fue, quién, ±$,
  saldo después) que use `etiquetaMovimiento` del glosario.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-25 — Escribir un número de venta también filtra los turnos con ese id ⚪
- **Pantalla / flujo:** Movimientos (tarea 2.12).
- **Evidencia:** `movimientos/page.tsx:320-329` (`String(turno.id).includes(searchLower)`) corre a la vez que la búsqueda de venta
  por número (`286-314`).
- **Qué vive la usuaria:** Busca la venta 15: arriba aparece la venta (bien), y debajo la lista se encoge a los turnos 15, 150…
  mientras "Turnos visibles" cambia; parece un error.
- **Recomendación:** cuando el texto es solo un número y se encontró la venta, no filtrar turnos por id; o filtrar turnos solo si
  empieza con "#" o "turno".
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-26 — Cierre forzado y anular venta: copy de sistema y error fuera del diálogo ⚪
- **Pantalla / flujo:** Movimientos.
- **Evidencia:** `movimientos/page.tsx:848` ("Solo ADMIN."), `814` ("restará el dinero del balance de la caja… irreversible"),
  `720-736` (la franja "¿Turno abandonado sin cerrar?" con "Cerrar forzado" se pinta en **todo** turno abierto, incluido el que la
  cajera usa ahora), `368-370` y `399-402` (ante un error el diálogo se cierra y el mensaje sale en la página).
- **Qué vive la usuaria:** Mientras la cajera atiende, la dueña ve un botón ámbar para cerrarle el turno. Si falla el cierre, el
  diálogo desaparece y el mensaje queda arriba, fuera de la vista.
- **Recomendación:** mostrar la franja solo si el turno lleva más de ~12 h abierto o con una acción "⋯"; "Solo la dueña." →
  quitar; "balance de la caja" → "restará el dinero de la gaveta"; dejar el error dentro del diálogo y no cerrarlo.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### Estadísticas

### DUE-27 — La ganancia sale inflada si se vendió sin costo registrado, y nada avisa 🔴
- **Pantalla / flujo:** Estadísticas, cabecera, KPI y tabla de productos (tareas 2.9, 2.1).
- **Evidencia:** `docs/domain/inventario.md:61-71` (lo vendido sin stock se estima con el costo del último lote; **si nunca hubo
  compra, el estimado es $0**) y `erp-tienda-backend/src/common/pendientes-stock.ts:136`; `stats/page.tsx:424` (`Cabecera`),
  `428-434` (KPI "Ganancia") y `676-678` (la tabla marca el margen en verde). El reporte no devuelve cuántas ventas tuvieron
  costo $0 ni la pantalla lo pregunta.
- **Qué vive la usuaria:** El primer día vende productos que no cargó al inventario ("vender y avisar") o dados de alta por la
  cajera y "por revisar". Estadísticas dice "Hoy ganaste $120 (de $120 vendidos)": el costo fue $0 y el margen es 100 de cada
  $100 en verde. Cree que ganó todo y puede comprar de más o sacar dinero para ella.
- **Recomendación:** **registrar y avisar** (sin bloquear): el endpoint de estado de resultados debe devolver
  `ventas_sin_costo` (cantidad y monto vendido con costo estimado $0). Con eso la cabecera agrega una línea ámbar: "⚠ $85 de lo
  vendido no tiene costo registrado, por eso la ganancia puede estar de más. Registra la compra de Gaseosa y Pan" con enlace.
  En la tabla de productos, pastilla gris "sin costo" en lugar del 100 % verde.
- **Esfuerzo:** M (backend S + pantalla S)
- **Confianza:** Confirmado en código

### DUE-28 — "Hoy perdiste" / "Este mes perdiste" sin comparación ni contexto puede llevar a decidir mal 🟡
- **Pantalla / flujo:** Estadísticas, cabecera (tarea 2.9).
- **Evidencia:** `stats/page.tsx:809-881` (`Cabecera`): una frase con la ganancia del período y "Qué mirar primero" solo si pierde;
  no hay comparación con el período anterior ni meta. `periodoFrase` usa "Hoy" tal cual.
- **Qué vive la usuaria:** El día 3 del mes pagó la luz ($60) y vendió $90: lee "Este mes perdiste $18" y se asusta, o paga un
  gasto grande un martes y el sistema dice "Hoy perdiste $40" aunque el mes vaya bien. A la inversa, "Este mes ganaste $300" no
  le dice si eso es bueno.
- **Recomendación:** una segunda línea con comparación: "Mes pasado a esta fecha: $280 (+7 %)"; para "Hoy", agregar
  "Lo que va del mes: ganaste $X" y para gastos grandes: "Incluye $60 de luz".
- **Esfuerzo:** M
- **Confianza:** Probable

### DUE-29 — El aviso de bóveda inicial es permanente y empuja la respuesta principal 🟡
- **Pantalla / flujo:** Estadísticas (tarea 2.1).
- **Evidencia:** `stats/page.tsx:273-274` (`bovedaSinMovimientos` = sin depósitos y saldo 0) y `400-421` (el aviso va **antes** de la
  cabecera); el texto dice "Si no tienes nada guardado, ignora este aviso" pero no hay botón para descartarlo.
- **Qué vive la usuaria:** Si no usa bóveda, cada vez que abre Estadísticas ve primero una tarjeta azul con un campo, y la frase
  de "¿estoy ganando?" queda más abajo (en celular, fuera de la primera pantalla).
- **Recomendación:** mover el aviso **debajo** de la cabecera, con un botón "No tengo nada guardado" que lo oculte (guardar en
  `localStorage` con `try/catch`) y reaparezca solo si la bóveda tiene movimientos.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-30 — "Vendido" aparece con dos cifras distintas en la misma pantalla 🟡
- **Pantalla / flujo:** Estadísticas.
- **Evidencia:** `stats/page.tsx:435-441` (KPI "Vendido" = `ingresoNeto`, ventas − devoluciones) frente a `595` (fila "Vendido" del
  P&L = `ingreso_bruto_ventas`, sin descontar devoluciones; la línea neta viene después, `598`, con otro nombre: "Vendido sin lo
  devuelto").
- **Qué vive la usuaria:** Con $10 devueltos ve "Vendido $110" en la tarjeta y "Vendido $120" en "Cómo salió la ganancia": una de
  las dos está mal.
- **Recomendación:** llamar a la fila del P&L **"Cobrado en ventas"** (o "Ventas") y dejar "Vendido" solo para el neto; o quitar la
  tarjeta KPI duplicada (ver DUE-32).
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-31 — "Faltó en la gaveta" incluye lo que falta en la bóveda; el arqueo no avisa que baja la ganancia 🟡
- **Pantalla / flujo:** Estadísticas → P&L y arqueo de bóveda (tarea 2.11).
- **Evidencia:** `lib/glosario.ts:25-26` (`faltoGaveta: "Faltó en la gaveta"`) usado en `stats/page.tsx:611` y en la cabecera
  ("faltantes en la gaveta", `828`); según `docs/domain/reportes.md` los `faltantes` suman `AJUSTE_FALTANTE` **y**
  `AJUSTE_BOVEDA_FALTANTE`. El toast del arqueo (`327-331`) dice "Anotado: faltaban $X" sin mencionar el efecto. Igual
  "Mercadería echada a perder" (`610`) suma también `ROBO` y el faltante de `CONTEO` (`ETIQUETA_MERMA`, `inventario/page.tsx:91-96`).
- **Qué vive la usuaria:** Cuenta la bóveda, faltan $40 porque sacó dinero y no lo anotó; Estadísticas baja su ganancia y el renglón
  dice "Faltó en la gaveta": sospecha de la cajera. O cuenta un producto de menos y lo ve como "echada a perder".
- **Recomendación:** renombrar a **"Faltó al contar el dinero"** (gaveta y bóveda) y **"Mercadería perdida (rota, vencida, robada o
  que no se encontró)"**; en el arqueo, texto del resultado: "Anotado: faltaban $40. **Esto baja la ganancia del mes**; si fue un
  gasto o un retiro que no anotaste, anótalo y vuelve a contar" (el flujo de explicar el motivo ya existe).
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-32 — "¿Dónde está mi dinero?" está partido en tres bloques y las deudas quedan afuera 🟡
- **Pantalla / flujo:** Estadísticas (tarea 2.10).
- **Evidencia:** `stats/page.tsx:466-494` (Bóveda), `497-526` (Patrimonio: Efectivo con la gaveta y la bóveda en una `hint` de 10 px,
  `942`), `529-545` (Flujo con otra tarjeta Gaveta y otra Bóveda). Las deudas por proveedor viven en Gastos. Además los 5 KPI
  (`427-463`) repiten cifras de `588-634`.
- **Qué vive la usuaria:** Para armar "tengo $X en mano, debo $Y, la tienda vale $Z" debe leer tres tarjetas, sumar de cabeza y
  saltar a Gastos. Cada bloque dice algo parecido con otra palabra ("Efectivo", "Dinero guardado", "Entró/Salió").
- **Recomendación:** un bloque **"Mi dinero hoy"**: tres cifras grandes (Gaveta, Bóveda, Debo a proveedores) y debajo "Si pagas
  todo, te quedan $N"; botones Poner/Contar/Ver movimientos ahí; "Entradas y salidas" y "Lo que vale el negocio" en un
  plegable "Más detalle". Quitar los KPI que repiten el P&L (ver §3.4).
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-33 — No se ve qué productos "no dejan": tabla ordenada por unidades y cortada en 15 🟡
- **Pantalla / flujo:** Estadísticas → productos.
- **Evidencia:** `stats/page.tsx:213` (`productos-top…&limit=15`, ordenado por unidades vendidas), `243-247` (gráfico: barras en dinero de
  los 8 primeros por unidades) y `637-687` (tabla sin orden ni buscador). El endpoint `GET /reportes/margen-por-producto`
  (`docs/domain/reportes.md`, "peores márgenes primero") no se usa en ninguna pantalla.
- **Qué vive la usuaria:** Quiere saber "¿qué producto me está dejando casi nada?" y la tabla le muestra los más vendidos primero;
  un producto de margen 3 % que vende poco no aparece.
- **Recomendación:** botones "Lo que más vendo | Lo que más deja | Lo que menos deja" sobre la tabla (el último con
  `margen-por-producto`); mostrar más de 15 con "Ver todos". El gráfico y la tabla se resumen en una sola lista.
- **Esfuerzo:** M
- **Confianza:** Confirmado en código

### DUE-34 — Tres umbrales distintos de "buen margen" ⚪
- **Pantalla / flujo:** Estadísticas.
- **Evidencia:** `stats/page.tsx:113-114` (`marginTone`: verde ≥25, ámbar ≥10), `454` (KPI "Por cada $100": verde ≥15), `1008`
  (`pct` del P&L: verde ≥15, ámbar ≥0).
- **Qué vive la usuaria:** El margen general de 20 sale verde y un producto de 20 sale ámbar ("deja poca"), y la leyenda del
  gráfico dice que ≥25 es bueno.
- **Recomendación:** una sola constante (p. ej. `MARGEN_BUENO = 25`, `MARGEN_BAJO = 10`) usada en los tres lugares.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-35 — 5 tarjetas en rejilla de 4, "Equipo y muebles" siempre $0 y verde con $0 ⚪
- **Pantalla / flujo:** Estadísticas y Gastos.
- **Evidencia:** `stats/page.tsx:427-463` (5 `KPICard` en `md:grid-cols-4`: la quinta queda sola en una segunda fila; "Compra
  promedio" no ayuda a decidir), `514` ("Equipo y muebles" sin forma de cargar el valor, ver backlog NEG-05), `473-477` (Bóveda
  $0.00 en verde) y `gastos/page.tsx:264` ("Dinero disponible" en verde con $0).
- **Qué vive la usuaria:** Ve una fila con una sola tarjeta huérfana y un "Equipo $0.00" que cree que es un dato real.
- **Recomendación:** dejar 4 KPI (o 3 al aplicar DUE-32); "Equipo y muebles: no registrado" en gris; el color verde solo con saldo
  > 0.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### Navegación

### DUE-36 — La dueña aterriza en Vender, no en cómo va el negocio 🟡
- **Pantalla / flujo:** Inicio de sesión de la dueña.
- **Evidencia:** `lib/navigation.ts:60-62` (`getHomeRoute` = primer ítem permitido) y el orden de `NAV_ITEMS` (`33-40`, "Vender" primero);
  `app/page.tsx:18` usa esa ruta.
- **Qué vive la usuaria:** Abre el sistema por la mañana para ver cómo va y cae en la caja, que puede pedirle abrir turno.
- **Recomendación:** `getHomeRoute("ADMIN")` → Estadísticas ("Mi negocio"); la cajera sigue en Vender. Un cambio de una línea.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-37 — Los nombres del menú no son los que la dueña busca y el dinero está repartido 🟡
- **Pantalla / flujo:** Menú.
- **Evidencia:** `lib/navigation.ts:33-40`; `stats/page.tsx:347` ("¿Cómo va el negocio?"); `movimientos/page.tsx:527-528`; `gastos/page.tsx:226`
  ("Control de gastos"). Detalle en §3.
- **Qué vive la usuaria:** Busca "mis ventas de ayer" y no sabe si es Movimientos o Estadísticas; busca "lo que debo" y no sabe
  que está en Gastos.
- **Recomendación:** Estadísticas → "Mi negocio"; Movimientos → "Ventas y turnos"; Gastos → "Gastos y deudas"; títulos de
  pantalla iguales al menú. Opción grande: pantalla "Dinero" (ver §3.4).
- **Esfuerzo:** M (renombrar: S; "Dinero": L)
- **Confianza:** Probable

### DUE-38 — Seis ítems en la barra inferior de 375 px: etiquetas apretadas ⚪
- **Pantalla / flujo:** Celular, dueña.
- **Evidencia:** `components/nav/bottom-nav.tsx:225-237` (`text-[11px]`, `truncate`, `flex-1` en 6 ítems ≈ 62 px cada uno: "Movimientos" y
  "Estadísticas" no caben con holgura).
- **Qué vive la usuaria:** "Estadísti…" y "Movimien…".
- **Recomendación:** renombres cortos del DUE-37 ("Mi negocio", "Ventas", "Gastos") o mover "Usuarios" al menú de usuario del
  encabezado móvil (ya existe `UserMenu`).
- **Esfuerzo:** S
- **Confianza:** Hipótesis: ver en vivo

### DUE-39 — Textos de sistema: "Administrador", "Cajero · POS", "contacta al administrador" ⚪
- **Pantalla / flujo:** Sidebar y pantalla "Sin permiso".
- **Evidencia:** `components/nav/sidebar.tsx:137` ("Cajero · POS" / "Administrador"), mientras `lib/roles.ts` dice "Dueña (administradora)" y
  "Cajera"; `components/forbidden-state.tsx:92` ("Tu rol no tiene acceso… contacta al administrador").
- **Qué vive la usuaria:** El sistema la llama "Administrador" en la cabecera y "Dueña (administradora)" abajo; a la cajera que
  entra a una URL prohibida le dice que contacte "al administrador", y la dueña es quien le puede ayudar.
- **Recomendación:** usar `etiquetaRol` también en la cabecera; copy: "Esto lo hace la dueña. Si lo necesitas, pídeselo a ella"
  (como el 403 del servidor).
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### Usuarios

### DUE-40 — Crear a la cajera: no confirma la contraseña ni dice cuál es su usuario de entrada 🟡
- **Pantalla / flujo:** Usuarios → Nuevo (tarea 2.14).
- **Evidencia:** `usuarios/page.tsx:257-266` (campo "Nombre", sin decir que es el usuario con el que entra), `288-301` (contraseña oculta, sin
  confirmación ni ojo para mostrarla), `123-126` (mínimo 6 caracteres; el mensaje solo sale al enviar).
- **Qué vive la usuaria:** Escribe una contraseña a ciegas, se equivoca de tecla y la cajera no puede entrar el lunes. Tampoco ve
  una pantalla final con "Karla entra con usuario *Karla* y la contraseña que pusiste".
- **Recomendación:** botón "mostrar" en el campo, rótulo "Nombre (con este nombre entra)"; al terminar, toast o recuadro:
  "Listo. Karla entra con el nombre «Karla» y la contraseña que acabas de poner".
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-41 — La dueña puede cambiarse el rol a sí misma sin confirmación ⚪
- **Pantalla / flujo:** Usuarios.
- **Evidencia:** `usuarios/page.tsx:214-216` (botón "Rol" visible también para uno mismo), `191` (`esYo` por nombre, no por id). El servidor
  impide quedarse sin dueña activa, pero con dos dueñas una puede degradarse sola.
- **Qué vive la usuaria:** Un toque equivocado en "Rol" y "Guardar": pierde acceso a Estadísticas al instante.
- **Recomendación:** ocultar "Rol" para uno mismo (como "Desactivar") y comparar por `id`.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### Lenguaje y formatos

### DUE-42 — Jerga contable y de sistema que se coló 🟡
- **Pantalla / flujo:** Varias.
- **Evidencia:** "Lotes de inventario activos", "@$0.85", "Present.", "ID 0007" (`inventario/page.tsx:478-482, 620, 649`); "Múltiplo" / "Factor conversión"
  (DUE-13); "Estado de pago", "Capital de la dueña", "aporte del dueño en especie", "Origen del inventario" (`CompraForm.tsx:298,306,315,337`);
  "Descuadre", "Cierre declarado", "Desc.", "op.", "Turno #" (`movimientos/page.tsx:578,690,695,699,662`); "Solo ADMIN", "balance de la caja"
  (`848,814`); "Tipo de gasto: Fijo/Variable" (`gastos/page.tsx:431`); "Edición de producto… El stock sigue bloqueado por seguridad"
  (`EditProductDialog.tsx:235`). El glosario cubre "Gaveta/Bóveda" y los movimientos, pero no estos.
- **Qué vive la usuaria:** Cada rato se topa con una palabra que no usa en la tienda ("lote", "declarado", "capital") y duda de
  qué está confirmando.
- **Recomendación:** ampliar `lib/glosario.ts` con: lote → "compra/tanda (cuánto entró y a qué costo)"; "Múltiplo" → "Unidades que
  trae"; "Cierre declarado" → "Lo que contó"; "Descuadre" → "Faltó / Sobró"; "Capital de la dueña" → "Dinero mío (no sale del
  negocio)"; "op." → "ventas"; "Turno #12" → "Turno del 24 nov (Karla)". Revisar con la dueña real.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

### DUE-43 — Fechas con tres formatos y números sin $ o con signos distintos ⚪
- **Pantalla / flujo:** Varias.
- **Evidencia:** `inventario/page.tsx:652,775` (`toLocaleDateString('es-SV')`), `gastos/page.tsx:383` (`'es-ES'` con mes corto), `movimientos/page.tsx:667`
  (`date-fns` "dd MMM yyyy"); `movimientos/page.tsx:578` ("+5.00" sin $); gastos en rojo con "−$" mientras Estadísticas los muestra
  en gris con "−".
- **Qué vive la usuaria:** "24/11/2026", "24 nov" y "24 nov 2026, 09:15" para lo mismo; un descuadre sin signo de dinero.
- **Recomendación:** una función `formatFecha(iso, "corta" | "con hora")` en `lib/format.ts` y usarla en todas; montos siempre con
  `formatMoney`.
- **Esfuerzo:** S
- **Confianza:** Confirmado en código

---

## 7. Lo que está bien y hay que conservar

- **La frase de cabecera de Estadísticas** ("Este mes ganaste $X (de $Y vendidos)", con "Qué mirar primero" al perder y la nota de
  qué incluye). Es la mejor pieza de la app para la dueña.
- **"Te quedan por cada $100 vendidos"** y **"Lo que costó lo vendido"**: traducciones muy buenas del margen y del costo.
- **El arqueo de bóveda:** muestra la diferencia en vivo, pide motivo solo cuando hace falta y el botón dice exactamente lo que va a
  pasar ("Confirmar: dejar $X"). Mismo estilo en "Poner dinero" ("pasará de $A a $B").
- **Anular sin borrar** con diálogo que dice qué pasa con el dinero y pide motivo; el patrón se repite igual en Gastos, Compras,
  Mermas y Movimientos.
- **Desactivar usuario:** botón destructivo, texto claro, reversible, con protección de la última dueña.
- **Precio en un toque** con vista de "de $A a $B" y validación en el campo (nada se corrige en silencio).
- **Buscador de Inventario** sin acentos, por nombre, presentación o código; **Movimientos** con búsqueda por número de venta que
  abre el desglose con nombre de producto y quién vendió.
- **"Registrar y avisar"** aplicado en gastos, abonos y anulaciones (toasts de 12 s) y "Guardar de todos modos" al cambiar el
  múltiplo de una presentación con ventas.
- **Glosario Gaveta/Bóveda** y `etiquetaMovimiento`, y el filtro "Por revisar" con banner ámbar.
- **Botones de 44 px en celular** (`Button` ya trae `h-11 md:h-…`), foco inicial en "Cancelar" en `ConfirmDialog`, y `aria-pressed`/`aria-expanded`
  en los selectores de período y acordeones.
- **Estadísticas atenuada (no en blanco) mientras recarga** y el guardado de la última categoría usada al crear un producto.

---

## 8. Top 10: mayor impacto con menor esfuerzo

| # | Hallazgo | Esf. | Por qué |
|---|---|---|---|
| 1 | **DUE-02** Confirmar antes de cerrar el diálogo de compra (y no cerrar con clic afuera) | S | Evita perder minutos u horas de carga el primer día. |
| 2 | **DUE-03** Mostrar los avisos de la compra como toast | S | Una línea; arregla "registrar y avisar" en el flujo de más dinero. |
| 3 | **DUE-36** La dueña aterriza en Estadísticas | S | Una línea; responde primero a "¿estoy ganando?". |
| 4 | **DUE-29** Aviso de bóveda debajo de la cabecera y descartable | S | Devuelve la respuesta principal a la primera pantalla. |
| 5 | **DUE-30** + **DUE-31** Renombrar "Vendido" (P&L) y "Faltó en la gaveta"/"echada a perder" | S | Quita dos cifras que confunden o acusan por error. |
| 6 | **DUE-27** Aviso "ventas sin costo registrado" en la ganancia | M | Evita la peor decisión posible: creerse más rica de lo que es. |
| 7 | **DUE-01** Costo por línea con 4 decimales / presentación en la compra (mínimo `step=0.0001`) | S–M | Cuadra el total con la factura y el costo FIFO. |
| 8 | **DUE-06** Texto visible o `aria-label` en "Inventario inicial" y "Nueva compra" | S | Acción más importante del primer día hoy es un ícono. |
| 9 | **DUE-21** Mostrar "esperado", "vendido" y la explicación de la cajera en el turno cerrado | M | Convierte "faltó $3" en una respuesta. |
| 10 | **DUE-15** + **DUE-19** Explicar por qué no hay "Anular" y preseleccionar Bóveda sin turno | S | Dos mensajes que ahorran frustración en las tareas administrativas frecuentes. |

Siguientes (impacto alto, esfuerzo mayor): DUE-05 (conteo de inventario), DUE-24 (libro de la bóveda), DUE-32/37 (reorganizar el
dinero y los nombres), DUE-28 (comparar con el mes pasado).
