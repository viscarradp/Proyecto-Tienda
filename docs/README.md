# Documentación — ERP Tienda Karlita

Esta carpeta es la fuente de verdad de cómo funciona el sistema y por qué se
tomaron ciertas decisiones. Está pensada para que cualquier persona (con o sin
contexto previo del proyecto) pueda darle mantenimiento sin tener que
adivinar el porqué de las cosas. Si algo aquí contradice al código, **el código manda**
y el documento se corrige.

## Si quieres… ve a…

| Si quieres... | Ve a... |
|---|---|
| **Retomar el trabajo: qué se hizo, qué falta y en qué orden** | [`roadmap/plan-fases.md`](roadmap/plan-fases.md) ⭐ |
| **Saber qué hacer antes de la primera venta real** (`db push`, respaldo, ensayo de restauración) | [`roadmap/plan-fases.md#antes-de-la-primera-venta-real`](roadmap/plan-fases.md#antes-de-la-primera-venta-real) |
| Ver la lista priorizada de lo que sigue (lotes, decisiones, estado) | [`roadmap/backlog-ciclo-2026-11.md`](roadmap/backlog-ciclo-2026-11.md) |
| Ver la deuda técnica diferida a propósito | [`roadmap/hardening-backlog.md`](roadmap/hardening-backlog.md) |
| Conocer los requerimientos del producto (SRS v3.1) | [`producto/srs.md`](producto/srs.md) |
| Entender las **reglas de negocio** (por tema) | [`domain/caja-y-ventas.md`](domain/caja-y-ventas.md) (índice) |
| …cómo abre y cierra la caja (diferencia de apertura, tolerancia, cierre forzado) | [`domain/caja-y-turnos.md`](domain/caja-y-turnos.md) |
| …cómo se vende, anula y devuelve (por monto, sin stock, idempotencia, contingencia) | [`domain/ventas-y-devoluciones.md`](domain/ventas-y-devoluciones.md) |
| …el inventario (FIFO, deuda de stock, mermas, alta rápida) | [`domain/inventario.md`](domain/inventario.md) |
| …el dinero (movimientos origen→destino, bóveda, "registrar y avisar", compras, deudas) | [`domain/dinero-y-cuentas.md`](domain/dinero-y-cuentas.md) |
| …cómo se calculan los reportes (utilidad, patrimonio, flujo, zona horaria) | [`domain/reportes.md`](domain/reportes.md) |
| …quién puede hacer qué (cajera vs dueña, usuarios desactivables) | [`domain/roles-y-permisos.md`](domain/roles-y-permisos.md) |
| …qué hacer cuando se cae el internet | [`domain/modo-contingencia.md`](domain/modo-contingencia.md) |
| Entender qué hace el sistema y cómo fluye una petición | [`architecture/overview.md`](architecture/overview.md) |
| Entender las tablas de la base de datos y el motor FIFO | [`architecture/data-model.md`](architecture/data-model.md) |
| Saber cómo funciona la autenticación, la autorización y el hardening | [`architecture/security.md`](architecture/security.md) |
| Entender **por qué** se tomó una decisión técnica | [`decisions/`](decisions/) (ADRs 0001–0011) |
| Configurar el proyecto (variables de entorno) | [`operations/configuration.md`](operations/configuration.md) |
| **Desplegar** (imágenes de producción, `/salud`, `TRUST_PROXY`, esquema) | [`operations/deployment.md`](operations/deployment.md) |
| **Respaldar y restaurar** la base de datos | [`operations/respaldos.md`](operations/respaldos.md) |
| Correr los tests o levantar Postgres local | [`operations/testing.md`](operations/testing.md) |
| Desarrollar con Docker | [`operations/docker-development.md`](operations/docker-development.md) |
| Leer las auditorías | [`auditorias/`](auditorias/) (tabla abajo) |
| Ver proyectos ya terminados (modelo contable, rediseño UX/UI) | [`historial/`](historial/README.md) |

## Estructura

```
docs/
├── producto/      Qué debe hacer el sistema (SRS)
├── domain/        Reglas de negocio vigentes, una por tema (+ modo contingencia)
├── architecture/  Cómo está construido (overview, modelo de datos, seguridad)
├── decisions/     ADRs — por qué se decidió cada cosa
├── operations/    Cómo operarlo (configuración, despliegue, respaldos, tests, Docker)
├── roadmap/       Qué sigue: plan por fases, backlog del ciclo, deuda diferida a propósito
├── auditorias/    Informes de auditoría (congelados, no se editan retroactivamente)
└── historial/     Proyectos terminados (modelo contable, rediseño UX/UI)
```

> Los nombres `decisions/`, `architecture/` y `operations/` se mantienen en inglés a propósito: el código los referencia
> en muchos comentarios.

## Auditorías

| Fecha | Informe | Alcance |
|---|---|---|
| 2026-07-02 | [`auditorias/2026-07-02-auditoria-tecnica.md`](auditorias/2026-07-02-auditoria-tecnica.md) | Técnica: seguridad, concurrencia, calidad de código. Sus 4 fases de remediación están **cerradas**. |
| 2026-07-04 | [`auditorias/2026-07-04-auditoria-negocio-contable.md`](auditorias/2026-07-04-auditoria-negocio-contable.md) | Negocio/contable: flujo de efectivo, FIFO, casos borde de caja. Sus Bloques 1–3 están **cerrados** ([historial](historial/modelo-contable/README.md)). |
| 2026-11-24 | [`auditorias/2026-11-24-auditoria-arquitectura.md`](auditorias/2026-11-24-auditoria-arquitectura.md) | Arquitectura (20 hallazgos). |
| 2026-11-24 | [`auditorias/2026-11-24-auditoria-codigo.md`](auditorias/2026-11-24-auditoria-codigo.md) | Código (25 hallazgos). |
| 2026-11-24 | [`auditorias/2026-11-24-auditoria-reglas-negocio.md`](auditorias/2026-11-24-auditoria-reglas-negocio.md) | Reglas de negocio (33 hallazgos y 16 decisiones para la dueña). |
| 2026-11-24 | [`auditorias/2026-11-24-auditoria-interfaz.md`](auditorias/2026-11-24-auditoria-interfaz.md) | Interfaz (30 hallazgos). |

Las cuatro auditorías del 2026-11-24 están consolidadas y deduplicadas en el
[backlog del ciclo](roadmap/backlog-ciclo-2026-11.md), que es donde vive el estado de su remediación.

## Convenciones

- Los documentos de `decisions/` son **ADRs** (Architecture Decision Records):
  un registro corto de una decisión, su contexto y sus consecuencias. No se
  editan retroactivamente — si una decisión cambia, se crea un ADR nuevo que
  referencia al anterior (a un ADR superado solo se le agrega al inicio una línea "Complementado por…").
- Los informes de `auditorias/` también quedan **congelados** como registro
  histórico; el estado vivo de su remediación se lleva en `roadmap/`.
- Las **reglas de negocio** se documentan por tema en `domain/` y se actualizan en el mismo cambio que modifica el
  comportamiento. Principios del proyecto: **apoyar, no imponer** (registrar y avisar antes que bloquear) y **no
  sobreingeniería**.
- Esta documentación es un complemento del código, no un sustituto.
