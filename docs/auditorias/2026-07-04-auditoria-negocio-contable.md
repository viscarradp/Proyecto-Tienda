# Auditoría de Negocio y Contabilidad — SRS v2.0 contrastado contra el código real

> **Alcance:** lógica de negocio, modelo contable y flujo de efectivo del sistema (SRS `docs/producto/srs.md` + backend `erp-tienda-backend/src/`).
> **Método:** revisión del SRS v2.0 desde la perspectiva de un CTO/contador, verificando cada afirmación contra el código real (schema Prisma, servicios de ventas, cajas, movimientos, compras, ajustes y reportes).
> **Fecha:** 4 de julio de 2026
> **Contexto clave:** hay una instancia desplegada pero **no es productiva y no tiene datos reales**. Eso significa que **cualquier cambio al modelo de datos es barato hoy** (ADR [`0002-sin-migraciones-hasta-produccion`](../decisions/0002-sin-migraciones-hasta-produccion.md): el schema se sincroniza con `db push`, sin migraciones que versionar todavía). El "reloj de costo" arranca con la primera venta real — esta auditoría define qué cerrar antes de que arranque.
> **Relación con otras auditorías:** complementa la [auditoría técnica del 2026-07-02](2026-07-02-auditoria-tecnica.md) (seguridad, concurrencia, calidad de código — sus 4 fases de remediación ya están cerradas). Esta auditoría cubre lo que aquella no: ¿el **modelo conceptual** del dinero y del inventario es correcto para el negocio real?

---

## 1. Resumen ejecutivo

**Corrección de premisa:** el SRS se presenta como "Fase de Diseño", pero el sistema ya está construido (backend NestJS completo, 13+ tablas, motor FIFO con locks, auth con roles, reportes con utilidad neta). El SRS quedó *detrás* del código: varios problemas del documento ya los resolvió el código, y varios problemas del código el documento ni los menciona. Esta auditoría evalúa ambos.

**Veredicto en una frase:** la arquitectura y el motor de inventario están notablemente bien construidos para esta escala, pero **el modelo de flujo de efectivo tiene cuatro fugas conceptuales que harán que la pregunta central de la dueña — "¿dónde está mi dinero?" — dé una respuesta incorrecta a las pocas semanas de uso real.** Todas comparten la misma causa raíz: movimientos de efectivo con una sola "pata" (falta declarar origen y destino). Y todas son triviales de corregir **hoy**, con la base de datos vacía.

Lo que *no* se encontró también importa: el manejo de concurrencia (FOR UPDATE, advisory locks, ADRs), el congelamiento de costos FIFO por lote y la separación "merma no toca efectivo" son de una calidad que no se ve en proyectos de esta etapa. Las fallas están concentradas en un solo lugar: **el ciclo de vida del efectivo fuera de la gaveta**.

---

## 2. Hallazgo central: el retiro personal de la dueña no existe en el modelo

El concepto de "sangría" (REQ-POS-03) es el modelo conceptual **equivocado** para el retiro personal de la dueña, y el código lo demuestra. Los tipos de movimiento permitidos hoy son exactamente tres (`create-movimientos_financiero.dto.ts`): `INGRESO_CAPITAL`, `RETIRO_BOVEDA`, `EGRESO_OPERATIVO`. Cuando la dueña saca $20 de la gaveta para uso personal, la cajera tiene dos opciones y **ambas corrompen la contabilidad**:

- **Registrarlo como `RETIRO_BOVEDA`**: la mecánica de caja funciona (resta del efectivo esperado, no genera faltante al cierre ✓), pero `movimientos_financieros.service.ts` deposita automáticamente ese monto en `caja_general`. El sistema ahora cree que hay $20 en la bóveda que en realidad están gastados. El saldo de bóveda se infla con cada retiro personal, y en tres meses el arqueo mental de la dueña contra el sistema ya no cuadra — que es exactamente el problema que el sistema debía resolver.
- **Registrarlo como `EGRESO_OPERATIVO`**: el efectivo cuadra, pero el retiro personal aparece como gasto del negocio en el estado de resultados, deprimiendo artificialmente la utilidad neta. La dueña verá "el negocio pierde" cuando en realidad el negocio gana y ella retira.

Contablemente son **tres cosas distintas** que la palabra "sangría" mezcla:

