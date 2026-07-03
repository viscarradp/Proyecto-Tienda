# Documentación — ERP Tienda Karlita

Esta carpeta es la fuente de verdad de cómo funciona el sistema y por qué se
tomaron ciertas decisiones. Está pensada para que cualquier persona (con o sin
contexto previo del proyecto) pueda darle mantenimiento sin tener que
adivinar el porqué de las cosas.

## Cómo navegar

| Si quieres... | Ve a... |
|---|---|
| **Saber en qué fase va el proyecto y qué sigue** | [`roadmap/plan-fases.md`](roadmap/plan-fases.md) ⭐ empieza aquí para retomar trabajo |
| Entender qué hace el sistema y cómo fluye una petición | [`architecture/overview.md`](architecture/overview.md) |
| Entender las tablas de la base de datos y el motor FIFO | [`architecture/data-model.md`](architecture/data-model.md) |
| Entender las reglas de negocio de caja, ventas y mermas | [`domain/caja-y-ventas.md`](domain/caja-y-ventas.md) |
| Saber cómo funciona la autenticación/autorización | [`security.md`](security.md) |
| Configurar el proyecto (variables de entorno) | [`operations/configuration.md`](operations/configuration.md) |
| Entender **por qué** se tomó una decisión técnica | [`decisions/`](decisions/) (ADRs) |
| Ver qué se dejó pendiente a propósito | [`roadmap/hardening-backlog.md`](roadmap/hardening-backlog.md) |

## Convenciones

- Los documentos de `decisions/` son **ADRs** (Architecture Decision Records):
  un registro corto de una decisión, su contexto y sus consecuencias. No se
  editan retroactivamente — si una decisión cambia, se crea un ADR nuevo que
  referencia al anterior.
- Esta documentación es un complemento del código, no un sustituto. Si algo
  aquí contradice al código, **el código manda** — y este documento debería
  corregirse.
- Historial de auditorías técnicas: ver [`AUDITORIA-TECNICA.md`](../AUDITORIA-TECNICA.md)
  en la raíz del repo.
