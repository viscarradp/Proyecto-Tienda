# Proyecto-Tienda — instrucciones para Claude

Micro ERP para una tiendita colonial de El Salvador: punto de venta, caja y turnos, inventario FIFO por lotes,
gastos, deudas con proveedores, "Mi negocio" (los números de la dueña) y un bot de Telegram para registrar compras.
Monorepo:

- `erp-tienda-backend/` — NestJS 11 + Prisma 7 (`@prisma/adapter-pg`) + PostgreSQL (Supabase en producción).
- `erp-tienda-frontend/` — Next.js 16 (App Router), React 19, Tailwind 4, shadcn/ui. **Lee
  `erp-tienda-frontend/AGENTS.md` antes de tocar el frontend**: Next 16 no es el Next que conoces.

## Por dónde empezar

1. [`docs/roadmap/plan-fases.md`](docs/roadmap/plan-fases.md) — estado vivo del proyecto y qué sigue. Léelo primero.
2. [`docs/roadmap/backlog-ciclo-2026-11.md`](docs/roadmap/backlog-ciclo-2026-11.md) — lo pendiente (§1), las
   decisiones tomadas y el registro de lotes y olas.
3. [`docs/domain/`](docs/domain/) — reglas de negocio vigentes por tema (caja y turnos, ventas, inventario, dinero,
   reportes, roles, modo contingencia, bot de Telegram).
4. [`docs/decisions/`](docs/decisions/) — ADRs. Clave: 0001 (orden de locks), 0002 y 0013 (sin migraciones;
   producción en Render, Vercel y Supabase), 0011 (registrar y avisar), 0012 (anular sin borrar).
5. [`docs/operations/deployment.md`](docs/operations/deployment.md) — producción y cómo se aplica un cambio de esquema.

## Principio rector: apoyar, no imponer

La prioridad es la **flexibilidad y la rapidez de uso**, para que la tienda no abandone el sistema por frustración.
Antes de agregar una regla que bloquea, pregúntate: *¿bloquea a la cajera? ¿hay pérdida real de dinero si no se
bloquea?* Si no hay pérdida real, **se registra y se avisa** (`avisos: string[]` en la respuesta), no se bloquea.
Ejemplos ya decididos: vender sin stock registrado (deuda de stock), alta rápida de productos "por revisar", gastos
que dejan la gaveta en negativo. Las reglas que sí bloquean son reales: turno abierto, permisos por rol, no abonar más
de lo que se debe, justificación en descuadres altos.

Textos de pantalla en español llano de tienda, con los nombres de `erp-tienda-frontend/lib/glosario.ts` ("Gaveta",
"Bóveda"), nunca jerga contable.

## Forma de trabajo (pedida por el usuario)

- **Claude es el líder técnico:** planea, escribe el brief, lanza subagentes y revisa. **No programa él mismo**;
  la documentación del roadmap sí la puede editar.
- **Los subagentes usan Sonnet** (modelo económico), en un worktree aislado. Máximo 2–3 a la vez, sin archivos en común.
- **El usuario aprueba ola por ola.** Las decisiones de negocio se le plantean con opciones y una recomendación.
- **Brief de cada lote:** archivos permitidos, qué implementar, test que reproduce el problema primero, base de
  datos e2e propia, **no `npm run format`** (solo `npx prettier --write` sobre los archivos tocados) y el subagente
  **no hace commit**.
- **Revisión del líder:** diff completo; lint, build, unitarios y e2e completos; navegador si toca la interfaz
  (servidores en `.claude/launch.json`).
- **Git:** rama `feature/*`, merge `--no-ff` a `master` y push a `origin`. Commits en español con formato
  `tipo(área): descripción`. Los docs del área se actualizan **en el mismo cambio**, y el estado en `plan-fases.md`
  y el backlog.

## Trampas conocidas

- **Las e2e borran la base apuntada** (`db push --force-reset`). Usa siempre una base local desechable
  (`erp_tienda_<algo>` en el Postgres de `docker-compose.yml`), nunca la de desarrollo con datos ni una remota.
  Prisma 7 exige `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`: **pide el consentimiento al usuario** y no lo
  inventes. Guía: [`docs/operations/testing.md`](docs/operations/testing.md).
- **No hay migraciones** (ADR 0002 y 0013): en local los cambios de schema se aplican con `npx prisma db push`. Si
  agregas tablas o columnas, anótalas en "Cambios de esquema pendientes en Supabase" de `plan-fases.md` en el mismo
  cambio (Supabase las necesita).
- `npm run lint` del backend corre con `--fix` y puede tocar archivos que no cambiaste. Revisa `git status` después.
- `core.autocrlf=true` en Windows: reformatear archivos ajenos genera ruido de CRLF. Descarta los que no cambiaron
  de verdad.
- Concurrencia: orden global de locks turno → venta → lotes → pendientes; la bóveda usa el advisory lock
  `boveda_ledger` (ADR 0001).
- Los reportes cortan el día en la zona del negocio (`ZONA_HORARIA_NEGOCIO`, por defecto `America/El_Salvador`).

## Límites

- **Producción (Supabase y Render) solo con permiso explícito del usuario** para cada paso, y solo con los plugins
  oficiales (MCP de Supabase y de Render, con la sesión del usuario). No hay credenciales en el repo. Proyecto
  Supabase "Tienda ERP DB" y servicio Render "Proyecto-Tienda" (se despliega solo con cada push a `master`; frontend
  en Vercel, también automático). Un cambio de schema en Supabase se ensaya antes en una base local desechable y se
  compara con `prisma migrate diff`; nunca se corren e2e ni `db push --force-reset` contra una base remota. Los
  secretos (`DATABASE_URL`, `JWT_SECRET`, `INITIAL_ADMIN_PASSWORD`, tokens del bot) los carga el usuario en Render.
- **No subir secretos:** `.env` y `.env.local` están en `.gitignore`. No mostrar contraseñas en el chat.
