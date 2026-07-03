# 0009 — Testing e2e, Docker mínimo y CI (Fase 3)

**Estado:** Aceptado · **Fecha:** 2026-07-04 (Fase 3 de endurecimiento)

## Contexto

El proyecto no tenía más que el scaffolding por defecto de NestJS (un test
trivial de "Hello World"), ningún `docker-compose`, y ninguna CI. Las
regresiones de concurrencia de Fase 0 (sobreventa, sobregiro, doble
apertura/cierre de turno) solo se habían verificado **a mano con `curl`**
contra un Postgres desechable levantado por Docker — útil en el momento,
pero no repetible ni protegido contra que alguien las reintroduzca después.

El usuario fijó una regla explícita para toda esta fase: **"no añadas
complejidad que no necesitamos"**. Cada decisión de abajo se tomó con ese
filtro.

## Decisiones

### 1. Docker: solo Postgres, no todo el stack

`docker-compose.yml` (raíz del repo) levanta **únicamente** un Postgres 16
local. El backend sigue corriendo con `npm run start:dev` (hot-reload
rápido) y el frontend con `npm run dev` — ninguno de los dos se dockerizó.

**Por qué:** lo que realmente faltaba era una base de datos local
reproducible para desarrollar y para correr tests — no una forma de
empaquetar el backend (que hoy no tiene ningún requisito de despliegue que
dependa de un Dockerfile local; cuando se decida GCP/Vercel, el
empaquetado de despliegue es una decisión aparte, no de esta fase).
Dockerizar el backend/frontend para desarrollo local solo habría restado
velocidad de iteración (rebuilds más lentos que el watch nativo) sin
resolver ningún problema real hoy.

### 2. Alcance del testing: regresiones de concurrencia, no cobertura exhaustiva

Se agregaron **7 tests e2e** (`test/*.e2e-spec.ts`), enfocados exactamente
en los escenarios que la auditoría encontró como reales y que antes solo se
habían verificado a mano:

- Motor FIFO: venta correcta, stock insuficiente, y **sobreventa bajo
  concurrencia** (hallazgo H1).
- Turnos de caja: **doble apertura concurrente** (hallazgo H7), cierre con
  cálculo correcto de diferencia, y **doble cierre concurrente** (mismo
  patrón de bug que H7, aplicado al cierre).

**Por qué no más cobertura:** escribir tests unitarios/e2e para cada
endpoint del CRUD sería trabajo considerable sin protección adicional real
— esos endpoints son simples y ya están cubiertos por `class-validator` +
TypeScript. El valor real está en los flujos con lógica de concurrencia,
que son los únicos que ya demostraron tener bugs reales (el deadlock de
Fase 0 se encontró así, a mano). Formalizar esos escenarios como tests
repetibles es proporcional; perseguir cobertura por cobertura no lo es.

**Verificación de que los tests tienen dientes:** se revirtió
deliberadamente el `FOR UPDATE` del motor FIFO (Fase 0) y se confirmó que
el test de concurrencia lo detecta (todas las ventas concurrentes pasaban
sin ningún rechazo, evidenciando la sobreventa) antes de restaurar el fix.

### 3. Hallazgo colateral: `.prettierrc` faltaba en el disco (no en el repo)

Al correr lint sobre archivos nunca tocados en ninguna fase anterior
(ej. `reportes.controller.ts`), aparecieron decenas de errores de
"convertir comillas simples a dobles" — en **todo** el archivo, no solo en
líneas modificadas. La causa **no** era que el proyecto nunca tuviera un
`.prettierrc` — sí lo tiene, comiteado desde el primer commit del repo
(`{"singleQuote": true, "trailingComma": "all"}`) — sino que ese archivo
**faltaba en el disco de este entorno de trabajo** (una eliminación local
nunca comiteada, previa a esta sesión). Sin él, Prettier usaba su default
(comillas dobles) mientras que **todo el código ya escrito** usa comillas
simples de forma consistente. Sin corregir esto, el gate de `lint` en CI
habría fallado desde el primer commit, sin relación con el trabajo de esta
fase.

**Fix:** `git restore erp-tienda-backend/.prettierrc` — recuperar el
archivo ya versionado, no inventar uno nuevo. Se corrió `eslint --fix` una
vez sobre todo `src/` para limpiar el resto de deuda de formato preexistente
(reflow de líneas, comas finales) — confirmado con `git diff -w` y lectura
manual que es 100% cambio de formato, cero lógica.

### 4. CI: GitHub Actions, dos jobs independientes

`.github/workflows/ci.yml` corre en cada push y en PRs a `master`:

- **`backend`**: usa un Postgres de servicio nativo de GitHub Actions (no
  reutiliza `docker-compose.yml` — es más simple invocar el mecanismo
  nativo de Actions que orquestar Compose dentro de un runner). Corre
  `lint:check` (sin `--fix`, para que falle si hay algo pendiente en vez de
  corregirlo silenciosamente), `build`, tests unitarios, y los tests e2e.
- **`frontend`**: `lint` + `build` — no se inventan tests que no existen.

**Rate-limiting relajado en `NODE_ENV=test`:** la suite e2e dispara decenas
de requests en segundos contra el mismo "cliente" (localhost); con los
límites reales (60/min global, 5/min login) los tests fallarían por `429`
sin que hubiera ningún bug real. `src/common/throttler-limits.ts` centraliza
esto: límites reales en desarrollo/producción, límites muy altos solo si
`NODE_ENV === 'test'`. No es un hueco de seguridad — solo aplica cuando
quien controla el entorno es la propia suite de tests.

## Un permiso explícito que vale la pena documentar

Al correr `npx prisma db push --force-reset` por primera vez, Prisma
detectó que la orquestaba un agente de IA y **bloqueó la ejecución**,
exigiendo confirmación explícita del usuario antes de proceder (con el
motivo, el comando exacto, y la advertencia de que es irreversible). Se
pidió y se obtuvo esa confirmación antes de continuar. Se documenta aquí
porque es exactamente el tipo de barrera que debe respetarse siempre,
nunca sortearse — y porque explica por qué el `global-setup.js` de los
tests usa `??=` para los valores por defecto: apuntar accidentalmente
`DATABASE_URL` a una base real y correr esto sería catastrófico e
irreversible.

## Consecuencias

- `npm run test:e2e` ahora requiere un Postgres local corriendo
  (`docker compose up -d postgres`) — documentado en
  [`../operations/testing.md`](../operations/testing.md).
- El commit de auto-formato (`.prettierrc.json` + `eslint --fix`) toca
  ~15 archivos con cambios puramente de whitespace — revisar ese commit
  específico si alguna vez hace falta hacer `git blame` en esas líneas.
- CI fallará si alguien reintroduce el bug de concurrencia de Fase 0, o si
  el motor FIFO/turnos de caja se rompen de cualquier otra forma cubierta
  por estos 7 tests.
