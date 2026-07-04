# Especificaciones de Rediseño UX/UI — ERP/POS Tienda Karlita

> **Estado:** Borrador para revisión conjunta · **Fecha:** 2026-07-04 · **Rama:** `feature/rediseno-ux`
>
> Este documento es la **fuente de verdad** del rediseño de interfaz. Describe el
> *qué* y el *porqué*. El *cómo* y el *cuándo* viven en
> [`01-plan-implementacion.md`](01-plan-implementacion.md). El progreso real se
> registra en [`02-bitacora.md`](02-bitacora.md).

---

## 1. Propósito y alcance

Rediseñar la **interfaz y la experiencia de uso** del frontend del ERP/POS, sin
tocar backend ni lógica de negocio. El objetivo es una UI **rápida, legible y
sin distracciones** para uso táctil de jornada completa, alejándose del look
"genérico de IA" actual.

**Sí cubre:** sistema de diseño (tokens, tipografía, radios, componentes),
navegación mobile-first, y el rediseño de las 6 pantallas.

**No cubre:** backend/NestJS, esquema de BD, contratos de API, lógica de negocio
(ventas, caja, FIFO), ni el *hardening* de seguridad (eso vive en
[`docs/roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md)).

---

## 2. Contexto de negocio y usuarios

- **Producto:** POS + ERP para una tienda / puesto de mercado minorista en El Salvador.
- **Prioridad absoluta** (heredada de [`GEMINI_FRONT.md`](../../erp-tienda-frontend/GEMINI_FRONT.md)):
  **velocidad de uso en pantallas táctiles**, claridad visual y cero distracciones.
- **Usuarios:**
  - **Cajero (`CAJERO`):** opera el POS todo el día. Ve POS, Inventario, Movimientos, Gastos.
  - **Administrador (`ADMIN`):** además ve Estadísticas y gestiona todo.
- **Entorno físico:** iluminación variable (interior con poca luz ↔ mercado a
  plena luz del día). → Justifica soportar **tema claro y oscuro**.
- **Hardware probable:** tablets/teléfonos táctiles y, en administración, escritorio.
  Existe **lector de código de barras** (ver [`useBarcodeScanner`](../../erp-tienda-frontend/hooks/useBarcodeScanner.ts)),
  así que el foco de teclado y la captura global de escaneo deben preservarse.

---

## 3. Diagnóstico del estado actual

Resumen del análisis de la codebase (evidencia cuantificada). Este es el punto de
partida que el rediseño debe corregir.

| # | Problema | Evidencia | Impacto |
|---|----------|-----------|---------|
| D1 | **Design tokens muertos.** `globals.css` define un tema *claro* con variables CSS, pero la app hardcodea un tema oscuro a mano. | `text-white`×144, `bg-black`×80, `border-zinc-800`×116, cientos de `zinc/blue`. `next-themes` instalado pero **sin usar** para theming. | No hay fuente de verdad de color. Cambiar algo global exige editar 3000+ líneas. Imposible ofrecer light/dark. |
| D2 | **`border-radius` excesivo** ("look IA"). | 200+ usos: `rounded-xl`×92, `rounded-2xl`×31, `rounded-full`×12, hasta `rounded-4xl`. | Estética genérica que el negocio quiere abandonar. |
| D3 | **Mobile-first incumplido.** La regla declarada (bottom-nav + bottom-sheets) no se aplica. | Navegación móvil = hamburguesa + `Sheet` lateral ([`layout.tsx:146`](../../erp-tienda-frontend/app/dashboard/layout.tsx)). No hay bottom-nav en ninguna parte. | Ergonomía táctil pobre; el pulgar no alcanza la navegación superior. |
| D4 | **Layout del POS roto en móvil.** Catálogo y carrito usan ambos `h-full` dentro de un `h-screen` en `flex-col`. | [`pos/page.tsx:317`](../../erp-tienda-frontend/app/dashboard/pos/page.tsx) | En móvil los paneles se apilan y desbordan → la pantalla más crítica es inusable en teléfono. **A verificar y corregir.** |
| D5 | **Estética "dribbble/IA".** Glows de color, blur y tipografía recargada. | `shadow-[0_0_15px_rgba(37,99,235,…)]`, `backdrop-blur-xl`, `font-black uppercase tracking-widest` omnipresentes. | Ruido visual, fatiga en jornadas largas, baja jerarquía real. |
| D6 | **Sin capa de diseño propia.** Cada pantalla reimplementa estilos inline; los primitivos shadcn (sobrios) se ignoran o sobrescriben. | Páginas monolíticas: POS 736 LOC, Inventario 615, Movimientos 550. | Inconsistencia y coste de mantenimiento alto. Corroborado por la auditoría (§4.3: "Página POS monolítica"). |
| D7 | **UX de rol inconsistente.** El `CAJERO` ve "Gastos" en el nav pero el backend responde 403. | [`layout.tsx:67`](../../erp-tienda-frontend/app/dashboard/layout.tsx) + auditoría H35. | El usuario llega a una pantalla que falla. Debe resolverse en UI (ocultar o estado claro), sin tocar backend. |

---

## 4. Principios de diseño

Estos principios gobiernan cada decisión del rediseño:

1. **Velocidad y claridad por encima de decoración.** Cada elemento justifica su
   existencia por la tarea del cajero, no por estética.
2. **Mobile-first real.** Se diseña primero para el pulgar en una pantalla táctil;
   escritorio es una progresión, no el punto de partida. Acciones al alcance:
   **bottom navigation** + **bottom sheets**.
3. **Los tokens son la única fuente de verdad.** Cero colores/valores hardcodeados
   en las pantallas. Todo color, espacio y radio sale de una variable.
4. **Estética "Estación de trabajo" (funcional/suiza).** Esquinas rectas, retícula
   estricta, superficies neutras con un acento fuerte, y **cifras en fuente mono**.
   Sobria, densa y honesta.
5. **Accesibilidad táctil.** Objetivos interactivos ≥ 44px en móvil; contraste
   mínimo AA; foco visible; nada depende solo del color.
6. **No romper lo que funciona.** La lógica (stores Zustand, `api.ts`, escaneo,
   flujos de caja/venta) se preserva; el rediseño es de la **capa visual**.

---

## 5. Sistema de diseño objetivo

### 5.1 Color (tokens)

Se **reconstruyen** las variables de [`globals.css`](../../erp-tienda-frontend/app/globals.css)
para que sean semánticas y **realmente usadas**, con `:root` (claro) y `.dark`
(oscuro). Valores iniciales propuestos en `oklch` (afinables en Fase 0):

| Token semántico | Uso | Claro (aprox.) | Oscuro (aprox.) |
|---|---|---|---|
| `--background` | Lienzo de la app | `oklch(0.97 0 0)` gris muy claro | `oklch(0.16 0 0)` casi negro (no `#000`) |
| `--card` / superficie | Tarjetas, paneles, tablas | `oklch(1 0 0)` blanco | `oklch(0.205 0 0)` |
| `--foreground` | Texto principal | `oklch(0.20 0 0)` | `oklch(0.96 0 0)` |
| `--muted-foreground` | Texto secundario | `oklch(0.50 0 0)` | `oklch(0.68 0 0)` |
| `--border` | Bordes hairline | `oklch(0.90 0 0)` | `oklch(1 0 0 / 12%)` |
| `--primary` | Acción principal (botones, activo) | `oklch(0.52 0.20 255)` azul | `oklch(0.62 0.19 255)` |
| `--success` | Venta OK, stock disponible, entradas | verde `~0.60 0.15 155` | `~0.70 0.16 155` |
| `--warning` | Caja, alertas suaves, stock bajo | ámbar `~0.72 0.15 75` | `~0.78 0.15 75` |
| `--destructive` | Errores, agotado, salidas | rojo `~0.55 0.22 27` | `~0.70 0.19 22` |

**Reglas:**
- El acento azul deja de ser un neón con glow; pasa a ser un acento funcional.
- Los colores semánticos (venta, caja, stock) se estandarizan como tokens, no como
  `emerald-500`/`amber-600` sueltos repartidos por el código.
- Se elimina el uso de `bg-black`, `bg-white`, `zinc-*`, `blue-600`, etc. en las
  pantallas: todo pasa por `bg-background`, `bg-card`, `text-foreground`, `bg-primary`…

### 5.2 Radios (la regla clave)

Nueva escala, drásticamente reducida:

```
--radius: 0.125rem;   /* 2px — base para superficies rectangulares */
```

- **Superficies y controles** (botones, inputs, cards, diálogos, tabs, tablas,
  contenedores): **2px** (`rounded-[2px]` vía token). Crisp, no brutal.
- **`rounded-full` permitido SOLO en:** *pills*/badges de estado, avatares,
  *switches*, *spinners* y el FAB móvil (donde el círculo es estructural).
- **Prohibido en superficies:** `rounded-md`, `rounded-lg`, `rounded-xl`,
  `rounded-2xl`, `rounded-3xl`, `rounded-4xl`.
- Criterio de aceptación verificable: `grep -rE 'rounded-(lg|xl|2xl|3xl|4xl)'`
  devuelve solo excepciones explícitamente documentadas (idealmente cero).

> **Nota para revisión:** 2px da un borde "casi recto" pero moderno. Si prefieres
> **0px absoluto** (más brutalista) o **1px**, se ajusta un solo token. Lo
> confirmamos al arrancar Fase 0.

### 5.3 Tipografía

- **`Geist Sans`** para toda la UI. **`Geist Mono`** para **cifras**: precios,
  totales, stock, cantidades, códigos de barras y horas en tablas. La cifra
  alineada en mono es más rápida de leer y comparar en un POS.
- Se retira el `uppercase` + `tracking-widest` como estilo por defecto. El
  `UPPERCASE` se reserva para *eyebrows*/labels pequeños puntuales.
- Escala de pesos: 400 (cuerpo), 500 (medium), 600 (semibold, títulos/énfasis),
  700 (totales clave). Se retira `font-black` (900) como peso por defecto.

### 5.4 Espaciado, elevación e iconografía

- **Espaciado:** retícula base de **4px** (múltiplos 4/8/12/16/24…).
- **Elevación:** se eliminan los *glows* de color y las sombras dramáticas. La
  separación se logra con **bordes hairline**; las sombras se reservan para
  *overlays* (diálogo, sheet, dropdown) y son neutras y sutiles.
- **Iconografía:** `lucide-react`, tamaño y `stroke-width` consistentes.

### 5.5 Componentes

**Primitivos a normalizar** (en `components/ui/`, a la nueva estética):
`button`, `input`, `label`, `textarea`, `select`, `card`, `dialog`, `sheet`,
`tabs`, `table`, `badge`, `separator`, `scroll-area`, `sonner`.

**Patrones nuevos / rediseñados** (en `components/`):

| Componente | Rol |
|---|---|
| `BottomNav` | Navegación móvil inferior (5 destinos, icono + label, activo marcado). |
| `AppShell` / `Sidebar` | Estructura desktop (sidebar persistente) sobria y tokenizada. |
| `BottomSheet` | Contenedor de acciones en móvil (abrir/cerrar caja, alta de producto, filtros, carrito). |
| `DataView` (tabla/lista responsiva) | Tabla en desktop ↔ tarjetas/filas en móvil. |
| `StatCard` | Métrica para Estadísticas. |
| `MoneyValue` | Formatea moneda en mono con color/signo semántico. |
| `StatePill` | Estado de stock (disponible/bajo/agotado) y de caja (abierta/cerrada). |
| `ThemeToggle` | Cambio claro/oscuro (usa `next-themes`). |
| `PageHeader` / `EmptyState` | Encabezados y estados vacíos consistentes. |

---

## 6. Navegación y layout

- **Móvil (base):**
  - **Bottom navigation** con los destinos permitidos por rol.
  - Acciones principales en **bottom sheets** (no diálogos centrados).
  - Encabezado superior mínimo (título + acción contextual).
- **Escritorio (progresión):**
  - **Sidebar** persistente (rediseñado, tokenizado, esquinas rectas).
  - Layouts *split* donde aporta (POS: catálogo + ticket).
- **Roles:** el filtrado por rol ya existe en el layout; se conserva y se corrige
  el caso D7 (Gastos para `CAJERO`).

---

## 7. Especificación por pantalla

Detalle a nivel de objetivos y problemas; el detalle fino se aterriza en la fase
de cada pantalla.

### 7.1 Login — [`app/auth/login/page.tsx`](../../erp-tienda-frontend/app/auth/login/page.tsx)
- **Objetivo:** entrada sobria y rápida. Quitar glow/blur decorativo del
  [`auth/layout.tsx`](../../erp-tienda-frontend/app/auth/layout.tsx), card recta,
  branding limpio. Conservar el flujo login→cookie→`/dashboard/pos`.

### 7.2 POS ("Vender") — [`app/dashboard/pos/page.tsx`](../../erp-tienda-frontend/app/dashboard/pos/page.tsx) ⭐
- **Es la pantalla estrella.** Flujo: buscar/escanear → agregar al ticket →
  ajustar cantidades → cobrar; más apertura/cierre de caja.
- **Móvil:** catálogo a pantalla completa (búsqueda + escaneo arriba, categorías
  en chips scrollables); el **ticket es un bottom sheet** con badge de total y nº
  de artículos, que se expande para revisar y cobrar. Apertura/cierre de caja en
  bottom sheets.
- **Desktop:** se conserva el *split* catálogo (8) / ticket (4), reescrito a
  tokens y esquinas rectas, cifras en mono.
- **Correcciones obligatorias:** D4 (layout `h-full`/`h-screen`), quitar glows,
  botón "Procesar pago" grande pero sobrio, targets ≥44px.

### 7.3 Inventario — [`app/dashboard/inventario/page.tsx`](../../erp-tienda-frontend/app/dashboard/inventario/page.tsx)
- Listado de productos/presentaciones con estado de stock. Diálogos
  [`ProductDialog`](../../erp-tienda-frontend/components/inventario/ProductDialog.tsx),
  [`EditProductDialog`](../../erp-tienda-frontend/components/inventario/EditProductDialog.tsx),
  [`AjusteInventarioDialog`](../../erp-tienda-frontend/components/inventario/AjusteInventarioDialog.tsx),
  [`CompraForm`](../../erp-tienda-frontend/components/inventario/CompraForm.tsx).
- **Objetivo:** `DataView` responsiva (tabla desktop ↔ tarjetas móvil), `StatePill`
  para stock, formularios como sheets/diálogos rectos.

### 7.4 Movimientos — [`app/dashboard/movimientos/page.tsx`](../../erp-tienda-frontend/app/dashboard/movimientos/page.tsx)
- Historial de movimientos financieros/inventario. **Objetivo:** `DataView`
  responsiva; montos en `MoneyValue` (mono + color semántico entrada/salida);
  filtros por tipo/fecha accesibles en móvil.

### 7.5 Gastos — [`app/dashboard/gastos/page.tsx`](../../erp-tienda-frontend/app/dashboard/gastos/page.tsx)
- Registro y listado de gastos. **Objetivo:** formulario táctil + lista; **resolver
  D7** (rol `CAJERO`): decidir con el usuario si se oculta del nav o se muestra un
  estado "sin permiso" claro.

### 7.6 Estadísticas — [`app/dashboard/stats/page.tsx`](../../erp-tienda-frontend/app/dashboard/stats/page.tsx)
- Panel de métricas (solo `ADMIN`). **Objetivo:** `StatCard`s + visualizaciones
  sobrias, cifras en mono.
- **Decisión pendiente:** hoy no hay librería de gráficos en `package.json`. En su
  fase decidiremos entre SVG propio ligero o una librería (p. ej. Recharts). **Se
  consultará antes de añadir dependencias.**

---

## 8. Requisitos no funcionales y restricciones

- **No tocar backend** ni contratos de API; preservar los payloads que consume
  [`lib/api.ts`](../../erp-tienda-frontend/lib/api.ts).
- **Preservar estado y lógica:** [`cartStore`](../../erp-tienda-frontend/src/store/cartStore.ts),
  [`inventoryStore`](../../erp-tienda-frontend/src/store/inventoryStore.ts), escaneo, y flujos de caja/venta.
- **Accesibilidad:** contraste AA en ambos temas, foco visible, `label`s asociadas.
- **Sin dependencias nuevas pesadas** sin consultar (especialmente gráficos).
- **Sin regresiones funcionales:** vender, abrir/cerrar caja, alta/ajuste de
  inventario y registro de movimientos/gastos deben seguir funcionando.

---

## 9. Fuera de alcance

Backend, base de datos, lógica de negocio, nuevas funcionalidades, refactors
profundos de estado (más allá de lo mínimo para desacoplar la vista) y el
*hardening* de seguridad (JWT httpOnly, middleware, etc. — ya listado en el
backlog de hardening).

---

## 10. Criterios de aceptación globales

El rediseño se considera correcto cuando:

1. **Cero colores hardcodeados nuevos:** todo color sale de un token.
2. **Radios bajo control:** `grep -rE 'rounded-(lg|xl|2xl|3xl|4xl)'` sobre `app/`
   y `components/` devuelve solo excepciones documentadas (meta: 0).
3. **Ambos temas funcionan** vía toggle, con contraste AA.
4. **Móvil real:** bottom-nav operativo, sin desbordes, objetivos ≥44px, POS usable
   en teléfono.
5. **Sin regresiones funcionales** en los flujos críticos.
6. **Consistencia:** las pantallas usan los primitivos/patrones compartidos, no
   estilos inline ad-hoc.

---

## 11. Decisiones abiertas (para confirmar durante la ejecución)

- **R1 — Radio base:** 2px (propuesto) vs 0px absoluto vs 1px.
- **R2 — Tema por defecto:** ¿claro u oscuro al primer arranque? (el toggle existe igual).
- **R3 — Gastos + CAJERO (D7):** ¿ocultar del nav o mostrar estado "sin permiso"?
- **R4 — Gráficos de Estadísticas:** SVG propio vs librería (Recharts u otra).

> Estas decisiones no bloquean el arranque (Fase 0 es agnóstica a ellas) y se
> resolverán al llegar a la fase correspondiente.
