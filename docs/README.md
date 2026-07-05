# Documentación — ERP Tienda Karlita

Esta carpeta es la fuente de verdad de cómo funciona el sistema y por qué se
tomaron ciertas decisiones. Está pensada para que cualquier persona (con o sin
contexto previo del proyecto) pueda darle mantenimiento sin tener que
adivinar el porqué de las cosas.

## Cómo navegar

| Si quieres... | Ve a... |
|---|---|
| **Saber en qué fase va el proyecto y qué sigue** | [`roadmap/plan-fases.md`](roadmap/plan-fases.md) ⭐ empieza aquí para retomar trabajo |
| Conocer los requerimientos del producto (SRS) | [`producto/srs.md`](producto/srs.md) |
| Leer las auditorías (técnica y de negocio/contable) | [`auditorias/`](auditorias/) |
| Entender qué hace el sistema y cómo fluye una petición | [`architecture/overview.md`](architecture/overview.md) |
| Entender las tablas de la base de datos y el motor FIFO | [`architecture/data-model.md`](architecture/data-model.md) |
| Saber cómo funciona la autenticación/autorización | [`architecture/security.md`](architecture/security.md) |
| Entender las reglas de negocio de caja, ventas y mermas | [`domain/caja-y-ventas.md`](domain/caja-y-ventas.md) |
| Seguir el rediseño UX/UI del frontend | [`rediseno/README.md`](rediseno/README.md) |
| Configurar el proyecto (variables de entorno) | [`operations/configuration.md`](operations/configuration.md) |
| Correr los tests o levantar Postgres local | [`operations/testing.md`](operations/testing.md) |
| Desarrollar con Docker | [`operations/docker-development.md`](operations/docker-development.md) |
| Entender **por qué** se tomó una decisión técnica | [`decisions/`](decisions/) (ADRs) |
| Ver qué se dejó pendiente a propósito | [`roadmap/hardening-backlog.md`](roadmap/hardening-backlog.md) |

## Estructura

```
docs/
├── producto/      Qué debe hacer el sistema (SRS, requerimientos)
├── auditorias/    Informes de auditoría (congelados, no se editan retroactivamente)
├── architecture/  Cómo está construido (overview, modelo de datos, seguridad)
├── domain/        Reglas de negocio (caja, ventas, mermas)
├── decisions/     ADRs — por qué se decidió cada cosa
├── operations/    Cómo operarlo (configuración, tests, Docker)
├── rediseno/      Rediseño UX/UI del frontend (proyecto activo)
└── roadmap/       Qué sigue y qué está pendiente a propósito
```

## Auditorías

| Fecha | Informe | Alcance |
|---|---|---|
| 2026-07-02 | [`auditorias/2026-07-02-auditoria-tecnica.md`](auditorias/2026-07-02-auditoria-tecnica.md) | Técnica: seguridad, concurrencia, calidad de código. Sus 4 fases de remediación están **cerradas** (ver [`roadmap/plan-fases.md`](roadmap/plan-fases.md)) |
| 2026-07-04 | [`auditorias/2026-07-04-auditoria-negocio-contable.md`](auditorias/2026-07-04-auditoria-negocio-contable.md) | Negocio/contable: modelo del flujo de efectivo, FIFO, casos borde de caja. Su plan priorizado está **abierto** — define qué cerrar antes de la primera venta real |

## Convenciones

- Los documentos de `decisions/` son **ADRs** (Architecture Decision Records):
  un registro corto de una decisión, su contexto y sus consecuencias. No se
  editan retroactivamente — si una decisión cambia, se crea un ADR nuevo que
  referencia al anterior.
- Los informes de `auditorias/` también quedan **congelados** como registro
  histórico; el estado vivo de su remediación se lleva en `roadmap/`.
- Esta documentación es un complemento del código, no un sustituto. Si algo
  aquí contradice al código, **el código manda** — y este documento debería
  corregirse.
