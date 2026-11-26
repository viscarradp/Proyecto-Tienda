# 0013 — Producción en Render, Vercel y Supabase, todavía sin migraciones

**Estado:** Aceptado · **Fecha:** 2026-11-26 (despliegue) · **Complementa:** ADR [0002](0002-sin-migraciones-hasta-produccion.md),
[0007](0007-proxy-verificacion-liviana.md), [0010](0010-imagenes-produccion.md)

## Contexto

El ADR 0002 difirió las migraciones de Prisma "hasta entrar a producción", y los ADR 0007 y 0010 se escribieron pensando
en GCP/Cloud Run como destino. El 2026-11-25 el usuario decidió dónde corre cada parte y el 2026-11-26 se desplegó. La
base de Supabase tenía el esquema de marzo y un catálogo real cargado (productos, presentaciones con código de barras,
categorías), sin ventas ni movimientos.

## Decisión

1. **Dónde corre cada parte:** backend en Render (plan gratis, una sola instancia, se despliega con cada push a
   `master`), frontend en Vercel (también automático) y base de datos en Supabase. Todo se configura por variables de
   entorno; en Render, `TRUST_PROXY=1`. El plan gratis de Render se duerme sin tráfico: la laptop del punto de venta
   hace ping a `/salud` en horario de tienda para mantenerlo despierto sin gastar las horas gratis del mes.
2. **Supabase con el esquema de Prisma:** las tablas viejas pasaron, con sus datos, al esquema `respaldo_2026_11_26`;
   el esquema actual se creó completo desde Prisma (`prisma migrate diff --from-empty`) y se copió el catálogo. RLS
   activado sin políticas en todas las tablas: la API de datos de Supabase no expone nada y el backend entra como dueño
   de las tablas.
3. **Todavía sin migraciones**, aunque ya hay producción: cada cambio de esquema se anota en
   [`plan-fases.md`](../roadmap/plan-fases.md#cambios-de-esquema-pendientes-en-supabase), se ensaya en una base local
   desechable, se compara con `prisma migrate diff` y se aplica en Supabase con el MCP de Supabase, con permiso del
   usuario en cada paso. Cuándo adoptar migraciones queda como decisión abierta.

## Alternativas consideradas

- **GCP/Cloud Run para el backend** (ADR 0007 y 0010): fue el destino supuesto mientras no había decisión; la elección
  final fue del usuario.
- **Adoptar migraciones al desplegar:** se pospuso para no frenar la prueba con la tienda real. Como la base se rehízo
  desde el esquema de Prisma, crear la migración base cuando se decida es directo.

## Consecuencias

- Las invariantes de integridad siguen solo en la aplicación (ADR 0001); las constraints y el `REVOKE` de las tablas de
  libro esperan a las migraciones ([`hardening-backlog.md`](../roadmap/hardening-backlog.md)).
- Una sola instancia: el rate-limit en memoria alcanza (ADR 0004).
- Fuera del horario del ping, el primer pedido tarda cerca de un minuto mientras Render despierta.
- Cambiar la URL del backend exige redesplegar el frontend (`NEXT_PUBLIC_API_URL` se incrusta al construir).
- Los e2e y `db push --force-reset` nunca corren contra Supabase.
- Operación al día: [`../operations/deployment.md`](../operations/deployment.md).
