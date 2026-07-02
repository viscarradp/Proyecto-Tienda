# 0002 — Sin migraciones de Prisma hasta entrar a producción

**Estado:** Aceptado · **Fecha:** 2026-07 (Fase 0 de endurecimiento)

## Contexto

`schema.prisma` fue generado por introspección (`prisma db pull`) desde una
base de datos Supabase ya existente. No hay carpeta `prisma/migrations`: el
schema documenta lo que hay en la BD, pero no hay un historial versionado de
cómo se llegó a ese estado. El proyecto todavía está en desarrollo activo —
no existe ninguna instancia de producción.

La auditoría técnica señaló esto como un riesgo (hallazgo H6) y propuso
constraints de base de datos (`CHECK cantidad_disponible >= 0`, índice único
parcial para "un solo turno ABIERTA") como red de seguridad adicional a las
correcciones de concurrencia de
[`0001-concurrencia-for-update.md`](0001-concurrencia-for-update.md).

## Decisión

**No adoptar todavía** el flujo de `prisma migrate`. Mientras el proyecto
esté en desarrollo activo sin instancias de producción:

- Los cambios de schema se siguen haciendo directamente en la base de datos
  (Supabase) y re-introspeccionando con `prisma db pull`.
- Las invariantes de integridad (stock no-negativo, un solo turno abierto,
  saldo de caja no-negativo) se garantizan **en la capa de aplicación**
  (bloqueo pesimista, ver ADR 0001) — no con `CHECK` constraints ni índices
  únicos en la base de datos.

**Cuando el proyecto entre a producción**, se debe:

1. Establecer una migración baseline (`prisma migrate diff` +
   `migrate resolve --applied`) que capture el estado actual como punto de
   partida.
2. A partir de ahí, todo cambio de schema pasa por `prisma migrate dev` /
   `migrate deploy`, versionado en el repo.
3. Aplicar como migraciones las constraints de base de datos documentadas en
   [`../roadmap/hardening-backlog.md`](../roadmap/hardening-backlog.md) como
   defensa en profundidad adicional a los locks de aplicación.

## Alternativas consideradas

- **Adoptar migraciones ahora mismo**: se descartó por indicación explícita
  del proyecto — sin instancias de producción, el costo de mantener
  migraciones versionadas desde ya no se justifica todavía, y añadiría
  fricción a la iteración rápida del schema en esta etapa.
- **Aplicar las constraints de BD ahora vía SQL manual (fuera de Prisma)**:
  se descartó porque introduciría drift entre el schema versionado
  (introspectado) y el estado real de la BD, justo el problema que este ADR
  busca evitar hasta que haya un flujo de migraciones real.

## Consecuencias

- Las invariantes de integridad dependen, por ahora, **solo** de que el
  código de aplicación las respete (no hay una segunda línea de defensa a
  nivel de BD). El riesgo residual es bajo porque el ADR 0001 ya cierra las
  condiciones de carrera conocidas a nivel de aplicación.
- Esta decisión es temporal por diseño: el ítem de mayor prioridad en
  `roadmap/hardening-backlog.md` es justamente "adoptar migraciones antes de
  producción".
