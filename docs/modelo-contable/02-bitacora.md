# Bitácora — Bloque 1 (Modelo de Efectivo)

> Registro cronológico del avance. Fuente de verdad del **estado** — no confiar en
> la memoria de la conversación; leer aquí.

## Estado global

**Sub-fase actual:** Planificación (1.A aún no iniciada).

| Sub-fase | Estado | Notas |
|---|---|---|
| 1.A · `usuario_id` | ⬜ Pendiente | — |
| 1.B · Decimal (fraccionados) | ⬜ Pendiente | — |
| 1.C · origen→destino + bóveda derivada | ⬜ Pendiente | — |
| 1.D · retiro personal + gastos bóveda | ⬜ Pendiente | — |
| 1.E · traslados cierre/apertura | ⬜ Pendiente | — |
| 1.F · carga inicial inventario | ⬜ Pendiente | — |

---

## Entradas

### 2026-07-05 — Arranque
- Leído el `plan-fases.md`: Fases 0-3 del plan técnico original cerradas. El trabajo
  abierto es el **Bloque 1** de la [auditoría de negocio/contable](../auditorias/2026-07-04-auditoria-negocio-contable.md) §10.
- Explorado el backend (schema, servicios de movimientos/cajas/caja_general/ajustes,
  jwt.strategy). Diagnóstico F1-F7 documentado en [`00-especificaciones.md`](00-especificaciones.md) §3.
- Decisiones del usuario: **D1 fraccionados = SÍ** (Decimal), **D2 alcance = backend + frontend**.
- Decisión de diseño **D3**: bóveda derivada del libro origen/destino (single source of
  truth); se elimina la tabla `caja_general` como fuente y se arrastran las fugas C/D al
  Bloque 1 por estar acopladas al ítem 4.
- Creada la rama `feature/bloque1-modelo-contable` y `docs/modelo-contable/` con Specs + Plan.

---

## Decisiones (tracking)

| ID | Decisión | Estado |
|---|---|---|
| D1 | Fraccionados → Int vs Decimal | ✅ Decimal(12,3) propuesto |
| D2 | Alcance backend-only vs +frontend | ✅ Backend + frontend por sub-fase |
| D3 | Bóveda derivada vs tabla caja_general | ✅ Derivada (elimina caja_general) |
| — | Precisión decimal exacta | 🔲 Por confirmar (1.B) |
| — | Etiquetas/íconos "Sacar dinero" | 🔲 Por confirmar (1.D) |
