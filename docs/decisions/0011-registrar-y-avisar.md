# 0011 — Registrar y avisar en vez de bloquear (fondos y apertura)

**Estado:** Aceptado · **Fecha:** 2026-11 (ciclo 2026-11, lote L6) · **Decisiones:** D-04, D-15

## Contexto

El saldo que "cree" el sistema (gaveta = `efectivo_esperado`, bóveda = saldo
derivado del libro) depende de que todo lo anterior esté registrado: el fondo,
las ventas del cuaderno, el cambio repuesto, el efectivo guardado el día 1. Si
hay un hueco, la cajera igual paga con el dinero que tiene en la mano; rechazar
el gasto (NEG-11, NEG-12) solo hace que se pague **sin registro**, y al cerrar
aparece un faltante falso que le cae a ella. Del mismo modo, abrir con un fondo
distinto al remanente del último cierre no dejaba rastro (NEG-02, caso "b"):
en la demo, $20 de fondo aparecieron en el patrimonio sin origen.

## Decisión

1. **Una sola política de fondos: registrar y avisar (D-04).** Gastos, retiros,
   guardar en bóveda, compras `CAJA_POS`/`CAJA_GENERAL`, egresos desde bóveda y
   "traer de la bóveda" nunca se rechazan por saldo. Se registran y la respuesta
   incluye `avisos: string[]` (mismo estilo que `POST /ventas`). Los locks
   (turno `FOR UPDATE`, advisory de bóveda) se conservan para que salidas
   concurrentes lean un saldo coherente; orden turno → bóveda.
2. **La diferencia de apertura siempre queda registrada (D-15).** `POST
   /cajas-turnos/abrir` compara `fondo_inicial` con el remanente y, si difiere,
   crea el asiento según `origen_diferencia` (`BOVEDA`, `APORTE`, `RETIRO`,
   `NO_SE`) o un ajuste "sin explicar". El esperado del turno arranca en el
   fondo, así que el asiento no lo vuelve a modificar. Nunca bloquea.
3. **Categoría de gasto opcional (NEG-13):** un egreso sin categoría cae en
   "Otros" (se crea sola).

## Consecuencias

- `efectivo_esperado` y el saldo de bóveda pueden ser negativos. Es una señal
  de "falta registrar algo", no un estado inválido; el cierre de turno y el
  arqueo de bóveda los reconcilian.
- Los reportes ven más movimientos: las diferencias de apertura sin explicar
  suman a faltantes/sobrantes del período.
- El `TRASLADO_A_BOVEDA` de la apertura no se liga al turno nuevo (evita que el
  cierre lo reste dos veces del remanente).
- Se elimina `desde_boveda` de la apertura; lo reemplaza `origen_diferencia`.
- Un typo grande en un monto ya no se frena en el servidor: queda a cargo del
  aviso y de la revisión al cerrar.
