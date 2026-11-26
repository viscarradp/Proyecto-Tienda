# Backlog — Ciclo 2026-11

> Lista única de lo que **queda pendiente** y registro corto de lo que se hizo en el ciclo 2026-11. Documento vivo: se
> actualiza al cerrar cada lote. Los informes de origen quedan congelados en `../auditorias/`; el estado general del
> proyecto está en [`plan-fases.md`](plan-fases.md).
>
> **Prefijos de los IDs:**
> [ARQ](../auditorias/2026-11-24-auditoria-arquitectura.md) ·
> [COD](../auditorias/2026-11-24-auditoria-codigo.md) ·
> [NEG y D-xx](../auditorias/2026-11-24-auditoria-reglas-negocio.md) (decisiones del negocio en su §5) ·
> [UX](../auditorias/2026-11-24-auditoria-interfaz.md) ·
> VIVO = recorrido en vivo del líder (2026-11-24) ·
> [CAJ, DUE, VIS, VIV](../auditorias/2026-11-25-auditoria-ux-ui.md) = auditoría de UX/UI (cajera, dueña, diseño visual,
> recorrido en vivo).

## 1. Pendiente

### Decisiones del primer mes

Se toman con la dueña cuando haya datos de uso real. La recomendación es la de la auditoría de reglas (§5).

| # | Pregunta | Recomendación |
|---|---|---|
| D-07 | Resumen al cerrar el día: ¿qué quiere ver? (ventas, ganancia, efectivo, faltantes, avisos) | Una pantalla, no un mensaje |
| D-08 | Descuadre al cerrar: ¿seguir exigiendo nota desde la tolerancia ($1) o dejar cerrar y marcarlo "sin explicar"? | "Sin explicar" si la dueña revisa el resumen diario |
| D-09 | ¿Hay productos que vencen? | Aviso de "vence pronto"; vender primero lo que vence (FEFO) solo si hay pérdidas |
| D-10 | ¿Lista de "por reponer" con mínimo por producto? | Mínimo opcional, solo en los 20–30 productos críticos |
| D-11 | ¿Cada cuánto se cuenta el inventario? | Pantalla de conteo por producto, mensual |
| D-12 | ¿Se venden recargas o servicios? | Si sí, producto tipo servicio con comisión; si no, se descarta |
| D-13 | ¿Cuánto se vende fiado a clientes? | Fuera del sistema si es menos de ~10 % de las ventas |
| D-14 | ¿Aviso de margen mínimo y lista de precios editable? | Aviso desde 15 %; los precios nunca cambian solos |
| VIVO-09 | ¿Contar "a ciegas" al cerrar? | Hoy se muestra lo esperado antes de contar |

Mejoras de la dueña que también esperan al uso real (auditoría de UX/UI):

- **DUE-05** — contar el inventario sin calcular la diferencia a mano (va con D-11).
- **DUE-08** — responder "¿qué tengo que comprar?": agotados primero (va con D-10).
- **DUE-16** — gastos del mes por categoría.
- **DUE-28** — "perdiste" sin comparación ni contexto puede llevar a decidir mal.

### Pendientes menores conocidos

- **Compras de más de ~100 unidades base por línea:** el costo guardado puede quedar ±$0.01 de la factura (el costo
  unitario se guarda con 4 decimales). El formulario lo avisa sin bloquear. Arreglo de fondo: que el backend acepte el
  total de la línea.
