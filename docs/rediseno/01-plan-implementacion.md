# Plan de Implementación — Rediseño UX/UI

> **Estado:** Borrador para revisión conjunta · **Fecha:** 2026-07-04 · **Rama:** `feature/rediseno-ux`
>
> El *qué/porqué* está en [`00-especificaciones.md`](00-especificaciones.md).
> Este documento define el *cómo* y el *cuándo*. El avance real se registra en
> [`02-bitacora.md`](02-bitacora.md).

---

## Estrategia

- **Progresiva e iterativa.** Primero las **fundaciones** (para no repintar dos
  veces), luego **pantalla por pantalla**. Cada fase entrega algo verificable.
- **Foundation-first, no big-bang.** Fase 0 y 1 establecen tokens, tema y
  navegación; a partir de ahí cada pantalla se migra encima de una base sólida.
- **Nada se da por terminado sin verificar** en móvil y escritorio, en ambos temas.

## Flujo de trabajo Git

- Se trabaja en **`feature/rediseno-ux`**.
- **Commits descriptivos y frecuentes** por tarea (Conventional Commits, en español).
- **Al cerrar cada fase:** merge de `feature/rediseno-ux` → `master` y `push` de
  ambas a `origin`. Luego se continúa la siguiente fase sobre la misma rama.
- Formato de commit sugerido: `feat(rediseno): …`, `refactor(ui): …`, `fix(pos): …`,
  `docs(rediseno): …`.

## Cómo verificar cada fase

1. `cd erp-tienda-frontend && npm run dev` (puerto 3001).
2. Revisar en viewport **móvil** y **escritorio**, y en **tema claro y oscuro**.
3. `npm run lint` sin errores nuevos y `npm run build` sin romper.
4. Ejecutar los *greps* de control (radios y colores hardcodeados).
5. Probar el flujo funcional afectado (no romper ventas/caja/inventario).

---

## Fases

### Fase 0 — Fundaciones del sistema de diseño
**Objetivo:** tokens vivos (claro+oscuro), tema conmutable y primitivos alineados
a la estética "estación de trabajo". Sin rediseñar pantallas todavía.

**Archivos:** `app/globals.css`, `app/layout.tsx`, `components.json` (si aplica),
`components/ui/*` (button, input, card, dialog, sheet, tabs, table, badge, select,
textarea, label, separator), nuevo `components/theme-toggle.tsx` y
`components/theme-provider.tsx`, `lib/utils.ts` (helpers de formato si aplica).

**Tareas:**
1. Reconstruir tokens de color en `globals.css` (`:root` + `.dark`) según §5.1 de las specs.
2. Reducir la escala de radios a 2px base y documentar la regla (§5.2). Definir R1.
3. Integrar `ThemeProvider` (`next-themes`) en el root layout + `ThemeToggle`. Definir R2 (tema por defecto).
4. Tipografía: cablear `Geist Mono` para cifras; retirar `uppercase/tracking` por defecto (§5.3).
5. Normalizar los primitivos `components/ui/*`: radios, sin glows, colores por token.
6. Crear helpers base: `MoneyValue`, `StatePill` (si conviene adelantarlos aquí).

**Aceptación:** el toggle cambia claro/oscuro sin artefactos; los primitivos se ven
rectos y tokenizados; `build` y `lint` verdes. (Las pantallas pueden verse
"transicionales" hasta su fase — es esperado.)

---

### Fase 1 — Shell de navegación (mobile-first)
**Objetivo:** navegación correcta según las specs (§6): bottom-nav en móvil,
sidebar sobrio en escritorio, y `BottomSheet` base reutilizable.

**Archivos:** `app/dashboard/layout.tsx`, nuevo `components/nav/BottomNav.tsx`,
`components/nav/Sidebar.tsx`, `components/ui/bottom-sheet.tsx` (o adaptar `sheet`).

**Tareas:**
1. Extraer la navegación del layout monolítico a componentes.
2. `BottomNav` móvil (destinos por rol) + `Sidebar` desktop rediseñado.
3. `BottomSheet` reutilizable (base para POS/Inventario/etc.).
4. Resolver D7/R3 (Gastos + CAJERO) a nivel de navegación.

