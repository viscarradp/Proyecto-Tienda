# Documentación — ERP Tienda Karlita

Cómo funciona el sistema y por qué se tomaron ciertas decisiones, para que cualquiera pueda darle mantenimiento sin
adivinar. Si algo aquí contradice al código, **el código manda** y el documento se corrige en el mismo cambio.

## Si quieres… ve a…

| Si quieres… | Ve a… |
|---|---|
| **Retomar el trabajo: dónde estamos, qué falta y qué sigue** | [`roadmap/plan-fases.md`](roadmap/plan-fases.md) ⭐ |
| Saber qué falta antes de la primera venta real | [`roadmap/plan-fases.md#antes-de-la-primera-venta-real`](roadmap/plan-fases.md#antes-de-la-primera-venta-real) |
| Ver lo pendiente (decisiones del primer mes, pendientes menores) y lo hecho en el ciclo | [`roadmap/backlog-ciclo-2026-11.md`](roadmap/backlog-ciclo-2026-11.md) |
| Ver la deuda técnica diferida a propósito | [`roadmap/hardening-backlog.md`](roadmap/hardening-backlog.md) |
| Conocer la visión y los requerimientos del producto | [`producto/srs.md`](producto/srs.md) |
| Entender las **reglas de negocio** (índice por tema) | [`domain/caja-y-ventas.md`](domain/caja-y-ventas.md) |
| …cómo abre y cierra la caja | [`domain/caja-y-turnos.md`](domain/caja-y-turnos.md) |
| …cómo se vende, anula y devuelve | [`domain/ventas-y-devoluciones.md`](domain/ventas-y-devoluciones.md) |
| …el inventario (FIFO, deuda de stock, mermas, alta rápida) | [`domain/inventario.md`](domain/inventario.md) |
| …el dinero (gaveta, bóveda, gastos, compras y deudas, anular sin borrar) | [`domain/dinero-y-cuentas.md`](domain/dinero-y-cuentas.md) |
| …cómo se calculan los reportes y qué muestra "Mi negocio" | [`domain/reportes.md`](domain/reportes.md) |
| …quién puede hacer qué (cajera y dueña) | [`domain/roles-y-permisos.md`](domain/roles-y-permisos.md) |
| …qué hacer cuando se cae el internet | [`domain/modo-contingencia.md`](domain/modo-contingencia.md) |
| …cómo funciona el bot de Telegram para compras | [`domain/bot.md`](domain/bot.md) |
| Entender cómo está construido y cómo fluye una petición | [`architecture/overview.md`](architecture/overview.md) |
| Entender las tablas y el motor FIFO | [`architecture/data-model.md`](architecture/data-model.md) |
| Entender autenticación, permisos y endurecimiento | [`architecture/security.md`](architecture/security.md) |
| Saber **por qué** se tomó una decisión técnica | [`decisions/`](decisions/) (ADRs, tabla abajo) |
| Configurar variables de entorno | [`operations/configuration.md`](operations/configuration.md) |
| **Desplegar** o revisar producción (Render, Vercel, Supabase) | [`operations/deployment.md`](operations/deployment.md) |
| **Respaldar y restaurar** la base | [`operations/respaldos.md`](operations/respaldos.md) |
| Correr los tests sin borrar una base que importa | [`operations/testing.md`](operations/testing.md) |
| Desarrollar con Docker | [`operations/docker-development.md`](operations/docker-development.md) |
| Preparar la laptop del punto de venta (modo kiosco) | [`operations/laptop-pos.md`](operations/laptop-pos.md) |
| Leer las auditorías | [`auditorias/`](auditorias/) (tabla abajo) |
| Ver especificaciones de proyectos terminados | [`historial/`](historial/README.md) |

## Estructura

```text
docs/
├── producto/      Visión y requerimientos (SRS)
├── domain/        Reglas de negocio vigentes, una por tema
├── architecture/  Cómo está construido (visión general, modelo de datos, seguridad)
├── decisions/     ADRs: por qué se decidió cada cosa
├── operations/    Cómo operarlo (configuración, despliegue, respaldos, tests, Docker, laptop del POS)
├── roadmap/       Estado y qué sigue, backlog del ciclo, deuda técnica diferida
├── auditorias/    Informes de auditoría (congelados)
└── historial/     Especificaciones de proyectos terminados
```

Los nombres `decisions/`, `architecture/` y `operations/` se quedan en inglés a propósito: el código los cita en sus
comentarios.

## Decisiones (ADRs)

| ADR | Decisión |
|---|---|
| [0001](decisions/0001-concurrencia-for-update.md) | Concurrencia con bloqueo pesimista (`FOR UPDATE`, advisory locks) y orden global de locks |
| [0002](decisions/0002-sin-migraciones-hasta-produccion.md) | Sin migraciones de Prisma por ahora (`db push`) |
| [0003](decisions/0003-admin-seed-por-env.md) | Usuario `admin` inicial desde `INITIAL_ADMIN_PASSWORD` |
| [0004](decisions/0004-hardening-http.md) | Rate-limit, Helmet, CORS por lista, Swagger opcional |
| [0005](decisions/0005-indices-bd.md) | Índices de la base |
| [0006](decisions/0006-filtro-excepciones-prisma.md) | Errores de Prisma traducidos a respuestas HTTP claras |
| [0007](decisions/0007-proxy-verificacion-liviana.md) | `proxy.ts`: verificación liviana de la sesión |
| [0008](decisions/0008-cookie-flags.md) | Flags de la cookie del JWT |
| [0009](decisions/0009-testing-docker-ci.md) | e2e contra Postgres real, Docker y CI |
| [0010](decisions/0010-imagenes-produccion.md) | Imágenes de producción separadas y configuración segura por defecto |
| [0011](decisions/0011-registrar-y-avisar.md) | Registrar y avisar en vez de bloquear |
| [0012](decisions/0012-anular-sin-borrar.md) | Anular sin borrar |
| [0013](decisions/0013-produccion-render-vercel-supabase.md) | Producción en Render, Vercel y Supabase, todavía sin migraciones |

## Auditorías

| Fecha | Informe | Alcance y estado |
|---|---|---|
| 2026-07-02 | [Técnica](auditorias/2026-07-02-auditoria-tecnica.md) | Seguridad, concurrencia, calidad de código. Cerrada (Fases 0–3). |
| 2026-07-04 | [Negocio/contable](auditorias/2026-07-04-auditoria-negocio-contable.md) | Flujo de efectivo, FIFO, casos borde de caja. Cerrada ([historial](historial/modelo-contable/README.md)). |
| 2026-11-24 | [Arquitectura](auditorias/2026-11-24-auditoria-arquitectura.md), [código](auditorias/2026-11-24-auditoria-codigo.md), [reglas de negocio](auditorias/2026-11-24-auditoria-reglas-negocio.md), [interfaz](auditorias/2026-11-24-auditoria-interfaz.md) | Consolidadas en el [backlog del ciclo](roadmap/backlog-ciclo-2026-11.md); quedan las decisiones del primer mes. |
| 2026-11-25 | [UX/UI integral](auditorias/2026-11-25-auditoria-ux-ui.md) ([detalle por rol](auditorias/2026-11-25-ux-ui/)) | Seis olas hechas; lo que queda está en el §1 del backlog. |

## Convenciones

- **ADRs:** registro corto de una decisión, su contexto y sus consecuencias. No se reescriben: si una decisión cambia, se
  crea un ADR nuevo y al anterior solo se le agrega al inicio una línea "Complementado por…".
- **Auditorías:** quedan congeladas como registro; el estado de su remediación vive en `roadmap/`.
- **Reglas de negocio:** se documentan por tema en `domain/` y se actualizan en el mismo cambio que modifica el
  comportamiento.
- **Textos de pantalla:** en español llano de tienda, con los nombres de `erp-tienda-frontend/lib/glosario.ts`.
