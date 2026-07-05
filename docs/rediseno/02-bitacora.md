# Bitácora del Rediseño UX/UI

> Registro cronológico del avance. Es la **fuente de verdad del estado**: no
> confiamos en la memoria de la conversación. Cada entrada apunta a sus commits.

## Estado global

**Fase actual:** Fase 3 completada; siguiente = Fase 4 (Movimientos + Gastos).

| Fase | Estado | Notas |
|---|---|---|
| 0 · Fundaciones | ✅ Completada | Tokens claro/oscuro, `--radius` 2px, ThemeProvider + toggle, MoneyValue. |
| 1 · Navegación | ✅ Completada | Bottom-nav + sidebar tokenizados, mapa de permisos por rol, guard + ForbiddenState, BottomSheet base. |
| 2 · POS ⭐ | ✅ Completada | Rewrite mobile-first: catálogo full + ticket en bottom-sheet (móvil) / split (desktop); D4 corregido; tokens + mono; caja en diálogos tokenizados. |
| 3 · Inventario | ✅ Completada | Página (3 tabs) + 4 diálogos tokenizados; DataView responsiva (tabla↔tarjetas), StatePill de stock; fix bug botón Cancelar en Ajuste. |
| 2 · POS | ⬜ Pendiente | — |
| 3 · Inventario | ⬜ Pendiente | — |
| 4 · Movimientos + Gastos | ⬜ Pendiente | — |
| 5 · Estadísticas | ⬜ Pendiente | — |
| 6 · Login + auditoría | ⬜ Pendiente | — |

---

## Entradas

### 2026-07-04 — Arranque del proyecto
- Exploración completa de la codebase (stack, 6 pantallas, tokens, radios, mobile).
- Diagnóstico documentado (D1–D7) en [`00-especificaciones.md`](00-especificaciones.md).
- Decisiones de dirección acordadas con el usuario:
  - **Estética:** Funcional / Estación de trabajo.
  - **Tema:** claro + oscuro con toggle (reconstruyendo tokens).
  - **Git:** rama `feature/rediseno-ux`, merge a `master` por fase.
- Creada la rama `feature/rediseno-ux` y la carpeta `docs/rediseno/` con Specs + Plan.

### 2026-07-04 — Decisiones resueltas por el usuario
- R1 = 2px · R2 = tema oscuro por defecto · R3 = mapa de permisos por rol (más
  escalable) · R4 = Recharts. Detalle en Specs §11.

### 2026-07-04 — Fase 0: Fundaciones del sistema de diseño ✅
- **`app/globals.css`**: reconstruidos los design tokens (`:root` claro + `.dark`
  oscuro) con semántica real y nuevos tokens `--success`/`--warning` (+ foregrounds
  y `--destructive-foreground`). `--radius` bajado a **2px** → reduce el radio de
  todas las clases `rounded-*` app-wide de inmediato.
- **Tema conmutable**: `components/theme-provider.tsx` (next-themes,
  `attribute="class"`, `defaultTheme="dark"`), cableado en `app/layout.tsx`
  (+ `suppressHydrationWarning`). Nuevo `components/theme-toggle.tsx`, colocado
  temporalmente en el shell del dashboard (se reubica en Fase 1).
- **Cifras en mono**: `lib/format.ts` (`formatMoney`, USD) + `components/money-value.tsx`.
- **Primitivo `badge`**: `rounded-4xl` → `rounded-full` para preservar la píldora
  con el nuevo `--radius`.
- **Verificación**: `npm run lint` → 0 errores (solo warnings preexistentes);
  `npm run build` → OK, las 10 rutas prerenderizan sin error.
- **Nota**: las pantallas aún hardcodean dark; se ven "transicionales" hasta su
  fase. Con el default oscuro, la experiencia normal no cambia. La QA visual del
  toggle se hará en Fase 1, cuando el shell ya use tokens.

### 2026-07-04 — Fase 1: Shell de navegación (mobile-first) ✅
- **Mapa de permisos por rol** (`lib/navigation.ts`, fuente única, R3/D7): define
  `NAV_ITEMS` con `roles[]` alineados a los `@Roles` reales del backend, más
  `getNavItems`/`canAccessRoute`/`getHomeRoute`. **Gastos = solo ADMIN** (registrar
  egreso toca `/caja-general` POST, ADMIN-only → era el 403 del cajero).
