# Bitácora del Rediseño UX/UI

> Registro cronológico del avance. Es la **fuente de verdad del estado**: no
> confiamos en la memoria de la conversación. Cada entrada apunta a sus commits.

## Estado global

**Fase actual:** Fase 0 completada; siguiente = Fase 1 (navegación).

| Fase | Estado | Notas |
|---|---|---|
| 0 · Fundaciones | ✅ Completada | Tokens claro/oscuro, `--radius` 2px, ThemeProvider + toggle, MoneyValue. |
| 1 · Navegación | ⬜ Pendiente | — |
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

---

## Decisiones (tracking)

| ID | Decisión | Estado |
|---|---|---|
| R1 | Radio base | ✅ 2px |
| R2 | Tema por defecto | ✅ Oscuro (con toggle) |
| R3 | Gastos + CAJERO | ✅ Mapa de permisos por rol (impl. Fase 1/4) |
| R4 | Gráficos de Estadísticas | ✅ Recharts (impl. Fase 5) |
