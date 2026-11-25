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
| ARQ-03 | ¿Habrá **dos cajas cobrando al mismo tiempo**? | **✅ Decidido 2026-11-24: no, una sola gaveta** — se mantiene un turno abierto a la vez | — |
| D-06 | ¿Qué puede hacer la cajera? | **✅ Decidido 2026-11-24: la cajera opera, la dueña controla** — cajera vende, anula, devuelve y paga gastos chicos de la gaveta (con autor y motivo); solo la dueña: retiro personal, aporte de capital, gastos y traslados desde bóveda, arqueo, compras y precios | L7 |
| D-05 | ¿Se compra fiado a distribuidores? | **✅ Decidido 2026-11-24: sí, a veces** — lista de deudas por proveedor con "pagar/abonar" | L8 |

**Pueden esperar al primer mes de uso:** D-07 resumen diario, D-08 nota obligatoria en
descuadre, D-09 vencimientos, D-10 stock bajo, D-11 conteo físico, D-12 recargas, D-13 fiado,
D-14 margen mínimo, VIVO-09 conteo "a ciegas" al cerrar (hoy se muestra el esperado antes de
contar). D-16 (desactivar usuarios en vez de borrarlos) ya quedó hecho en L7.

**✅ Backup decidido 2026-11-24:** Supabase plan gratuito + respaldo nocturno propio (`pg_dump` cifrado a la nube con un job programado) y ensayo de restauración — L3b.

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
- ✅ Login por HTTP con cookie `secure` (pruebas desde el celular en la red local) — UX-01, hecho el 2026-11-25.

### ⚪ Nivel 3 — Pulido e higiene

**Lo que la tienda ve — ✅ hecho antes de entregar (2026-11-25):** textos del login y `/` directo a la app con sesión
(UX-02); esqueleto en vez de pantalla en blanco, Estadísticas atenuada mientras recarga (sin que una respuesta vieja pise
a la nueva) y avisos abajo sin tapar la barra del cobro en el celular (UX-30); ids que funcionan por HTTP (Inventario se
caía desde el celular por la IP). La hidratación de `ThemeToggle` ya estaba resuelta en L14. Del UX-30 original, el doble
envío, el voseo, el mensaje técnico del POS y `h-dvh` se habían resuelto en L2, L9 y L14.

**Lo que la tienda no ve — puede esperar:** código muerto y archivos sueltos (COD-24, ARQ-20); modelo de datos al
adoptar migraciones (ARQ-17, backlog técnico 1–2); imagen de Docker del backend de 521 MB (solo importa si Render la usa).

**Función nueva, decidir con el uso:** activos fijos sin pantalla (NEG-05), solo si la tienda lleva control de su equipo.

**Números corregidos (2026-11-24):** `getResumen` del turno contaba las ventas anuladas y no restaba devoluciones
(NEG-09) — ✅ ahora cuenta solo completadas y trae `total_devoluciones`, `ventas_netas` y `count_ventas_anuladas`. El
período "Semana" de 8 días ya se había corregido en **L1b** ("7 días" = 7 días) y el ticket que sumaba cantidades
fraccionadas ("10.286 artículos") en **L9** (cuenta productos, no unidades).

**Documentación (Fase 5):** ✅ 2026-11-24 — `domain/` reorganizado por tema (NEG-06) y
`architecture/data-model.md` al día (NEG-07); proyectos cerrados movidos a `historial/`. Queda
solo el comentario D7 de `navigation.ts`, que ya no existe en el código actual.

---

## 3. Orden de ejecución propuesto