- **Foco visible** del enlace "¿Venta del cuaderno?" en Vender (`components/pos/CheckoutSection.tsx`).
- **Login desde un celular real** por la red local (UX-01): se verificó en el navegador integrado, falta un teléfono.
- **Bot de Telegram:** demo con la dueña y modo `webhook` en Render (pasos en [`plan-fases.md`](plan-fases.md#antes-de-la-primera-venta-real)).
- **Textos y comentarios viejos en el código** (encontrados al revisar la documentación el 2026-11-26):
  - `erp-tienda-frontend/lib/api.ts:53`: el mensaje sin conexión dice «Venta durante un apagón»; la pantalla ya dice
    «Venta del cuaderno». Este sí lo ve la cajera.
  - `scripts/respaldo/respaldar.sh:14,25`: recomienda la conexión directa de Supabase; desde GitHub Actions hace falta el
    Session pooler ([`respaldos.md`](../operations/respaldos.md)).
  - `erp-tienda-backend/src/common/throttler-limits.ts:7`: cita `0009-testing-e2e.md`, que no existe (es
    `0009-testing-docker-ci.md`).
  - `main.ts:21` y `common/config-produccion.ts:75`: dicen Cloud Run; hoy es Render.

### Nivel 3 — lo que la tienda no ve

- Código muerto y archivos sueltos (COD-24, ARQ-20).
- Modelo de datos al adoptar migraciones (ARQ-17; ítems 1–2 de [`hardening-backlog.md`](hardening-backlog.md)).
- Imagen de Docker del backend de 521 MB.
- Activos fijos sin pantalla (NEG-05): solo si la tienda lleva control de su equipo.

## 2. Decisiones tomadas

| # | Decisión | Fecha | Regla vigente en |
|---|---|---|---|
| D-01 | Vender aunque no haya stock registrado, y avisar (deuda de stock) | 2026-11-24 | [`inventario.md`](../domain/inventario.md) |
| D-02 | Alta rápida de la cajera (nombre + precio), queda "por revisar" | 2026-11-24 | [`inventario.md`](../domain/inventario.md) |
| D-03 | Venta por peso y por monto (cantidad decimal) | 2026-11-24 | [`ventas-y-devoluciones.md`](../domain/ventas-y-devoluciones.md) |
| D-04 | Fondos: registrar y avisar en vez de bloquear; asistente de "efectivo guardado hoy" para la bóveda | 2026-11-24 | [`dinero-y-cuentas.md`](../domain/dinero-y-cuentas.md) |
| D-05 | Compras fiadas a proveedores, con abonos | 2026-11-24 | [`dinero-y-cuentas.md`](../domain/dinero-y-cuentas.md) |
| D-06 | La cajera opera, la dueña controla | 2026-11-24 | [`roles-y-permisos.md`](../domain/roles-y-permisos.md) |
| D-15 | Si el fondo de apertura difiere, preguntar el origen (bóveda, aporte, corrección) sin bloquear | 2026-11-24 | [`caja-y-turnos.md`](../domain/caja-y-turnos.md) |
| D-16 | Desactivar usuarios en vez de borrarlos | 2026-11-24 | [`roles-y-permisos.md`](../domain/roles-y-permisos.md) |
| ARQ-03 | Una sola gaveta: un turno abierto a la vez | 2026-11-24 | [`caja-y-turnos.md`](../domain/caja-y-turnos.md) |
| 1A | Una venta con devoluciones no se anula; se devuelve el resto | 2026-11-24 | [`ventas-y-devoluciones.md`](../domain/ventas-y-devoluciones.md) |
| Respaldo | Supabase plan gratis + respaldo nocturno propio cifrado + ensayo de restauración | 2026-11-24 | [`respaldos.md`](../operations/respaldos.md) |
| Infraestructura | Backend en Render, frontend en Vercel, base en Supabase | 2026-11-25 | [`deployment.md`](../operations/deployment.md) |
| Ola 6 | La dueña aterriza en "Mi negocio"; "Reabrir automáticamente" desmarcado | 2026-11-26 | [`reportes.md`](../domain/reportes.md), [`caja-y-turnos.md`](../domain/caja-y-turnos.md) |
| Bot | Compras por Telegram con OpenRouter; el producto nuevo queda solo con su unidad de venta | 2026-11-26 | [`bot.md`](../domain/bot.md) |

## 3. Lotes del ciclo

Todos ✅. Cada lote se verificó con lint, build, unitarios, e2e y, si tocaba la interfaz, en el navegador. Última corrida
completa (2026-11-26): 114 unitarios y 305 e2e en verde.

| Lote | Qué resolvió | IDs | Rama |
|---|---|---|---|
| 1A | Devolver y después anular revertía dos veces stock, efectivo y ganancia | — | `feature/1a-anulacion-con-devoluciones` |
| 1B | Los reportes cortaban el día en UTC (las ventas después de las 6 pm caían al día siguiente) | — | `feature/1b-reportes-zona-horaria` |
| L1a | Mostrador: stock pegado como texto ("023"), stock sin refrescar, confirmación en el celular, mensajes técnicos, clave de idempotencia | COD-01/05/06/17/20, UX-03/25, ARQ-04/15 | `feature/l1a-pos-numeros-mensajes` |
| L1b | Editar un precio fallaba siempre; estado de resultados que no sumaba; turno forzado visto "en curso" | COD-02/14/15, UX-15 | `feature/l1b-inventario-estadisticas` |
| L2 | Integridad de dinero y stock: devoluciones repetidas, locks faltantes, redondeo, timeouts, límites de los DTOs, idempotencia | COD-03/07/08/09/11/12/22/23, NEG-10, ARQ-05/14 | `feature/l2-integridad-dinero-stock` |
| L3a | Imágenes de producción, `trust proxy`, seed sin contraseña fija, pool de conexiones | ARQ-01/06/18, COD-04 | `feature/l3a-despliegue-seguro` |
| L3b | Respaldo nocturno cifrado y restauración (falta activarlo) | — | `feature/l3b-respaldo-nocturno` |
| L4 | Paginación en listas y pantallas | ARQ-02/13, COD-21 | `feature/l4-paginacion` |
| L5a / L5b | Mostrador flexible: cantidad decimal, venta por monto, venta sin stock, alta rápida, stock en la unidad de la presentación | NEG-01/18/32, COD-13, UX-04, D-01/02/03 | `feature/l5a-mostrador-flexible`, `feature/l5b-mostrador-pantalla` |
| L6 | Una sola regla de fondos; origen de la diferencia de apertura; gasto "Otros" por defecto | NEG-02/11/12/13, COD-10/16, D-04/15 | `feature/l6-fondos-apertura` |
| L7 | Matriz de permisos, autor de anulación, cierre y compra; usuarios desactivables; sin el rol fantasma `VENDEDOR` | D-06, NEG-03/04/08/25/26, ARQ-09/10/11, COD-18 | `feature/l7-permisos-trazabilidad` |
| L8 | Compras a crédito y abonos a proveedores | D-05, NEG-15/21, COD-19, ARQ-07, UX-18/19 | `feature/l8-deudas-proveedores` |
| L9 | Fricción del mostrador: escáner con Enter, billetes rápidos, modo apagón persistente, descuadre en vivo al cerrar | UX-06…11, VIVO-10/11/13 | `feature/l9-friccion-mostrador` |
| L10 | Números de la dueña: "Este mes ganaste", gaveta y bóveda, salidas de dinero, buscar una venta | UX-12/14/22/23/24, VIVO-07 | `feature/l10-numeros-duena` |
| L11 | Inventario cómodo: buscador, precio en un toque, alta atómica, mermas de la cajera | UX-16/17/20, NEG-16/17, ARQ-16, COD-25 | `feature/l11-inventario-comodo` |
| L12 | Anular gastos, compras y mermas sin borrar ([ADR 0012](../decisions/0012-anular-sin-borrar.md)) | ARQ-08 | `feature/l12-anular-sin-borrar` |
| L13 | Tests de roles, compras y cuadre de un día; efectivo de la gaveta en una sola función | ARQ-12/19 | `feature/l13-tests-gaveta-unica` |
| L14 | Accesibilidad y celular: etiquetas, nombres de íconos, objetivos táctiles, cerrar sesión en el celular | UX-26…29, VIVO-12 | `feature/l14-accesibilidad-celular` |
| NEG-09 | El resumen del turno ya no cuenta ventas anuladas y resta devoluciones | NEG-09 | `feature/neg09-resumen-turno` |
| UX-01 | Login desde el celular por la red local (cookie `Secure` solo con HTTPS) — 2026-11-25 | UX-01 | `feature/ux01-celular-red-local` |
| Pulido de entrega | Textos del login, `/` directo a la app, esqueletos de carga, avisos que no tapan el cobro — 2026-11-25 | UX-02, UX-30 | `feature/pulido-entrega` |
| Fase 5 | Reglas vigentes por tema en `domain/`, proyectos cerrados a `historial/` | NEG-06/07 | `feature/fase5-documentacion` |

## 4. Auditoría integral de UX/UI (2026-11-25)

Informe: [`../auditorias/2026-11-25-auditoria-ux-ui.md`](../auditorias/2026-11-25-auditoria-ux-ui.md) (143 hallazgos de
cuatro miradas, 6 🔴 verificados); detalle por rol en [`../auditorias/2026-11-25-ux-ui/`](../auditorias/2026-11-25-ux-ui/).
Las seis olas están ✅ y verificadas en el navegador (a 375 px, cero controles de menos de 44 px en todas las pantallas).
Lo que queda está en el §1.

| Ola | Qué dejó | Rama |
|---|---|---|
| 1 · Cobro y diálogos seguros | Una sola venta aunque se pierda la respuesta y se recargue; escaneo con el foco en Cantidad; modo apagón que sobrevive a recargar; pie fijo en todos los diálogos | `feature/ola1-cobro-dialogos` |
| 2 · Mostrador en el celular | Cinco productos visibles a 375 px, "Cobrar $X" fijo, deshacer al quitar una línea, cambio visible hasta el siguiente producto | `feature/ola2-mostrador-celular` |
| 3 · Números confiables | Aviso de ventas sin costo (`ventas_sin_costo`), nombres claros de los movimientos, unidades legibles ("53 uds = 8 six-packs + 5 sueltas") | `feature/ola3-numeros` |
| 4 · Sistema visual y lenguaje | Contraste AA, variantes de botón, escala de alturas, errores en el campo, lenguaje unificado (glosario) | `feature/ola4-base`, `feature/ola4-pantallas` |
| 5 · Accesibilidad y compras | Compra como en la factura (presentación, cuántas, cuánto pagó), precio en el catálogo, merma de la tanda más vieja, título por sección, `prefers-reduced-motion` | `feature/ola5-accesibilidad-compras` |
| 6 · La casa de la dueña | "Mi negocio" (respuesta, qué hacer, mi dinero, productos), menú nuevo, deudas arriba en Gastos y deudas, "Reabrir automáticamente" desmarcado | `feature/ola6-casa-duena` |

## 5. Bot de Telegram para compras (2026-11-26)

La dueña registra compras escribiéndole al bot ("Compré 2 cajas de coca a 20…") o mandando la foto de la factura, y
confirma con un botón. El modelo de IA (OpenRouter, configurable con `OPENROUTER_MODEL`) solo devuelve un borrador que
el código valida; nunca escribe en la base. Reglas: [`../domain/bot.md`](../domain/bot.md).

| Pieza | Estado |
|---|---|
| Núcleo: interpretar → borrador → confirmar → `ComprasService`, memoria de equivalencias, deshacer | ✅ |
| Adaptador de Telegram: polling para la demo local, webhook para Render, solo la dueña activa | ✅ |
| Compras por caja: "2 cajas de 24" guarda 48 unidades aunque el producto solo tenga "Unidad"; el bot pregunta si falta cuántas trae | ✅ |
| Demo con la dueña | ⏳ falta crear el bot (@BotFather) y la clave de OpenRouter |
| Producción | ⏳ `TELEGRAM_MODO=webhook` en Render |
