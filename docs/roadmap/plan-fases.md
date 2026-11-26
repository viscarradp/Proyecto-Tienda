# Estado del proyecto y qué sigue

> Documento vivo: dónde está el proyecto, qué falta antes de usarlo con dinero real y qué viene después. Se actualiza
> en el mismo cambio que avanza el trabajo. El detalle de cada lote está en el
> [backlog del ciclo](backlog-ciclo-2026-11.md); el porqué de cada decisión técnica, en los [ADRs](../decisions/).
>
> **Última actualización:** 2026-11-26.

## Dónde estamos

- **Desplegado** desde el 2026-11-26: backend en Render (`https://proyecto-tienda-nbi6.onrender.com`), frontend en
  Vercel (`https://proyecto-tienda-sand.vercel.app`) y base de datos en Supabase. Los dos se despliegan solos con cada
  push a `master`. Detalle: [`../operations/deployment.md`](../operations/deployment.md).
- **Desarrollo en pausa a propósito** para que la tienda use el sistema de verdad. Lo que reporte la tienda pesa más que
  las auditorías para decidir qué sigue.
- **Hecho:** el ciclo 2026-11 completo (lotes L1–L14 del backlog), las seis olas de la auditoría de UX/UI, el bot de
  Telegram para registrar compras y la guía e instalador de la laptop del punto de venta.
- **Falta antes de la primera venta real:** los pasos ⏳ de la lista de abajo.

Desde la ola 6, la dueña entra a "Mi negocio" y su menú dice Mi negocio · Vender · Inventario · Gastos y deudas ·
Ventas y turnos · Usuarios; la cajera entra a Vender.

## Antes de la primera venta real

1. ✅ **Esquema actual en Supabase** (2026-11-26, con el MCP de Supabase y permiso del usuario). Las tablas de marzo,
   con sus datos, se movieron al esquema `respaldo_2026_11_26` (no se borró nada); se creó el esquema completo con
   `prisma migrate diff --from-empty`, se copió el catálogo real (31 productos, 40 presentaciones con código de barras,
   9 categorías) y se activó RLS sin políticas en todas las tablas (la API de datos de Supabase no las expone; el
   backend entra como dueño). Ensayado antes en una base local. Pendiente: que la dueña valide los precios del
   catálogo; borrar `respaldo_2026_11_26` cuando el sistema ya esté en uso.
2. ✅ **Despliegue** en Render + Vercel (2026-11-26). `GET /salud` → 200 y CORS acepta el frontend. Render (plan
   gratis) se duerme sin tráfico; la laptop del punto de venta lo mantiene despierto en horario de tienda.
3. ⏳ **Activar el respaldo nocturno:** cargar en GitHub los secretos `BACKUP_DATABASE_URL` (conexión directa) y
   `BACKUP_PASSPHRASE` (guardada también fuera de GitHub), lanzar *Respaldo nocturno* a mano y confirmar que queda
   verde y **sin** el aviso "no configurado". Guía: [`../operations/respaldos.md`](../operations/respaldos.md).
4. ⏳ **Ensayar una restauración:** restaurar ese primer respaldo en una base local vacía y comparar los conteos de
   `ventas`, `productos` y `usuarios`. Un respaldo que nunca se restauró no es un respaldo.
5. ⏳ **Laptop del punto de venta:** instalar con `scripts/pos/instalar.sh` y recorrer la lista de verificación de
   [`../operations/laptop-pos.md`](../operations/laptop-pos.md) (se escribió sin una laptop Linux para probarlo).
6. ⏳ **Primer ingreso:** entrar como `admin`, cambiar la contraseña inicial, quitar `INITIAL_ADMIN_PASSWORD` de
   Render y crear el usuario de la cajera (rol `CAJERO`).
7. ⏳ **Carga inicial:** el inventario inicial como una compra pagada con capital de la dueña (origen
   `CAPITAL_DUEÑOS`); en "Mi negocio",
   declarar el efectivo guardado en la bóveda (y hacer un arqueo si hay que ordenarla); abrir el primer turno (el
   primer fondo se registra como aporte de la dueña).
8. ⏳ **Bot de Telegram (opcional):** crear el bot con @BotFather y la clave de OpenRouter; en Render,
   `TELEGRAM_MODO=webhook`. Ver [`../domain/bot.md`](../domain/bot.md).

## Cambios de esquema pendientes en Supabase

No hay migraciones ([ADR 0002](../decisions/0002-sin-migraciones-hasta-produccion.md)). Cada tabla o columna nueva se
anota aquí en el mismo cambio que la agrega; se ensaya en una base local desechable, se compara con
`prisma migrate diff` y se aplica en Supabase con el MCP, con permiso del usuario para cada paso.

| Cambio | Lote | Estado |
|---|---|---|
| — | — | Supabase tiene el esquema completo al 2026-11-26 (incluye el bot y sus compras por caja). Nada pendiente. |

## Qué sigue después de la prueba

1. **Lo que reporte la tienda:** bugs y fricción real. Durante la prueba conviene anotar dónde la cajera se traba o
   deja de registrar algo, qué avisos salen seguido y si se entienden, qué descuadres aparecen al cerrar y qué le
   falta a la dueña para entender sus números.