| Ola | Lotes (en paralelo) | Condición |
|---|---|---|
| 1 | **L1a** + **L2** | Ninguna (contrato `Idempotency-Key` definido en ambos briefs) |
| 2 | **L1b** + **L3a** | Ola 1 en `master` |
| 3 | **L4** paginación + **L5a** mostrador (backend): deuda de stock, alta rápida, venta por monto | D-01/02/03 ✅ |
| 4 | **L5b** mostrador (frontend: ticket decimal y por monto, alta rápida, avisos de stock) + **L6** fondos y apertura | D-04/15 ✅ |
| 5 | **L7** permisos y trazabilidad + **L8** compras a crédito y deudas + **L3b** respaldo nocturno (aislado: solo scripts, CI y docs) | D-05, D-06, ARQ-03 y backup ✅ |
| 6–9 | **L9** + Fase 5 · **L10** + **L11** · **L12** + **L13** · **L14** (Nivel 2) | ✅ hechas |
| ⏸ pausa | Prueba con la tienda real ([plan-fases](plan-fases.md#pausa-para-la-prueba-real)) | Pasos manuales de Supabase, respaldo y despliegue |
| después | Lo que reporte la prueba; decisiones D-07…D-14; Nivel 3 | Fin de la prueba real |

## 4. Estado

| Lote | Estado | Rama |
|---|---|---|
| L1a | ✅ 2026-11-24 — verificado en navegador (escritorio y celular) | `feature/l1a-pos-numeros-mensajes` |
| L1b | ✅ 2026-11-24 — verificado en navegador (precio editable, Estadísticas cuadra, Movimientos) | `feature/l1b-inventario-estadisticas` |
| L2 | ✅ 2026-11-24 — 62 e2e en verde. **Cambio de schema:** `ventas.clave_idempotencia` (aplicar con `db push` en Supabase) | `feature/l2-integridad-dinero-stock` |
| L3a | ✅ 2026-11-24 — imagen de producción verificada (build + arranque + config inválida rechazada) | `feature/l3a-despliegue-seguro` |
| L3b | ✅ 2026-11-24 — scripts + job nocturno + guía; ensayo de restauración local con conteos iguales. **Falta activarlo:** cargar secretos `BACKUP_DATABASE_URL` y `BACKUP_PASSPHRASE` en GitHub (ver `operations/respaldos.md`) | `feature/l3b-respaldo-nocturno` |
| L4 | ✅ 2026-11-24 — verificado en navegador (paginación y búsqueda por número); incluye fix del buscador que rompía Movimientos (venía de L1b) | `feature/l4-paginacion` |
| L5a | ✅ 2026-11-24 — 104 e2e; probado de punta a punta contra la API (alta rápida → venta por monto sin stock → compra salda la deuda y corrige el costo de $0). **Cambios de schema:** `pendientes_stock`, `productos.por_revisar` | `feature/l5a-mostrador-flexible` |
| L5b | ✅ 2026-11-24 — verificado en navegador (alta rápida, cantidad decimal, venta por monto, avisos de stock al cobrar, "7 Six-pack + 2") | `feature/l5b-mostrador-pantalla` |
| L6 | ✅ 2026-11-24 — 125 e2e; verificado en navegador (pregunta de diferencia de apertura → INGRESO_CAPITAL; gasto mayor al esperado pasa con aviso y cae en "Otros"; asistente de bóveda) | `feature/l6-fondos-apertura` |
| L7 | ✅ 2026-11-24 — verificado en navegador como dueña y como cajera (pantalla Usuarios, opciones de Sacar dinero, 403 con mensaje). **Cambios de schema:** `usuarios.activo`, `ventas.anulada_por_id`, `cajas_turnos.cerrado_por_id` | `feature/l7-permisos-trazabilidad` |
| L8 | ✅ 2026-11-24 — 156 e2e; verificado en navegador (abono parcial desde la gaveta con autor y aviso). **Cambios de schema:** `compras_inventario.usuario_id`, tabla `abonos_cuentas_por_pagar` | `feature/l8-deudas-proveedores` |
| L9 | ✅ 2026-11-24 — verificado en navegador (búsqueda sin acentos + Enter, billetes rápidos y «Falta», descuadre en vivo al cerrar, «Vaciar» con confirmación, contador de productos) | `feature/l9-friccion-mostrador` |
| L10 | ✅ 2026-11-24 — verificado en navegador (cabecera "Este mes ganaste/perdiste…", sección Bóveda, glosario Gaveta/Bóveda, salidas de dinero por turno). En la revisión se corrigió la etiqueta del margen bruto para no confundirlo con la ganancia neta | `feature/l10-numeros-duena` |
| L11 | ✅ 2026-11-24 — 170 e2e; verificado en navegador (buscador y precio en un toque, merma de la cajera con motivo). **Cambio de schema:** `productos.activo` | `feature/l11-inventario-comodo` |
| L12 | ✅ 2026-11-24 — anular gastos, compras y mermas sin borrar (ADR 0012); verificado en navegador (gasto de $60 anulado: gaveta y estado de resultados vuelven). Ajuste en revisión: asientos de apertura marcados con `es_apertura` en vez de por texto. **Cambios de schema** en la lista de plan-fases | `feature/l12-anular-sin-borrar` |
| L13 | ✅ 2026-11-24 — gaveta en una sola función; e2e de cuadre de un día, matriz de roles D-06 y compras. En revisión se detectó y corrigió un test dependiente del orden. Total: 284 e2e y 41 unitarios | `feature/l13-tests-gaveta-unica` |
| L14 | ✅ 2026-11-24 — verificado en navegador: menú de usuario con «Cerrar sesión» en celular; 0 controles < 44 px a 375 px; escritorio sin cambios visuales; consola sin errores de hidratación. Etiquetas sin asociar 56 → 0 y botones de ícono sin nombre 7 → 0 | `feature/l14-accesibilidad-celular` |
| NEG-09 · Resumen del turno | ✅ 2026-11-24 — solo ventas completadas, devoluciones del turno y ventas netas; e2e nuevo (falla sin el fix). Total: 285 e2e | `feature/neg09-resumen-turno` |
| UX-01 · Celular en la red local | ✅ 2026-11-25 — cookie `Secure` solo con HTTPS (y aviso si el navegador no guarda la sesión); la API toma la dirección de la página cuando está configurada en localhost; `allowedDevOrigins` con las IP de la laptop. Verificado en navegador: por IP la página carga sin bloqueo de Next y el login en localhost sigue igual. Falta la prueba con un celular real (el navegador integrado bloquea las llamadas cruzadas desde la IP) | `feature/ux01-celular-red-local` |
| Pulido de entrega (UX-02, UX-30) | ✅ 2026-11-25 — dos subagentes en paralelo (entrada y avisos; pantallas). Verificado en navegador: `/` con sesión va al POS, esqueleto en el HTML del servidor, Estadísticas atenuada solo mientras carga, aviso "Venta registrada" a ~126 px del borde inferior en 375 px (no tapa la barra del cobro), Inventario sin errores; `generarId` probado sin `randomUUID` | `feature/pulido-entrega` |
| Fase 5 · Documentación | ✅ 2026-11-24 — reglas vigentes por tema en `domain/`, `historial/`, arquitectura, SRS v3.1 y README al día. Los pasos manuales que quedan (db push, respaldo, ensayo de restauración) están en [`plan-fases.md`](plan-fases.md#antes-de-la-primera-venta-real) | `feature/fase5-documentacion` |

## 5. Auditoría integral de UX/UI (2026-11-25)

Informe consolidado: [`../auditorias/2026-11-25-auditoria-ux-ui.md`](../auditorias/2026-11-25-auditoria-ux-ui.md)
(143 hallazgos de cuatro miradas: cajera, dueña, diseño visual y recorrido en vivo; 6 🔴 verificados). Detalle por rol
en [`../auditorias/2026-11-25-ux-ui/`](../auditorias/2026-11-25-ux-ui/).

| Ola | Contenido | Estado |
|---|---|---|
| 1 · Cobro y diálogos seguros | CAJ-20, CAJ-07, CAJ-19, CAJ-16, CAJ-23, CAJ-33, VIS-28, VIS-01, DUE-02, DUE-03 | ✅ 2026-11-25 — tres subagentes (cobro; diálogos y compra; pies de diálogo). Verificado en navegador: cobro con respuesta perdida + recarga → **una sola venta** (misma clave); escaneo con el foco en Cantidad agrega el producto sin tocar el campo; "Paga con" se limpia al vaciar; modo apagón sobrevive a recargar; salir con ticket pregunta; precio cambiado se corrige con aviso; a 375×500 "Confirmar cierre" y "Registrar compra" quedan visibles (pie fijo en todos los diálogos); compra con datos no se cierra con clic afuera y Esc pide confirmar. `feature/ola1-cobro-dialogos` |
| 2 · Mostrador en el celular | CAJ-18/VIS-18, CAJ-21, CAJ-13/VIS-17, CAJ-14, CAJ-15, VIV-19, CAJ-04, VIV-02, CAJ-27, CAJ-28, CAJ-17, VIS-27 | ⏳ propuesta |
| 3 · Números confiables | DUE-27, VIV-01, DUE-30/VIV-15, DUE-31, VIS-19, VIV-13, VIV-14/DUE-35, DUE-34/VIS-06, DUE-23/VIV-16, DUE-21, VIV-03/DUE-07 | ⏳ propuesta |
| 4 · Sistema visual y lenguaje | VIV-06/VIS-02, VIS-03–05, VIS-08–11, VIS-13, VIS-15, VIS-24, VIS-25, tema T11 | ⏳ propuesta |
| 5 · Responsive, accesibilidad e inventario cómodo | VIS-29–37, VIV-04, VIV-05, VIS-23, VIS-16, DUE-01, VIV-07–10, DUE-13/VIV-20, DUE-06/VIS-12/VIV-11, VIS-14, CAJ-32 | ⏳ propuesta |
| 6 · La casa de la dueña | DUE-36, DUE-37, DUE-32, DUE-24, DUE-17/VIS-20, VIS-33/DUE-38, DUE-29 | ⏳ requiere decisiones (§5 del informe) |
| Después del uso real | DUE-05, DUE-08, DUE-28, DUE-16, DUE-33 | ⏳ con D-07…D-14 |