**Aceptación:** navegación por pulgar en móvil; sidebar recto en desktop; sin
hamburguesa como navegación primaria; roles correctos.

---

### Fase 2 — POS ("Vender") ⭐
**Objetivo:** rediseñar la pantalla estrella, mobile-first, corrigiendo D4.

**Archivos:** `app/dashboard/pos/page.tsx` (y extracción de subcomponentes:
`CatalogList`, `CartSheet`, `CajaSheets`, `CheckoutBar`).

**Tareas:**
1. Corregir el layout `h-full`/`h-screen` (D4).
2. Móvil: catálogo full + ticket como bottom sheet + checkout accesible.
3. Desktop: split catálogo/ticket reescrito a tokens y rectas, cifras en mono.
4. Apertura/cierre de caja como bottom sheets (móvil) / diálogos rectos (desktop).
5. Preservar escaneo global y toda la lógica de `cartStore`/ventas.

**Aceptación:** vender de principio a fin en teléfono y en escritorio, ambos temas,
sin glows, targets ≥44px, sin regresiones de caja/venta.

---

### Fase 3 — Inventario (+ diálogos)
**Objetivo:** listado responsivo y formularios táctiles.

**Archivos:** `app/dashboard/inventario/page.tsx`, `components/inventario/*`.

**Tareas:** `DataView` (tabla↔tarjetas), `StatePill` de stock, migrar
`ProductDialog`/`EditProductDialog`/`AjusteInventarioDialog`/`CompraForm` a
sheets/diálogos rectos y tokenizados.

**Aceptación:** alta/edición/ajuste/compra funcionan en móvil y desktop, ambos temas.

---

### Fase 4 — Movimientos + Gastos
**Objetivo:** historiales y registro con la nueva base.

**Archivos:** `app/dashboard/movimientos/page.tsx`, `app/dashboard/gastos/page.tsx`.

**Tareas:** `DataView` responsiva, `MoneyValue` con color semántico, filtros
táctiles; en Gastos, aterrizar la decisión D7/R3.

**Aceptación:** listar/filtrar/registrar sin regresiones; rol CAJERO coherente.

---

### Fase 5 — Estadísticas
**Objetivo:** panel de métricas sobrio (solo ADMIN).

**Archivos:** `app/dashboard/stats/page.tsx`, `components/stats/*`.

**Tareas:** `StatCard`s, cifras en mono; **decidir R4** (SVG propio vs librería de
gráficos) — se consulta antes de añadir dependencias.

**Aceptación:** métricas legibles en móvil y desktop, ambos temas.

---

### Fase 6 — Login, pulido y auditoría final
**Objetivo:** cerrar el círculo y verificar los criterios globales.

**Archivos:** `app/auth/login/page.tsx`, `app/auth/layout.tsx`, `app/error.tsx`,
`app/not-found.tsx`, `app/loading.tsx`, barrido general.

**Tareas:**
1. Rediseñar login/auth (quitar glow/blur, card recta).
2. Estados globales (error, 404, loading) tokenizados.
3. **Auditoría final** contra §10 de las specs: greps de radios y colores,
   contraste AA, QA móvil en ambos temas, `build`+`lint`.

**Aceptación:** todos los criterios de aceptación globales cumplidos.

---

## Seguimiento

| Fase | Descripción | Estado |
|---|---|---|
| 0 | Fundaciones del sistema de diseño | ⬜ Pendiente |
| 1 | Shell de navegación (mobile-first) | ⬜ Pendiente |
| 2 | POS ⭐ | ⬜ Pendiente |
| 3 | Inventario (+ diálogos) | ⬜ Pendiente |
| 4 | Movimientos + Gastos | ⬜ Pendiente |
| 5 | Estadísticas | ⬜ Pendiente |
| 6 | Login, pulido y auditoría final | ⬜ Pendiente |

> Leyenda: ⬜ Pendiente · 🔄 En curso · ✅ Completada. El detalle de cada avance se
> registra en [`02-bitacora.md`](02-bitacora.md).
