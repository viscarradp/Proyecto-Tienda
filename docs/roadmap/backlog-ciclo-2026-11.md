# Backlog consolidado — Ciclo 2026-11

> **Qué es:** la lista única y priorizada de lo que hay que hacer, deduplicada a partir de las
> 4 auditorías del 2026-11-24 y del recorrido en vivo de la interfaz. Es un documento **vivo**:
> se actualiza al cerrar cada lote. Los informes de origen quedan congelados en `../auditorias/`.
>
> **Fuentes (prefijo del ID):**
> [ARQ](../auditorias/2026-11-24-auditoria-arquitectura.md) ·
> [COD](../auditorias/2026-11-24-auditoria-codigo.md) ·
> [NEG](../auditorias/2026-11-24-auditoria-reglas-negocio.md) ·
> [UX](../auditorias/2026-11-24-auditoria-interfaz.md) ·
> **VIVO** = recorrido en vivo del líder (escritorio 1280 px y celular 375 px, BD de demo).
>
> **Verificación del líder:** los 🔴 se verificaron contra el código; COD-02 se **reprodujo**
> contra la API local (cambiar solo el precio → 400) y COD-01, COD-05, COD-14, UX-03/04 se
> vieron en vivo. UX-01 se bajó a 🟡 (solo afecta HTTP por IP, no producción con HTTPS).
>
> **Principio rector:** *apoyar, no imponer* — ante la duda, registrar y avisar en vez de bloquear.

---

## 1. Decisiones pendientes del negocio

Desbloquean los lotes L5–L8. Detalle y alternativas en la auditoría de reglas (§5).

**Necesarias antes de la primera venta**

| # | Pregunta | Recomendación | Desbloquea |
|---|---|---|---|
| D-03 | ¿Se vende algo por peso o suelto (queso, frijol, azúcar)? | **✅ Decidido 2026-11-24: sí** — cantidad decimal y "por monto" en el ticket | L5 |
| D-01 | Si un producto no tiene stock registrado, ¿se deja vender? | **✅ Decidido 2026-11-24: vender y avisar** — la línea queda "sin stock registrado" | L5 |
| D-02 | ¿La cajera puede vender algo que no está en el catálogo? | **✅ Decidido 2026-11-24: alta rápida** (nombre + precio) "por revisar" | L5 |
| D-04 | Si el sistema cree que no hay efectivo, ¿bloquear el gasto o dejar pasar con aviso? | **✅ Decidido 2026-11-24: registrar y avisar**; asistente de "efectivo guardado hoy" para la bóveda | L6 |
| D-15 | Si el fondo de apertura difiere de lo que quedó, ¿qué hacer? | **✅ Decidido 2026-11-24: preguntar el origen** (bóveda / aporte / corrección), sin bloquear | L6 |
| ARQ-03 | ¿Habrá **dos cajas cobrando al mismo tiempo**? | Si no: dejar un solo turno. Si sí: turno por caja (cambio grande) | — |
| D-06 | ¿Qué puede hacer la cajera? | Vende, anula y devuelve con autor y motivo; retiro personal, capital, gastos desde bóveda y arqueo solo la dueña | L7 |
| D-05 | ¿Se compra fiado a distribuidores? | Si sí: lista de deudas con "pagar/abonar" | L8 |

**Pueden esperar al primer mes de uso:** D-07 resumen diario, D-08 nota obligatoria en
descuadre, D-09 vencimientos, D-10 stock bajo, D-11 conteo físico, D-12 recargas, D-13 fiado,
D-14 margen mínimo, D-16 desactivar usuarios (recomendado: sí), VIVO-09 conteo "a ciegas" al
cerrar (hoy se muestra el esperado antes de contar).

**Infraestructura (dueño del proyecto):** proveedor del API (GCP u otro) y plan de Supabase
con backups — desbloquea L3b.

---

## 2. Lotes de trabajo

Cada lote es un encargo para un subagente, con archivos propios para poder correr en paralelo.
Máximo 2 a la vez.

### 🔴 Nivel 1 — Antes de la primera venta real (sin decisiones pendientes)

**L1a · POS: números y mensajes correctos** (frontend: `app/dashboard/pos`, `components/pos`,
`src/store/*`, `lib/api.ts`, `lib/format.ts`)
- Stock concatenado como texto ("023", "048.5") — COD-01, VIVO-02.
- Stock no se refresca tras vender (caché de 3 min) — COD-05, UX-05, VIVO-05.
- En celular no hay confirmación ni cambio tras cobrar — UX-03.
- Mensajes de error técnicos ("producto ID 2", "unidades base", inglés, "Failed to fetch") — COD-20, UX-25, VIVO-04.
- Un fallo de red se muestra como "no hay caja abierta"; cierre OK + reapertura fallida deja la pantalla obsoleta — COD-17, ARQ-15.
- Enviar `Idempotency-Key` en `POST /ventas` (contrato con L2) — COD-06, ARQ-04.