- **Navegación tokenizada, mobile-first**:
  - `components/nav/bottom-nav.tsx`: barra inferior en móvil (safe-area), oculta en desktop.
  - `components/nav/sidebar.tsx`: sidebar de escritorio sobrio (bg-sidebar, rectas,
    sin glows), con usuario + ThemeToggle + logout (preserva reset de cart/inventory).
  - `app/dashboard/layout.tsx` reescrito: sidebar (desktop) + header slim + bottom-nav
    (móvil); **elimina el menú hamburguesa** como navegación primaria.
- **Guard por rol**: `hooks/useCurrentUser.ts` + `canAccessRoute` en el layout →
  `components/forbidden-state.tsx` ("Sin permiso") si un rol accede directo a una
  ruta ajena. Complementa al middleware `proxy.ts` (que solo valida token, no roles).
- **BottomSheet base**: `components/ui/bottom-sheet.tsx` (envuelve Sheet side=bottom
  con asa y max-height) para POS/Inventario en fases siguientes.
- **Verificación**: `npm run lint` 0 errores; `npm run build` OK (10 rutas);
  `npm run dev` sirve `/auth/login` (HTTP 200, contenido correcto) y `/dashboard/pos`
  responde 307 (middleware). ⚠️ La QA visual con capturas no fue posible: la
  herramienta de preview no logra ejecutar el dev server del monorepo en su sandbox
  (el server sí arranca perfecto vía `npm run dev`). Screenshots pendientes de un
  entorno donde el preview alcance el puerto.

### 2026-07-04 — Fase 2: POS (pantalla estrella) ⭐ ✅
- **Rewrite completo de `app/dashboard/pos/page.tsx`** preservando TODA la lógica
  (carrito, caja abrir/cerrar, ventas, escaneo global, selectores useShallow);
  solo cambió la presentación.
- **Layout responsivo (corrige D4)**: en móvil el catálogo va full y el ticket es
  un **bottom-sheet** disparado por una barra de carrito fija sobre el bottom-nav
  (contador + total en mono); en escritorio se mantiene el split catálogo / ticket,
  ahora tokenizado y recto. Se elimina el bug `h-full`/`h-screen`.
- **Piezas reutilizables**: `components/pos/CartLines.tsx` (líneas + control de
  cantidad, targets 44px) y `components/pos/CheckoutSection.tsx` (total, "paga con",
  cambio, botón procesar pago), compartidas entre panel desktop y sheet móvil.
- **Estética**: fuera glows/blur, `bg-black`/zinc/blue hardcodeados y `font-black
  uppercase`; todo por tokens, cifras con `MoneyValue` (mono), esquinas rectas.
  Diálogos de caja sin overrides `bg-zinc` → `bg-popover` tokenizado.
- **Verificación**: lint 0 errores, build OK (10 rutas), dev sirve login (200) y
  protege POS (307), sin errores de compilación. QA visual: misma limitación del
  preview (pendiente de entorno con backend).

### 2026-07-04 — Fase 3: Inventario (+ diálogos) ✅
- **Página `app/dashboard/inventario/page.tsx`** reescrita: 3 pestañas (Catálogo,
  Categorías, Historial) tokenizadas y responsivas. **DataView responsiva**: tabla
  con columnas en desktop, tarjetas condensadas en móvil (oculta ID/categoría/fecha
  según ancho). `StatePill` para stock (verde/rojo) y estado de pago. Cifras con
  `MoneyValue`. Filas expandibles (presentaciones + lotes) tokenizadas. Rol vía
  `useCurrentUser` (reemplaza lectura inline de cookie).
- **4 diálogos migrados** quitando los overrides hardcodeados (los primitivos ya
  son tokenizados): `ProductDialog` (+ `AddPresentacionDialog`), `EditProductDialog`,
  `AjusteInventarioDialog`, `CompraForm` (incluye su select buscable custom).
- **Bug corregido**: el botón "Cancelar" de `AjusteInventarioDialog` no tenía
  `onClick={onClose}` (no cerraba) — ahora sí.
- **Nuevo**: `components/state-pill.tsx` (píldora de estado reutilizable).
- **Verificación**: lint 0 errores, build OK (10 rutas).

---

## Decisiones (tracking)

| ID | Decisión | Estado |
|---|---|---|
| R1 | Radio base | ✅ 2px |
| R2 | Tema por defecto | ✅ Oscuro (con toggle) |
| R3 | Gastos + CAJERO | ✅ Mapa de permisos por rol (impl. Fase 1/4) |
| R4 | Gráficos de Estadísticas | ✅ Recharts (impl. Fase 5) |
