# Bitácora del Rediseño UX/UI

> Registro cronológico del avance. Es la **fuente de verdad del estado**: no
> confiamos en la memoria de la conversación. Cada entrada apunta a sus commits.

## Estado global

**Fase actual:** Planificación (Fase 0 aún no iniciada).

| Fase | Estado | Notas |
|---|---|---|
| 0 · Fundaciones | ⬜ Pendiente | — |
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
- **Pendiente:** validación conjunta de Specs/Plan antes de arrancar Fase 0.

---

## Decisiones abiertas (tracking)

| ID | Decisión | Estado |
|---|---|---|
| R1 | Radio base: 2px / 0px / 1px | 🔲 Por confirmar (Fase 0) |
| R2 | Tema por defecto: claro u oscuro | 🔲 Por confirmar (Fase 0) |
| R3 | Gastos + CAJERO: ocultar vs estado "sin permiso" | 🔲 Por confirmar (Fase 1/4) |
| R4 | Gráficos de Estadísticas: SVG propio vs librería | 🔲 Por confirmar (Fase 5) |