**L1b · Inventario, Movimientos y Estadísticas: números correctos** (frontend:
`app/dashboard/{inventario,movimientos,stats}`, `components/{inventario,movimientos}`)
- Editar un precio falla siempre (400) — COD-02 (**reproducido**).
- Valores corregidos en silencio: precio vacío → $0, factor 0.5 → 1 — UX-15.
- "023 uds" en Movimientos e Inventario — COD-01.
- P&L visible no suma (falta la línea de devoluciones; faltan sobrantes y retiros); productos top no netea devoluciones; "Ingresos" de Movimientos no descuenta devoluciones — COD-14, VIVO-06.
- Turno `CERRADA_FORZADA` se ve "en curso" — COD-15.
- Desglose de venta sin nombre de producto — VIVO.

**L2 · Backend: integridad de dinero y stock** (backend: `src/ventas`, `src/ajustes_inventario`,
`src/movimientos_financieros`, `src/common/filters`, DTOs)
- Devolución con la misma línea repetida supera lo vendido — COD-07.
- Movimiento de caja no revalida turno ABIERTO bajo lock — COD-08.
- Ajuste de inventario sin `FOR UPDATE` (stock negativo) — COD-09, ARQ-14.
- Redondeo: redondear cada línea a 2 decimales antes de sumar; prorrateo de devoluciones — COD-11, NEG-10.
- Timeout de transacciones (5 s por defecto) y errores Prisma sin mapear → "Internal server error" — COD-03, ARQ-05.
- Límites en DTOs (overflow → 500), validación de campos leídos fuera del DTO, `codigo_barras` vacío — COD-12, COD-22, COD-23.
- Idempotencia de `POST /ventas` con `Idempotency-Key` opcional — COD-06, ARQ-04 (cambio de schema vía `db push`).

**L3a · Despliegue seguro (independiente del proveedor)** (`Dockerfile`s, `prisma/seed.ts`, `main.ts`, docs de operación)
- Dockerfiles de producción (sin `db push --accept-data-loss` ni `next dev`) — ARQ-01.
- `trust proxy` para el rate-limit detrás de un proxy; defaults abiertos en producción — COD-04, ARQ-18.
- `seed.ts` con contraseña fija (contradice ADR 0003) — VIVO.
- Pool de conexiones y manejo de errores del pool; cold starts documentados — ARQ-06.

**L3b · Backup automatizado + ensayo de restauración** — subido a 🔴 (ARQ, "sobre lo ya conocido"). Depende de la decisión de infraestructura.

**L4 · Paginación** (backend `findAll` + pantallas que listan) — ARQ-02, COD-21, ARQ-13.
Movimientos dejaría de cargar en pocos meses. Va **después de L1b** (comparte Movimientos).

### 🔴/🟡 Dependen de decisiones (§1)

- **L5 · Mostrador flexible** — cantidad decimal y "por monto", factor decimal (NEG-01, COD-13, UX-04, VIVO-01); vender sin stock (D-01); alta rápida por la cajera (NEG-18, D-02); stock en la unidad de la presentación (NEG-32, VIVO-03), incluido el mensaje de stock insuficiente: hoy dice "quedan 7.333" six-packs; debe decir paquetes enteros y unidades sueltas.
- **L6 · Política de fondos y apertura** — una sola regla de fondos (NEG-11, NEG-12, COD-10); origen de la diferencia de apertura y "Traer de la bóveda" (NEG-02, COD-16, D-15, VIVO-08); categoría de gasto "Otros" por defecto (NEG-13).
- **L7 · Permisos y trazabilidad** — matriz de permisos (D-06, ARQ-11, NEG-25/26); autor de anulación y de cierre, autor en compras (NEG-04, ARQ-10); desactivar usuarios en vez de borrar, revocar token (NEG-03, ARQ-09, COD-18); quitar el rol fantasma `VENDEDOR` (NEG-08).
- **L8 · Compras a crédito y deudas** — pagar/abonar cuentas por pagar, quitar la regla `CAPITAL_DUEÑOS` y el default engañoso (NEG-15, NEG-21, COD-19, ARQ-07, UX-18/19).

### 🟡 Nivel 2 — Primer mes de uso