| Dinero que sale de la gaveta | Naturaleza contable | Impacto correcto |
|---|---|---|
| Traslado a bóveda | Transferencia entre activos | Ni gasto ni retiro; `caja_general` +monto |
| Pago a rutero / recibo de luz | Gasto o compra de inventario | P&L o inventario (ya existe: `PAGO_PROVEEDOR`, `EGRESO_OPERATIVO`) |
| Retiro personal de la dueña | **Retiro de capital (débito a patrimonio)** | **No existe hoy** |

**Recomendación:** agregar `RETIRO_PERSONAL` como cuarto tipo. Mecánica: resta `efectivo_esperado` del turno (cero fricción al cierre, igual que sangría), **no** toca `caja_general`, y se acumula en una cuenta de "Retiros de dueños" que el dashboard muestra junto al patrimonio ("este mes el negocio ganó $X y vos retiraste $Y"). En UX es un solo botón "Sacar dinero" con tres opciones grandes: *Guardar en bóveda / Pagar algo / Retiro personal*. Eso cumple la restricción innegociable del proyecto: tres toques para la cajera, contabilidad correcta detrás de cámaras. El SRS ya intuye esto en REQ-FIN-02 ("retiro de dividendos") pero nunca lo conectó con el flujo de caja — esa desconexión es el bug de diseño.

## 3. La caja general existe, pero tiene cuatro fugas

Lo bueno: `caja_general` ya está implementada como libro de movimientos con saldo verificable por `SUM()` y protección de concurrencia (advisory lock en `compras.service.ts`). El esqueleto es correcto. Pero hay cuatro agujeros por donde el dinero "desaparece" o se duplica:

**Fuga A — Imposible pagar gastos desde la bóveda.** `MovimientosFinancierosService.create` **exige un turno abierto** y siempre descuenta de la gaveta. Si la dueña paga el recibo de la luz con dinero de la bóveda, no hay forma de registrarlo: o lo registra falsamente como salido de la gaveta (genera faltante), o no lo registra (la bóveda del sistema queda inflada y el gasto no existe en el P&L). Las compras sí soportan `CAJA_GENERAL` como origen de fondos; los gastos operativos no. Es una asimetría, no una decisión.

**Fuga B — El flujo nocturno normal se registra como "faltante".** El más grave para la adopción. Escenario cotidiano: la cajera cierra con $300 declarados, la dueña se lleva $200 a la casa, mañana se abre con $100. `cajas_turnos.service.ts` (método `abrir`) compara fondo inicial contra el último cierre y registra la diferencia como `AJUSTE_FALTANTE` — "Faltante de efectivo". El comportamiento más rutinario del negocio queda contabilizado como pérdida de $200 diarios, y los $200 nunca entran a la bóveda. Es exactamente la fricción-acusación que mata la adopción, y además destruye el estado de resultados. Simétricamente: si abre con *más*, se auto-registra `INGRESO_CAPITAL` — pero si ese dinero venía de la bóveda, no es capital nuevo, es un traslado; contarlo como inyección infla el patrimonio con dinero que ya era del negocio (doble conteo).

**Fix para A+B:** el cierre debe preguntar "¿cuánto queda en gaveta para mañana?" y trasladar el resto a bóveda automáticamente (`TRASLADO_A_BOVEDA`); la apertura, si necesita más fondo que el remanente, toma de bóveda (`TRASLADO_DESDE_BOVEDA`). El `AJUSTE_FALTANTE` queda reservado para descuadres reales. Un paso más en el cierre, pero es un paso que la dueña *quiere* dar porque responde su pregunta.

**Fuga C — `inyectarCapital` es invisible para la contabilidad.** `caja_general.service.ts` crea la fila en la bóveda pero **no** crea el `movimiento_financiero` de `INGRESO_CAPITAL` correspondiente. El dinero aparece en la bóveda sin origen patrimonial — cuando se construya el cálculo de patrimonio, el capital aportado no cuadrará con el efectivo.

**Fuga D — Puerta trasera de ajuste manual.** El `POST /caja-general` genérico permite crear filas arbitrarias sin movimiento de origen. Está restringido a ADMIN, pero es una invitación a "cuadrar a mano" que rompe la trazabilidad. Debería eliminarse o convertirse en un **arqueo de bóveda** explícito (declarado vs. esperado, como el Corte Z pero para la bóveda, con justificación obligatoria) — la pieza que falta para que "¿dónde está el dinero?" tenga respuesta *verificable*, no solo calculada.