2. **Decisiones del primer mes**, ya con datos de uso: D-07…D-14, el conteo "a ciegas" al cerrar (VIVO-09) y las
   mejoras de la dueña que esperan al uso real. Lista en el §1 del [backlog](backlog-ciclo-2026-11.md#1-pendiente).
3. **Higiene que la tienda no ve:** código muerto y archivos sueltos, imagen de Docker del backend de 521 MB.
4. **Al pasar a migraciones** (decisión abierta 1): migración base, constraints, `REVOKE` sobre las tablas de libro y
   enums en el esquema; cookie `httpOnly` y Redis para el rate-limit si hay más de una instancia. Detalle en
   [`hardening-backlog.md`](hardening-backlog.md).

## Decisiones abiertas

| # | Decisión | Contexto |
|---|---|---|
| 1 | ¿Cuándo adoptar migraciones de Prisma? | Hoy: `db push` en local + ensayo + MCP en Supabase. Adoptarlas reactiva las constraints y el `REVOKE` diferidos ([`hardening-backlog.md`](hardening-backlog.md)). |
| 2 | Decisiones del primer mes (D-07…D-14) | Se toman con la dueña y con datos de uso ([backlog §1](backlog-ciclo-2026-11.md#1-pendiente)). |

## Reglas del proyecto (fijadas por el usuario)

1. **Apoyar, no imponer:** ante la duda, registrar y avisar en vez de bloquear ([ADR 0011](../decisions/0011-registrar-y-avisar.md)).
2. **No sobreingeniería:** la usuaria es la dueña de una tienda de colonia que quiere llevar su negocio más fácil y
   saber si es rentable. Las soluciones se miden contra ese contexto, no contra uno empresarial.
3. **Soluciones que escalen** antes que parches momentáneos, sin construir lo que todavía no se usa.
4. **Todo se documenta en `docs/`**, en el mismo cambio, para que cualquiera pueda darle mantenimiento.
5. **Nada atado a un proveedor:** la configuración va por variables de entorno
   ([`../operations/configuration.md`](../operations/configuration.md)).

La forma de trabajo (líder que planea y revisa, subagentes en ramas `feature/*`, aprobación ola por ola) está en el
[`CLAUDE.md`](../../CLAUDE.md) de la raíz.

## Historia resumida

| Etapa | Fecha | Qué dejó | Detalle |
|---|---|---|---|
| Fase 0 · Concurrencia y seguridad | 2026-07-02 | Bloqueo pesimista (`FOR UPDATE`, advisory locks) sin sobreventa ni sobregiro; admin inicial por variable de entorno; rate-limit, Helmet, CORS por lista y Swagger opcional | ADRs [0001](../decisions/0001-concurrencia-for-update.md), [0003](../decisions/0003-admin-seed-por-env.md), [0004](../decisions/0004-hardening-http.md) |
| Fase 1 · Base de datos | 2026-07-03 | 16 índices; errores de Prisma traducidos a 409/400/404 | ADRs [0005](../decisions/0005-indices-bd.md), [0006](../decisions/0006-filtro-excepciones-prisma.md) |
| Fase 2 · Frontend | 2026-07-03 | `proxy.ts` que protege el panel, cookie `Secure` + `SameSite=Lax`, avisos en vez de `alert()`, páginas de error | ADRs [0007](../decisions/0007-proxy-verificacion-liviana.md), [0008](../decisions/0008-cookie-flags.md) |
| Fase 3 · Tests, Docker y CI | 2026-07-04 | e2e contra Postgres real, Postgres en Docker, CI en cada push; solo efectivo como decisión de producto | ADR [0009](../decisions/0009-testing-docker-ci.md) |
| Modelo contable (Bloques 1–3) | 2026-07 | Movimientos origen→destino, autor en cada operación, arqueo, devoluciones, historial de precios, modo contingencia | [`../historial/modelo-contable/`](../historial/modelo-contable/README.md) |
| Rediseño UX/UI | 2026-07 | Tokens de diseño, tema claro/oscuro, menú inferior en el celular | [`../historial/rediseno/`](../historial/rediseno/README.md) |
| Ciclo 2026-11 | 2026-11-24 | Bugs mayores (anular con devoluciones, reportes en UTC), cuatro auditorías, lotes L1–L14 | [backlog §2–3](backlog-ciclo-2026-11.md) |
| Auditoría UX/UI y seis olas | 2026-11-25/26 | Cobro seguro, mostrador en el celular, números confiables, sistema visual, accesibilidad, "Mi negocio" | [backlog §4](backlog-ciclo-2026-11.md#4-auditoría-integral-de-uxui-2026-11-25) |
| Bot de Telegram | 2026-11-26 | Compras por mensaje o foto de la factura, con confirmación de la dueña | [`../domain/bot.md`](../domain/bot.md) |
| Despliegue | 2026-11-26 | Supabase con el esquema actual, Render + Vercel, laptop del punto de venta en modo kiosco | [`../operations/deployment.md`](../operations/deployment.md), [`../operations/laptop-pos.md`](../operations/laptop-pos.md) |

El relato detallado de cada fase (commits, verificaciones, hallazgos colaterales) quedó en el historial de git.