- **L9 · Fricción del mostrador:** escáner con feedback y Enter (UX-06), billetes rápidos y "falta" (UX-07), modo apagón persistente (UX-08), botón "Caja abierta" que en realidad cierra (UX-09), cierre con descuadre en vivo y "(opcional)" engañoso (UX-10, VIVO-10), "Sacar dinero" (UX-11, VIVO-13), "Anular" del ticket vs "Anular venta" (VIVO-11).
- **L10 · La dueña entiende sus números:** "Este mes ganaste $X" en lenguaje de tienda (UX-22), un solo nombre para gaveta y bóveda (UX-23, VIVO-07), arqueo e inyección visibles (UX-24), Movimientos muestra salidas de dinero (UX-12), buscar una venta (UX-14).
- **L11 · Inventario cómodo:** buscador y cambio rápido de precio (UX-16), alta de producto atómica (UX-17, ARQ-16, COD-25), mermas por la cajera y ajuste positivo sin lote (NEG-16, UX-20), aviso al cambiar el factor con ventas (NEG-17).
- **L12 · Corregir errores sin ensuciar el P&L** (reversos de compras, gastos y ajustes) — ARQ-08.
- **L13 · Tests faltantes** (roles, compras, movimientos, reconciliación de efectivo) — ARQ-19; y una sola función para el efectivo de gaveta — ARQ-12.
- **L14 · Accesibilidad y celular:** labels, íconos sin nombre, teclado, objetivos táctiles, contraste, cerrar sesión en celular — UX-26, UX-27, UX-28, VIVO-12; confirmaciones destructivas y un solo patrón de feedback — UX-29.
- Login por HTTP con cookie `secure` (pruebas desde el celular en la red local) — UX-01.

### ⚪ Nivel 3 — Pulido e higiene

Código muerto y archivos sueltos (COD-24, ARQ-20, `getResumen` cuenta anuladas — NEG-09);
modelo de datos al adoptar migraciones (ARQ-17, backlog técnico 1–2); imagen de producción del backend pesa 521 MB (prisma, typescript y effect entran como dependencias de producción); activos fijos sin
pantalla (NEG-05); hidratación de `ThemeToggle`; período "Semana" de 8 días; textos de marca
del login (UX-02); pulido general (UX-30); el ticket cuenta "10.286 artículos" al sumar cantidades fraccionadas.

**Documentación (Fase 5):** `domain/caja-y-ventas.md` y `architecture/data-model.md`
desactualizados (NEG-06, NEG-07); comentario D7 de `navigation.ts`.

---

## 3. Orden de ejecución propuesto

| Ola | Lotes (en paralelo) | Condición |
|---|---|---|
| 1 | **L1a** + **L2** | Ninguna (contrato `Idempotency-Key` definido en ambos briefs) |
| 2 | **L1b** + **L3a** | Ola 1 en `master` |
| 3 | **L4** paginación + **L5a** mostrador (backend): deuda de stock, alta rápida, venta por monto | D-01/02/03 ✅ |
| 4 | **L5b** mostrador (frontend: ticket decimal y por monto, alta rápida, avisos de stock) + **L6** fondos y apertura | D-04/15 ✅ |
| 5 | L7 + L8 | Decisiones D-06 y D-05 |
| — | L3b backup | Decisión de infraestructura |
| después | Nivel 2 y 3, Fase 5 (docs) | Primera semana de uso real |

## 4. Estado

| Lote | Estado | Rama |
|---|---|---|
| L1a | ✅ 2026-11-24 — verificado en navegador (escritorio y celular) | `feature/l1a-pos-numeros-mensajes` |
| L1b | ✅ 2026-11-24 — verificado en navegador (precio editable, Estadísticas cuadra, Movimientos) | `feature/l1b-inventario-estadisticas` |
| L2 | ✅ 2026-11-24 — 62 e2e en verde. **Cambio de schema:** `ventas.clave_idempotencia` (aplicar con `db push` en Supabase) | `feature/l2-integridad-dinero-stock` |
| L3a | ✅ 2026-11-24 — imagen de producción verificada (build + arranque + config inválida rechazada) | `feature/l3a-despliegue-seguro` |
| L3b | ⏸ decisión de infraestructura | — |
| L4 | ✅ 2026-11-24 — verificado en navegador (paginación y búsqueda por número); incluye fix del buscador que rompía Movimientos (venía de L1b) | `feature/l4-paginacion` |
| L5a | ✅ 2026-11-24 — 104 e2e; probado de punta a punta contra la API (alta rápida → venta por monto sin stock → compra salda la deuda y corrige el costo /usr/bin/bash). **Cambios de schema:** `pendientes_stock`, `productos.por_revisar` | `feature/l5a-mostrador-flexible` |
| L5b | ✅ 2026-11-24 — verificado en navegador (alta rápida, cantidad decimal, venta por monto, avisos de stock al cobrar, "7 Six-pack + 2") | `feature/l5b-mostrador-pantalla` |
| L6 | ✅ 2026-11-24 — 125 e2e; verificado en navegador (pregunta de diferencia de apertura → INGRESO_CAPITAL; gasto mayor al esperado pasa con aviso y cae en "Otros"; asistente de bóveda) | `feature/l6-fondos-apertura` |
| L7, L8 | ⏸ decisiones D-06, D-05 y ARQ-03 | — |