**¿Partida doble completa?** No — sería sobreingeniería para esta escala y contaminaría la UX. Pero sí su versión mínima: que **todo movimiento de efectivo declare cuenta origen y cuenta destino** de un catálogo cerrado (`GAVETA`, `BOVEDA`, `DUEÑOS`, `GASTO`, `PROVEEDOR`). Es una columna extra, no un sistema contable, y garantiza por construcción que el efectivo se conserva: nada entra a una cuenta sin salir de otra. Las cuatro fugas son, en el fondo, movimientos a los que les falta una de las dos patas. El inventario **no** necesita entrar a este esquema — el subsistema de lotes ya es su propio libro y está bien así.

## 4. Los faltantes de caja nunca llegan a la utilidad

`getEstadoResultados` (`reportes.service.ts`) resta gastos operativos y mermas, pero **ignora `AJUSTE_FALTANTE` y `AJUSTE_SOBRANTE`**. Un faltante de caja es una pérdida real (y la señal #1 de robo hormiga, que según REQ-POS-01 es un objetivo del sistema). Hoy una cajera puede generar $2 de faltante diario, justificarlo con cualquier texto, y la utilidad neta jamás lo reflejará — el número que la dueña mira estará sistemáticamente inflado y el fraude será invisible justo donde debería gritar. Los faltantes deben restar (y sobrantes sumar) en la utilidad neta, y el dashboard debería mostrar "faltantes acumulados por período" como métrica propia.

Relacionado: la merma solo se registra financieramente **si hay turno abierto** (`ajustes_inventario.service.ts` — el `if (cajaActiva)` se salta el registro silenciosamente). Una merma no es un evento de caja; registrarla un domingo sin turno hace que la pérdida desaparezca del P&L aunque el lote sí se descuente. Hay que quitarle la dependencia del turno (`caja_turno_id` ya es nullable en el schema — cambio de tres líneas).

## 5. El sistema dice auditar cajeros, pero no sabe quién es el cajero

El SRS declara "la caja audita a los cajeros" y existe tabla `usuarios` con roles y guards funcionando en los controllers — pero **ninguna tabla transaccional tiene `usuario_id`**: ni `cajas_turnos`, ni `ventas`, ni `movimientos_financieros`, ni `ajustes_inventario`. Con dos cajeras y un faltante, el sistema no podrá decir en qué turno *de quién* ocurrió. Con la BD vacía es una columna más en el schema y una línea por servicio (el JWT ya viaja en cada request — solo falta persistir `request.user.id`); con historial cargado, la atribución retroactiva sería imposible. **Es el ejemplo perfecto de por qué esta ventana importa.**

## 6. FIFO, redondeo y modelo de datos: mayormente sólido

- **Venta que cruza lotes**: correcta (`ventas.service.ts`), con `FOR UPDATE` que previene sobreventa concurrente y costo congelado en `detalle_venta_lotes` a 4 decimales. La anulación devuelve unidades **al lote exacto de origen** — bien resuelto.
- **Redondeo de fraccionamiento**: no existe el problema temido, porque el diseño no deriva el precio unitario del precio del fardo — cada presentación tiene su precio propio y el subtotal se congela en la venta. El histórico sobrevive cambios de precio (no se guarda `precio_unitario` explícito en `detalle_ventas`; es recuperable como `subtotal/cantidad`, aceptable).
- **Empate FIFO**: `ORDER BY fecha_ingreso ASC` sin desempate — dos lotes del mismo instante se consumen en orden no determinista, y `fecha_ingreso` es nullable (un NULL iría al final). Agregar `, id ASC` y hacer la columna NOT NULL. Cosmético y gratis.
- **Cantidades enteras**: `cantidad` y `factor_conversion` son `Int`. Si la tienda vende por peso fraccionado (media libra de queso, "$0.50 de azúcar"), el modelo no lo representa. Si todo se vende por unidad discreta, está bien — pero **hay que confirmarlo con la dueña antes de cargar el catálogo**: con la BD vacía, pasar a `Decimal` es un `db push`; con ventas registradas es una migración dolorosa. Si la respuesta es "sí se vende fraccionado", esto sube a crítico.
- **Faltan dos flujos de inventario**: (a) **ajustes positivos** — el servicio solo resta; encontrar stock de más o corregir un conteo físico hacia arriba no tiene camino; (b) **carga inicial** — el día uno la tienda ya tiene inventario; se necesita un flujo explícito de "inventario inicial" (una compra con origen `CAPITAL_DUEÑOS` funciona contablemente como aporte en especie, pero debe ser un flujo guiado, no un truco que haya que recordar).
- **Devoluciones de clientes**: solo existe anulación dentro del turno activo (bloqueada tras el cierre, correctamente, para no corromper el cuadre histórico). "Ayer compré esta leche y está mala" no tiene camino hoy. Para una tienda de colonia es un evento semanal, no un caso borde — merece un flujo de devolución que genere egreso de caja del turno *actual* y reingreso al lote (o merma si el producto se descarta).

## 7. Casos borde de POS/Caja

- **Turno abandonado abierto**: el bloqueo total es correcto para la integridad, pero necesita válvula de escape: **cierre forzado solo-ADMIN** que declare el efectivo contado por la dueña y marque el turno como `CERRADA_FORZADA`. Sin eso, el día que la cajera se vaya sin cerrar, el negocio vuelve al cuaderno.
- **Dos cajeras, un POS**: los turnos secuenciales lo soportan (cerrar → abrir toma segundos con el flujo de traslado de la sección 3). Sin `usuario_id` (sección 5), no sirve para auditar.
- **Ventas cruzando medianoche**: sin problema estructural — la venta pertenece al turno, los reportes filtran por fecha. Solo dejar claro en el dashboard que "el día" contable es el turno, no el calendario.
- **Justificación por $0.01**: el SRS la exige "por mínima que sea"; el código en realidad no la fuerza (crea el movimiento de ajuste con observaciones opcionales sobre un umbral de $0.001). Recomendación: **umbral de tolerancia configurable (~$0.25–0.50)** — debajo, ajuste automático sin pedir nada; encima, justificación obligatoria. La diferencia siempre queda registrada (para detectar el patrón de "faltantes chiquitos diarios"), pero la fricción solo aparece cuando importa. El SRS pide algo más hostil que lo construido — actualizarlo.

## 8. Dashboard ejecutivo y patrimonio

Los datos capturados **casi** alcanzan. Existe: utilidad bruta y neta FIFO reales, margen por producto, valor de inventario calculable por lote, activos fijos, cuentas por pagar. Lo que falta para que el dashboard no mienta:

1. Las fugas de la sección 3 (sin bóveda íntegra, "Efectivo total = gaveta + bóveda" da un número ficticio).
2. La cuenta de retiros de dueños de la sección 2 (sin ella no se puede explicar por qué el patrimonio bajó aunque hubo utilidad — la respuesta "porque retiraste $X" es probablemente el insight más valioso del dashboard para una dueña no-contadora).
3. Faltantes en el P&L (sección 4).
4. No existe aún endpoint de patrimonio — la fórmula del SRS 2.4 es correcta como foto de balance (`Inventario + Efectivo + Activos Fijos − Deudas`), pero solo será verificable cuando "Efectivo" esté bien definido. La depreciación de activos fijos se omite conscientemente a esta escala (documentarlo como decisión).
5. El flujo de efectivo que el SRS promete en 1.1 y nunca desarrolla: con el modelo origen/destino de la sección 3 sale casi gratis (entradas y salidas por cuenta y por período). Sin ese modelo, es reconstrucción manual.

## 9. Stack y riesgos operativos

- **La "decisión pendiente" Python vs Node del SRS ya no está pendiente**: hay un backend NestJS completo, con transacciones, locks y ADRs. Relitigar sería tirar el activo más valioso del proyecto. NestJS + Prisma es perfectamente mantenible para un dev solo. Actualizar el SRS a la realidad.
- **Talón de Aquiles: 100% cloud + internet doméstica.** Cada venta requiere red. Cuando el internet se caiga a las 7am (y se va a caer), la tienda vuelve al cuaderno — y cada regresión al cuaderno erosiona la adopción. No se recomienda offline-first completo ahora (sobreingeniería seria: sincronización, conflictos FIFO, semanas de trabajo), pero sí un **modo contingencia diseñado**: hoja física simple + pantalla de "registrar ventas del apagón" en lote al volver la conexión. Barato y honesto.
- **Cold starts**: Vercel solo aloja el frontend; el API NestJS necesita host propio, y los tiers gratuitos duermen los servicios. Un lector de barras que espera 30 segundos a que despierte el backend en la primera venta de la mañana es fricción letal. Presupuestar el tier mínimo de pago (~$5–7/mes) o un keep-alive.
- **Backup**: la contabilidad completa del negocio vivirá en Supabase; el tier gratuito no garantiza backups restaurables. Un `pg_dump` nocturno vía GitHub Actions hacia un storage es una tarde de trabajo y es innegociable antes de la primera venta real.
- **Impuestos (El Salvador)**: las tiendas de colonia típicamente operan bajo el umbral de inscripción de IVA o informalmente — no construir módulo fiscal ahora. Pero El Salvador está desplegando factura electrónica (DTE) obligatoria para contribuyentes; si el negocio se formaliza, el histórico de ventas ya tiene la granularidad necesaria para retrofitting. Documentar "sin módulo fiscal" como decisión consciente, no como omisión.
- **Segunda tienda**: el diseño asume un solo turno `ABIERTA` global (todos los servicios hacen `findFirst({estado: 'ABIERTA'})`). Multi-tienda requerirá `tienda_id` en media docena de tablas y revisar cada `findFirst`. Costo real pero acotado; aceptable posponerlo, no aceptable olvidarlo.
- **Deuda pequeña que dolerá en 12 meses**: convención de signos inconsistente (`caja_general.monto` con signo vs. `movimientos_financieros.monto` siempre positivo + tipo) y conversiones `Number()` sobre Decimals en validaciones de fondos — floats y dinero no se mezclan. Ambas son limpiezas pequeñas hoy.

---

## 10. Priorización final

La instancia desplegada **no tiene datos**, así que hoy nada es caro: un cambio de schema es un `db push` y redeploy. La clasificación no es "barato vs. caro" sino **"qué debe estar cerrado antes de la primera venta real"** — porque ese día el costo de cada pendiente empieza a crecer, y algunos (como la atribución por usuario) se vuelven irreversibles.

### Bloque 1 — ANTES de la primera venta real (la ventana se cierra con datos)

| # | Cambio | Por qué en este bloque |
|---|---|---|
| 1 | `usuario_id` en `cajas_turnos`, `ventas`, `movimientos_financieros`, `ajustes_inventario` | Irrecuperable retroactivamente; hoy es una columna + una línea por servicio |
| 2 | Tipo `RETIRO_PERSONAL` + cuenta de retiros de dueños (§2) | Cambio de modelo conceptual; con historial habría que reclasificar movimientos |
| 3 | Traslados gaveta↔bóveda en cierre/apertura, eliminando el falso `AJUSTE_FALTANTE`/`INGRESO_CAPITAL` (§3, fuga B) | Ídem — reclasificación retroactiva imposible de automatizar |
| 4 | Modelo origen/destino en movimientos de efectivo (§3) — la "partida doble mínima" | Es la causa raíz de las 4 fugas; una columna hoy, una migración de datos después |
| 5 | Confirmar con la dueña si algo se vende fraccionado → `Int` vs `Decimal` en cantidades (§6) | Cambio de tipo trivial con BD vacía, doloroso con ventas registradas |
| 6 | Gastos y retiros pagables desde bóveda (§3, fuga A) | Sin esto, la bóveda diverge de la realidad desde la semana 1 |
| 7 | Flujo de carga inicial de inventario (§6) | Se necesita literalmente el día 1 |

### Bloque 2 — Para el go-live (no tocan el modelo, pero condicionan la confianza en los números)

8. Faltantes/sobrantes de caja al estado de resultados; merma sin dependencia de turno abierto (§4).
9. `inyectarCapital` con su movimiento financiero; cerrar el POST manual a `caja_general` y reemplazarlo por arqueo de bóveda (§3, fugas C y D).
10. Umbral de tolerancia en cierre + cierre forzado ADMIN (§7).
11. Backup automatizado (`pg_dump` nocturno) + hosting del API sin cold starts (§9).
12. Ajustes positivos de inventario / conteo físico (§6).

### Bloque 3 — Con el sistema ya operando

13. Devolución de clientes post-turno (§6).
14. Modo contingencia sin internet (§9).
15. Endpoint de patrimonio y flujo de efectivo en el dashboard (§8).
16. Historial de precios de presentaciones; desempate FIFO por `id`; inmutabilidad a nivel BD (revocar UPDATE/DELETE en tablas contables); unificar convención de signos.
17. Depreciación, DTE/impuestos, multi-tienda — solo si el negocio lo pide.

### Meta-hallazgo

**Actualizar el SRS a v3.0** reflejando lo construido (NestJS decidido, utilidad neta, anulaciones, roles, caja_general) e incorporando las decisiones que salgan de esta auditoría. El documento actual describe un sistema que ya no existe, y un SRS desactualizado es peor que ninguno porque audita contra la ficción.
