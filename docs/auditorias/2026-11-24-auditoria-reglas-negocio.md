# Auditoría de reglas de negocio — tienda de colonia (El Salvador)

> **Informe congelado; el estado vivo se lleva en `docs/roadmap/`.** No editar retroactivamente: si algo cambia, se registra en el roadmap y se cita este informe.

| | |
|---|---|
| **Fecha** | 2026-11-24 |
| **Commit auditado** | `311edc4` (`master`) |
| **Alcance** | Reglas de negocio implementadas en `erp-tienda-backend/src/` (services, DTOs, controllers, `schema.prisma`) y su exposición en `erp-tienda-frontend/` (POS, inventario, movimientos, gastos, stats). Contrastadas con `docs/producto/srs.md` v3.0, `docs/domain/*` y `docs/modelo-contable/*`. |
| **Método** | Lectura de solo lectura (sin ejecutar tests, sin tocar BD, sin modificar código ni docs). Cada regla se evalúa con el principio rector del Ciclo 2026-11: **"apoyar, no imponer"** → *¿bloquea a la cajera? ¿hay pérdida real de dinero si no se bloquea?* Si no hay pérdida, preferir registrar-y-avisar a bloquear. Sin sobreingeniería. Si código y docs se contradicen, **gana el código** y la contradicción es hallazgo. |
| **Fuera de alcance** | Seguridad/concurrencia/arquitectura/UX visual (otras auditorías de la Fase 2), backup (pendiente conocido, Bloque 2.E), módulo fiscal/DTE. |

**Convenciones.** Severidad: 🔴 antes de la primera venta real · 🟡 importante · ⚪ menor. Tipo de regla: **Bloquea** (rechaza la operación), **Avisa** (deja pasar y muestra algo), **Auto** (el sistema decide/calcula sin intervención). Costo: S (horas), M (1–3 días), L (más de una semana o cambio de modelo). Referencias `ruta:línea` relativas a `erp-tienda-backend/src/` (BE) o `erp-tienda-frontend/` (FE).

---

## Resumen ejecutivo

El **núcleo contable es sólido**: el efectivo se conserva por construcción (origen→destino), la bóveda se deriva del libro, el FIFO congela el costo real, y los faltantes/sobrantes llegan al estado de resultados. Las reglas de dinero que **bloquean** son pocas y casi todas defendibles. El problema no está en el motor, sino en **lo que la cajera y la dueña no pueden hacer en el día a día**, y en reglas que el SRS promete pero la interfaz no deja usar.

**33 hallazgos nuevos: 2 🔴 · 18 🟡 · 13 ⚪** (más 4 ya conocidos, evaluados en §3.1 y sin contar).

Lo más importante:

1. **🔴 NEG-01 — Vender por fracción/peso es imposible desde la pantalla.** El backend acepta `0.5` libras, pero el POS solo suma/resta de 1 en 1 y el formulario de presentaciones solo acepta factores enteros (`min=1`, `parseInt`). El SRS promete "media libra de queso" como caso estrella.
2. **🔴 NEG-18 — Un producto que no está en el catálogo no se puede vender** y la cajera no puede crearlo (solo ADMIN). Junto con el ya conocido "sin stock registrado se rechaza la venta", hay dos paredes en el mostrador desde el día 1 (el catálogo nunca está completo al arrancar). No hay "venta libre" ni alta rápida.
3. **🟡 Efectivo bloqueado por el saldo que cree el sistema** (NEG-11, NEG-12, NEG-13): pagar un gasto desde la gaveta, o desde una bóveda que arranca en $0 sin "saldo inicial", se rechaza aunque el dinero físico exista. El resultado probable no es "no pagar", sino pagar **sin registrar**, lo que contamina el cierre con faltantes falsos. Es el caso típico donde bloquear causa peor dato que avisar.
4. **🟡 Cuentas por pagar es un callejón sin salida** (NEG-21) y la compra a crédito exige un origen de fondos sin sentido (`CAPITAL_DUEÑOS`) (NEG-15). Una deuda creada nunca baja: el patrimonio queda subestimado para siempre.
5. **🟡 Controles "blandos" que sí valen la pena** (NEG-25, NEG-26, NEG-27): hoy la cajera puede anular, devolver, retirar y hasta inyectar capital sin que nadie lo vea. No hace falta bloquear: basta registrar el autor (ya conocido) y mostrar un **resumen diario** con anulaciones, devoluciones y retiros.

Además: los vencimientos se capturan pero no se usan (NEG-22), no hay alertas de stock bajo (NEG-23), el conteo físico es lote por lote (NEG-24) y no hay camino en la UI para reponer cambio en la gaveta (NEG-02).

---

## §1 Inventario de reglas implementadas

Leyenda de la columna **SRS**: ✔ coincide · ✖ contradice o no es alcanzable (ver §2) · — no documentado en el SRS (queda implícito).

### 1.1 Turnos de caja

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Un solo turno `ABIERTA` a la vez (global, no por cajera) | BE `cajas_turnos/cajas_turnos.service.ts:39-47` | Bloquea | ✔ (nota NEG-33) |
| Fondo inicial ≥ 0 | BE `cajas_turnos/dto/create-caja_turno.dto.ts:10` | Bloquea | ✔ |
| `desde_boveda` ≤ fondo inicial y bóveda con saldo suficiente | BE `cajas_turnos.service.ts:26-30, 53-62` | Bloquea | ✔ (sin UI, NEG-02) |
| Traslado `TRASLADO_DESDE_BOVEDA` al abrir con fondo de bóveda | BE `cajas_turnos.service.ts:77-89` | Auto | ✔ |
| Fondo de apertura vs remanente del último cierre: sin comparación ni rastro | BE `cajas_turnos.service.ts:50-52` | — | ✔ (conocido **b**) |
| FE precarga el fondo con el remanente y al cerrar reabre solo con lo que quedó | FE `app/dashboard/pos/page.tsx:134-139, 218-227` | Auto | — |
| Cierre: diferencia = declarado − esperado | BE `cajas_turnos.service.ts:170-175` | Auto | ✔ |
| Cierre: diferencia ≥ $1.00 (env `TOLERANCIA_DESCUADRE`) exige justificación (también en FE antes de enviar) | BE `cajas_turnos.service.ts:180-189`, `common/tolerancia.ts`; FE `pos/page.tsx:193-200` | Bloquea | ✔ REQ-POS-05 |
| Toda diferencia > $0.001 se registra como `AJUSTE_FALTANTE`/`AJUSTE_SOBRANTE` | BE `cajas_turnos.service.ts:203-227` | Auto | ✔ |
| Monto a bóveda ≤ efectivo contado | BE `cajas_turnos.service.ts:235-240` | Bloquea | ✔ |
| Lo que queda = contado − trasladado, es el fondo siguiente | BE `cajas_turnos.service.ts:109-136` | Auto | ✔ |
| Cierre forzado solo ADMIN, exige justificación, estado `CERRADA_FORZADA` | BE `cajas_turnos.controller.ts:122-134`; `cajas_turnos.service.ts:180-189` | Bloquea (rol) | ✔ REQ-POS-06 |
| Turno cerrado es inmutable (anular lo respeta) | BE `ventas/ventas.service.ts:253-265` | Bloquea | ✔ |
| Quién abre queda en `usuario_id`; quién cierra no se guarda | BE `cajas_turnos.service.ts:65-73, 192-201` | Auto | ✖ parcial (NEG-04) |
| Roles ADMIN/CAJERO para todo el módulo | BE `cajas_turnos.controller.ts:76` | Bloquea (rol) | ✔ |

### 1.2 Ventas y contingencia

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Requiere turno abierto (revalidado bajo lock) | BE `ventas/ventas.service.ts:25-33, 56-67` | Bloquea | ✔ |
| Total calculado siempre por el backend con el precio **vigente** de la presentación; sin descuentos ni precio manual | BE `ventas.service.ts:84-104, 179-183` | Auto | ✔ |
| Cantidad ≥ 0.001, hasta 3 decimales | BE `ventas/dto/create-venta.dto.ts:17-19` | Bloquea | ✔ (UI no lo usa, NEG-01) |
| FIFO por `fecha_ingreso`, desempate `id`; congela `costo_aplicado` | BE `ventas.service.ts:121-169` | Auto | ✔ REQ-INV-03 |
| Stock insuficiente rechaza la venta completa (sin ventas parciales) | BE `ventas.service.ts:134-138` | Bloquea | ✔ (conocido **a**) |
| Efectivo esperado del turno += total | BE `ventas.service.ts:194-199` | Auto | ✔ |
| Precio 0 y producto sin presentaciones: se permiten (sin aviso) | BE `presentaciones/dto/create-presentacion.dto.ts:44`; FE `components/inventario/ProductDialog.tsx:156,349` | — | — (NEG-19) |
| Contingencia: fecha real opcional, no futura; sin límite inferior; el efectivo entra al turno actual | BE `ventas.service.ts:37-45`; `ventas/dto/create-venta.dto.ts` (`fecha`) | Bloquea (futuro) | ✔ REQ-POS-07 (NEG-31) |
| FE: "Paga con" → muestra cambio; no obliga a que alcance | FE `components/pos/CheckoutSection.tsx:59-60` | Avisa | — |
| FE: producto con stock 0 se muestra en rojo pero se puede agregar al ticket; el rechazo llega al cobrar | FE `pos/page.tsx:285, 478-483` | Avisa (visual) | — |
| FE: stock en unidades base, igual para "unidad" y "fardo" | FE `pos/page.tsx:285-296` | — | — (NEG-32) |
| Roles ADMIN/CAJERO | BE `ventas/ventas.controller.ts:16` | Bloquea (rol) | ✔ |

### 1.3 Anulación

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Solo ventas del turno **abierto** | BE `ventas.service.ts:253-265` | Bloquea | ✔ |
| Una venta ya anulada no se anula de nuevo (bajo lock) | BE `ventas.service.ts:270-282` | Bloquea | ✔ |
| Venta con devoluciones no se anula (corregido en 1A) | BE `ventas.service.ts:284-294` | Bloquea | ✔ (corregido) |
| Justificación obligatoria (cualquier texto no vacío) | BE `ventas/ventas.controller.ts:44-46` | Bloquea | — |
| Repone stock a los lotes exactos y resta el esperado del turno | BE `ventas.service.ts:316-339` | Auto | ✔ |
| **No se guarda quién anuló** (`anular()` no recibe `userId`) | BE `ventas.controller.ts:39-48`; `ventas.service.ts:235` | — | ✖ (conocido **d**) |
| Cualquier CAJERO puede anular cualquier venta del turno, sin tope ni umbral | BE `ventas.controller.ts:16` | — | — (NEG-25) |

### 1.4 Devoluciones

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Requiere turno abierto (el reembolso sale de la gaveta actual) | BE `ventas.service.ts:368-379` | Bloquea | ✔ REQ-INV-06 |
| Solo ventas `COMPLETADA` | BE `ventas.service.ts:393-397` | Bloquea | ✔ |
| Cantidad ≤ vendida − ya devuelta, por línea | BE `ventas.service.ts:423-436` | Bloquea | ✔ |
| Reembolso proporcional al subtotal congelado, redondeado a 2 decimales | BE `ventas.service.ts:439-443` | Auto | ✔ |
| Destino por línea: `REINGRESO` (vuelve al lote) o `MERMA` (se descarta; el costo queda como pérdida) | BE `ventas.service.ts:445-461`; `ventas/dto/create-devolucion.dto.ts:25` | Auto | ✔ |
| **No valida fondos**: el esperado puede quedar negativo | BE `ventas.service.ts:486-489` | Auto | ✖ vs doc (NEG-07) |
| Justificación opcional; sin límite de tiempo ni de monto; CAJERO puede | BE `create-devolucion.dto.ts:38-40`; `ventas.controller.ts:50-57` | — | — (NEG-25) |
| Autor sí se guarda (`usuario_id`) | BE `ventas.service.ts:476` | Auto | ✔ REQ-POS-08 |

### 1.5 Compras

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Solo ADMIN registra compras (CAJERO solo lee) | BE `compras/compras.controller.ts:16,21-22` | Bloquea (rol) | — |
| `monto_total` se recalcula desde los lotes; el del cliente se ignora | BE `compras/compras.service.ts:37-45` | Auto | ✔ REQ-COM-01 |
| `AL_CREDITO` solo con origen `CAPITAL_DUEÑOS` | BE `compras.service.ts:22-33` | Bloquea | ✔ (NEG-15) |
| Origen `CAJA_POS`: exige turno abierto y esperado ≥ monto; genera `PAGO_PROVEEDOR` GAVETA→PROVEEDOR | BE `compras.service.ts:89-136` | Bloquea | ✔ REQ-COM-02 |
| Origen `CAJA_GENERAL`: exige saldo de bóveda ≥ monto; `PAGO_PROVEEDOR` BOVEDA→PROVEEDOR, sin turno | BE `compras.service.ts:137-164` | Bloquea | ✔ |
| Origen `CAPITAL_DUEÑOS`: no genera ningún movimiento de efectivo (aporte en especie); es el valor **por defecto** del formulario | BE `compras.service.ts:49-86`; FE `components/inventario/CompraForm.tsx:126` | Auto | ✔ REQ-INV-05 (NEG-15) |
| Costo ≥ 0 y cantidad ≥ 0.001 en BE; FE exige costo > 0 | BE `compras/dto/create-compra.dto.ts:25,52`; FE `CompraForm.tsx:189` | Bloquea | — |
| `fecha_vencimiento` opcional por lote; se guarda y se muestra, no se usa | BE `compras.service.ts:67-69`; FE `inventario/page.tsx:350` | — | — (NEG-22) |
| La compra no guarda autor (`usuario_id`) | `prisma/schema.prisma:80-89` | — | ✖ (NEG-04) |
| No existe anular/editar una compra | — | — | — |

### 1.6 Cuentas por pagar

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Compra `AL_CREDITO` crea fila con `monto_deuda = saldo_pendiente` | BE `compras.service.ts:77-86` | Auto | ✔ REQ-COM-03 |
| **No hay API ni pantalla** para listar, abonar o saldar; el saldo nunca baja | (búsqueda: solo `compras.service.ts` y `reportes.service.ts` usan la tabla) | — | ✔ ("gestionable a futuro") (NEG-21) |
| El saldo pendiente resta del patrimonio | BE `reportes/reportes.service.ts:260-268` | Auto | ✔ REQ-FIN-06 |

### 1.7 Inventario, FIFO y presentaciones

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Stock en unidad base; venta de presentación descuenta `cantidad × factor` | BE `ventas.service.ts:98-100` | Auto | ✔ REQ-INV-01/02 |
| Factor ≥ 0.001 (3 decimales) en BE; **FE solo acepta enteros ≥ 1** | BE `presentaciones/dto/create-presentacion.dto.ts:38`; FE `ProductDialog.tsx:155,269,348,391`; `EditProductDialog.tsx:226` | Bloquea (FE) | ✖ (NEG-01) |
| Precio de venta ≥ 0 | BE `create-presentacion.dto.ts:44` | Bloquea | — |
| Código de barras único (opcional) | `prisma/schema.prisma:199`; BE `presentaciones/presentaciones.service.ts:198-200` | Bloquea | — |
| Cambio de precio deja historial (anterior→nuevo, autor) | BE `presentaciones.service.ts:144-160` | Auto | ✔ REQ-INV-02 |
| Crear/editar/borrar producto y presentación: solo ADMIN | BE `productos/productos.controller.ts:23-24,52-53,62-63`; `presentaciones/presentaciones.controller.ts:24-25,55-56,74-75` | Bloquea (rol) | — (NEG-18) |
| Factor y `producto_id` de una presentación son editables aunque ya tenga ventas | BE `presentaciones/dto/update-presentacion.dto.ts` (`PartialType`) | — | — (NEG-17) |
| Borrar producto/presentación con registros asociados falla por FK | BE `presentaciones.service.ts:184-191`; `productos.service.ts:82-87` | Bloquea | — |
| Sin mínimos de stock, sin alertas, sin FEFO | — | — | — (NEG-22/23) |

### 1.8 Mermas y conteos

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Solo ADMIN registra ajustes; el botón no se muestra a la cajera | BE `ajustes_inventario/ajustes_inventario.controller.ts:7`; FE `inventario/page.tsx:355` | Bloquea (rol) | — (NEG-16) |
| Ajuste por **lote**; tipos `QUEBRADO/VENCIDO/ROBO/CONTEO` (negativos) y `CONTEO_SOBRANTE` (positivo) | BE `ajustes_inventario.service.ts:19`; `dto/create-ajustes_inventario.dto.ts:26` | Auto | ✔ REQ-INV-04 |
| Un ajuste negativo no puede superar el disponible del lote | BE `ajustes_inventario.service.ts:33-37` | Bloquea | — |
| Valorado al costo del lote; merma → `MERMA_INVENTARIO` al P&L, sin turno, sin mover efectivo | BE `ajustes_inventario.service.ts:41-43, 78-92` | Auto | ✔ |
| Sobrante de conteo no afecta el P&L; solo se puede aplicar a un lote existente (la UI oculta lotes con 0) | BE `ajustes_inventario.service.ts:78`; FE `inventario/page.tsx:339-343` | Auto | ✔ (NEG-16) |
| Justificación opcional | BE `create-ajustes_inventario.dto.ts` | — | — |

### 1.9 Bóveda y arqueo

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Saldo de bóveda = Σ entradas − Σ salidas del libro (derivado) | BE `common/cuentas-efectivo.ts:32-43` | Auto | ✔ REQ-FIN-01 |
| Arranca en $0; la única forma de cargar efectivo inicial es "inyección" (ADMIN, ícono en Estadísticas) | BE `caja_general/caja_general.service.ts:26-43`; `caja_general.controller.ts:17`; FE `stats/page.tsx:344-360` | Auto | ✔ REQ-FIN-03 (NEG-12) |
| Arqueo: ADMIN declara el físico; descuadre ≥ $1 exige justificación; ajuste automático `AJUSTE_BOVEDA_*` | BE `caja_general.service.ts:53-100`; `caja_general.controller.ts:33` | Bloquea (≥umbral) / Auto | ✔ REQ-FIN-04 |
| Leer saldo: ADMIN/CAJERO; leer libro: ADMIN | BE `caja_general.controller.ts:47,54` | — | — |

### 1.10 "Sacar dinero" y gastos

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Tipos permitidos: `INGRESO_CAPITAL`, `RETIRO_BOVEDA`, `EGRESO_OPERATIVO`, `RETIRO_PERSONAL`; **todos los roles** (incluido el muerto `VENDEDOR`) | BE `movimientos_financieros/movimientos_financieros.controller.ts:7`; `dto/create-movimientos_financiero.dto.ts:14` | — | ✔ REQ-POS-03 (NEG-26) |
| Monto ≥ $0.01, descripción obligatoria (el FE la autocompleta) | BE `create-movimientos_financiero.dto.ts:24`; FE `SacarDineroDialog.tsx:100-115` | Bloquea | — |
| Egreso operativo exige categoría | BE `movimientos_financieros.service.ts:30-34` | Bloquea | ✔ REQ-FIN-02 (NEG-13) |
| Todo lo que toca la gaveta exige turno abierto | BE `movimientos_financieros.service.ts:77-84` | Bloquea | ✔ |
| Salida de gaveta con fondos insuficientes (según el esperado) | BE `movimientos_financieros.service.ts:147-153` | Bloquea | ✔ (NEG-11) |
| Egreso desde bóveda: no exige turno; exige saldo; **cualquier rol vía API** | BE `movimientos_financieros.service.ts:47-74` | Bloquea (saldo) | ✔ (conocido **c**; NEG-12) |
| UI de cajera: "Sacar dinero" ofrece solo Guardar en bóveda / Pagar algo / Retiro personal; `INGRESO_CAPITAL` y traer efectivo a la gaveta no tienen UI | FE `components/pos/SacarDineroDialog.tsx:34-53` | — | ✖ (NEG-02) |
| Retiro personal no resta de la utilidad; se reporta aparte | BE `reportes/reportes.service.ts:121-131` | Auto | ✔ REQ-FIN-05 |
| Gastos (pantalla): solo ADMIN | FE `lib/navigation.ts:33` | Bloquea (rol) | — |

### 1.11 Reportes y fórmulas (todos ADMIN)

| Fórmula | Dónde | Tipo | SRS |
|---|---|---|---|
| Ingreso = ventas `COMPLETADA` del período (día calendario en zona horaria de la tienda) | BE `reportes/reportes.service.ts:21-33`; `reportes.controller.ts:528-550` | Auto | ✔ (corregido 1B) |
| Utilidad neta = ingreso − devoluciones − COGS FIFO − gastos − mermas − faltantes + sobrantes | BE `reportes.service.ts:71-160` | Auto | ✔ REQ-FIN-05 |
| Devolución `REINGRESO` baja el COGS; `MERMA` deja el costo como pérdida | BE `reportes.service.ts:82-96` | Auto | ✔ |
| Retiros de dueños aparte (distribución, no gasto) | BE `reportes.service.ts:121-131` | Auto | ✔ |
| Ticket promedio sobre ingreso **bruto** (margen sí usa el neto) | BE `reportes.service.ts:168-173` | Auto | — (NEG-10) |
| Patrimonio = inventario al costo FIFO + gaveta + bóveda + activos fijos − deudas; vencidos/dañados valen su costo hasta que alguien los mermee | BE `reportes.service.ts:239-277` | Auto | ✔ REQ-FIN-06 (NEG-22) |
| Activos fijos: tabla sin API ni UI → siempre 0 | `prisma/schema.prisma:11-17`; BE `reportes.service.ts:254-258` | Auto | ✖ (NEG-05) |
| Flujo de efectivo por cuenta (+ ventas y devoluciones aparte) | BE `reportes.service.ts:288-345` | Auto | ✔ REQ-FIN-07 |
| Top productos / margen por producto con FIFO; "unidades" usa el factor **actual** | BE `reportes.service.ts:350-444` (382-384) | Auto | — (NEG-17) |
| `getResumen` de turno: suma **todas** las ventas (incl. anuladas) y no resta devoluciones; no lo usa ninguna pantalla | BE `cajas_turnos.service.ts:300-307`; `cajas_turnos.controller.ts:148-155` | Auto | ✖ (NEG-09) |
| FE Estadísticas con filtro "Hoy/Semana/Mes/Todo" y semáforo de margen (≥25% verde, <10% rojo) | FE `stats/page.tsx:108-109, 126-149` | Avisa | — |

### 1.12 Roles y permisos

| Regla | Dónde | Tipo | SRS |
|---|---|---|---|
| Roles creables: `ADMIN`, `CAJERO` | BE `usuarios/dto/create-usuario.dto.ts:10` | Bloquea | ✔ |
| `VENDEDOR` aparece en 3 controllers y en el FE pero no se puede crear (rol muerto) | BE `movimientos_financieros.controller.ts:7`, `caja_general.controller.ts:47`, `categorias_gastos.controller.ts:15`; FE `lib/navigation.ts:20` | — | ✖ (NEG-08) |
| Sin `@Roles`, cualquier usuario autenticado pasa | BE `auth/guards/roles.guard.ts:15-17` | — | — |
| CAJERO: ventas, anular, devolver, turnos, mover dinero de la gaveta, leer inventario y compras; ADMIN: todo lo demás | controllers (ver filas anteriores) | Bloquea (rol) | ✔ parcial |
| Borrar usuario es físico y deja `usuario_id = NULL` en todo su historial | BE `usuarios/usuarios.service.ts:120-128`; `prisma/schema.prisma` (`onDelete: SetNull`) | Auto | ✖ (NEG-03) |
| Un ADMIN puede borrarse a sí mismo o al último ADMIN | BE `usuarios.service.ts:120-128` | — | — |
| JWT 12 h con rol embebido (un cambio de rol no se aplica hasta que expira) | BE `auth/auth.module.ts:27` | — | — |

---

## §2 Contradicciones código ↔ SRS ↔ docs

| ID | Sev. | Qué dice cada fuente | Evidencia | Qué hacer |
|---|---|---|---|---|
| **NEG-01** | 🔴 | **SRS** (§1.1, REQ-POS-01): cantidades fraccionables, "media libra de queso". **Backend**: lo soporta (`Decimal`, 3 decimales). **UI**: el ticket solo cambia la cantidad de 1 en 1 y el factor de conversión solo admite enteros ≥ 1 (`parseInt(...) \|\| 1`): escribir `0.5` produce `1` en silencio o el navegador lo rechaza. Resultado: el 100% del soporte de peso/fracción está inalcanzable. | FE `components/pos/CartLines.tsx:51-70`; `ProductDialog.tsx:155,269,348,391`; `EditProductDialog.tsx:226`; `src/store/cartStore.ts:23-35` (`addItem` suma 1) | Campo de cantidad editable (decimal) en cada línea del ticket + "por monto" ($) para fraccionables; factor decimal en los diálogos. **M**. **Decisión de la dueña:** ¿vendés algo por peso o suelto (queso, frijol, azúcar, jamón)? sí/no. Si es "no", baja a ⚪ y se difiere. |
| **NEG-02** | 🟡 | **SRS** REQ-POS-02: el fondo puede tomarse de la bóveda. **Backend** lo hace; **UI** nunca envía `desde_boveda` (`body: { fondo_inicial }`) y el aviso de la UI manda a "Sacar dinero", que no tiene esa opción. Efecto: no existe forma en pantalla de pasar efectivo de bóveda a gaveta (reponer cambio a media jornada o abrir con más fondo); el efectivo "aparece" en la apertura sin rastro (el caso **b** conocido). | FE `pos/page.tsx:162-165, 626-631`; `SacarDineroDialog.tsx:34-53`; BE `cajas_turnos.service.ts:26-30,77-89` | Agregar en "Sacar dinero" la opción **"Traer de la bóveda"** (`TRASLADO_DESDE_BOVEDA` en turno abierto) y, al abrir, un selector del origen de la diferencia (ver decisión D-15). **M**. |
| **NEG-03** | 🟡 | **SRS** REQ-POS-08: cada turno, venta, movimiento y ajuste guarda su autor "para saber *de quién*". **Código**: borrar un usuario lo hace por `DELETE` físico y el esquema pone `usuario_id = NULL` en todo lo que hizo. Con 1–2 cajeras que rotan, despedir/reemplazar a una **borra la autoría** de todo su historial (y el rastro de faltantes, anulaciones y devoluciones). | BE `usuarios/usuarios.service.ts:120-128`; `prisma/schema.prisma` (`onDelete: SetNull` en `usuario_id`) | Reemplazar "Eliminar" por **"Desactivar"** (campo `activo`; el login lo rechaza). **S–M**. Evitar además borrar al último ADMIN. |
| **NEG-04** | ⚪ | **SRS** REQ-POS-08 dice "cada turno, venta, movimiento y ajuste". Falta autor en `compras_inventario` y no se guarda quién **cierra** el turno (solo el que abre). Anulación: conocido **d**. | `prisma/schema.prisma:80-89`; BE `cajas_turnos.service.ts:192-201` | `usuario_id` en compras y `cerrado_por` en turnos. **S**. |
| **NEG-05** | ⚪ | **SRS** REQ-FIN-06/§3: patrimonio incluye `activos_fijos`. **Código**: la tabla existe y se suma, pero no hay endpoint ni pantalla para crearla: el rubro vale $0 siempre (refrigerador, vitrina, báscula quedan fuera). | `prisma/schema.prisma:11-17`; BE `reportes.service.ts:254-258`; FE `stats/page.tsx:459` | Mini-formulario (nombre, valor, fecha) en Estadísticas, ADMIN. **S**. Decisión: ¿querés que el patrimonio cuente el equipo del negocio? sí/no. |
| **NEG-06** | ⚪ | **`docs/domain/caja-y-ventas.md`** (Turnos): "al abrir, si el fondo no coincide con el cierre, el sistema registra automáticamente `INGRESO_CAPITAL`/`AJUSTE_FALTANTE`". **Código**: eliminado en Bloque 1.E ("fuga F3"); hoy no hace nada. El SRS ya está correcto. | BE `cajas_turnos.service.ts:50-52` vs doc | Corregir el doc. **S**. |
| **NEG-07** | ⚪ | **`caja-y-ventas.md`** (Movimientos): tabla desactualizada (`caja_general`, faltan `RETIRO_PERSONAL`, `TRASLADO_*`, `MERMA_INVENTARIO`, `AJUSTE_BOVEDA_*`) y afirma "ningún egreso puede dejar `efectivo_esperado` en negativo". Falso para devoluciones, que restan sin validar fondos. Tampoco menciona el umbral de $1 ni `CONTEO_SOBRANTE`. | BE `ventas.service.ts:486-489` | Reescribir esas secciones; decidir una sola política de "fondos insuficientes" (ver NEG-11). **S**. |
| **NEG-08** | ⚪ | **SRS §3**: roles ADMIN/CAJERO. **Código**: `VENDEDOR` sigue en 3 controllers y en el tipo `Rol` del FE; la nota "D7" de `navigation.ts` dice que Gastos es ADMIN "porque toca `/caja-general` (POST)", ruta que ya no existe (se eliminó en 1.C). `security.md` ya lo reconoce. | BE `movimientos_financieros.controller.ts:7`; `caja_general.controller.ts:47`; `categorias_gastos.controller.ts:15`; FE `lib/navigation.ts:14-20` | Quitar `VENDEDOR` y corregir el comentario. **S**. |
| **NEG-09** | ⚪ | `getResumen` ("resumen total de caja") suma **todas** las ventas del turno incluidas `ANULADA` y no descuenta devoluciones; ninguna pantalla lo consume. Si alguien lo usa para un resumen de cierre, mostrará de más. | BE `cajas_turnos.service.ts:300-307` | Filtrar `estado: 'COMPLETADA'` y restar devoluciones, o eliminarlo; es la base natural del resumen del turno (NEG-27). **S**. |
| **NEG-10** | ⚪ | Redondeo: cada línea guarda `subtotal` a 2 decimales, pero `ventas.total` y el efectivo esperado suman los subtotales **sin redondear**; con cantidades fraccionarias (cuando NEG-01 se arregle) `Σ subtotales ≠ total` por centavos, y la devolución prorratea sobre el subtotal redondeado. Además el ticket promedio usa ingreso bruto y el margen el neto. | BE `ventas.service.ts:103-104,179-183,194-199`; `reportes.service.ts:163-173` | Redondear cada línea a 2 decimales antes de sumar (una regla). **S**. |

---

## §3 Reglas que imponen sin necesidad

### 3.1 Ya identificados (no cuentan como nuevos; evaluación bajo el principio rector)

| Ref. | Regla hoy | ¿Pérdida real si no se bloquea? | Evaluación |
|---|---|---|---|
| **a** | Producto sin stock registrado ⇒ se rechaza **toda** la venta (`ventas.service.ts:134-138`). | Ninguna física: el producto **está** en el mostrador. Lo que se pierde es la venta o el orden del inventario. | Bloquea sin necesidad. Recomendado: permitir, registrar la línea como "sin stock registrado" con costo estimado (el del último lote) y avisar; ver D-01. Cuidado: choca con el `CHECK (cantidad_disponible >= 0)` previsto en `docs/roadmap/hardening-backlog.md`. **M** (cambia el modelo: línea sin lote). |
| **b** | Fondo de apertura ≠ remanente del cierre: sin rastro (`cajas_turnos.service.ts:50-52`). | Sí, pequeña: se pierde el origen del efectivo. | El FE mitiga precargando el remanente, pero el campo es editable. Registrar-y-avisar con selector de origen (D-15). **M**. |
| **c** | Un CAJERO puede pagar gastos desde la bóveda vía API (`movimientos_financieros.service.ts:47-74`; la UI no lo ofrece). | Posible, pero el autor queda registrado. | Cerrar la puerta de la API (ADMIN) es gratis, no estorba a la UI. Ver NEG-26. **S**. |
| **d** | No se registra quién anuló una venta (`ventas.controller.ts:39-48`). | Es el hueco clásico de fraude (cobrar, anular, quedarse el efectivo). | Registrar autor; no bloquear (NEG-25). **S**. |

### 3.2 Hallazgos nuevos

| ID | Sev. | Regla que impone | Por qué sobra | Alternativa registrar-y-avisar |
|---|---|---|---|---|
| **NEG-11** | 🟡 | Una salida de la gaveta (gasto, retiro, guardar en bóveda) se rechaza si el *esperado del sistema* es menor al monto: `Fondos insuficientes en caja`. Igual en compra `CAJA_POS`. | El esperado depende de que **todo** lo anterior se haya registrado (fondo, ventas del cuaderno, cambio repuesto sin rastro, NEG-02). Si hay un hueco, la cajera tiene el dinero en la mano, el repartidor espera, **paga igual** y no queda registro; en el cierre aparece un faltante falso que le cae a ella. Bloquear produce peor dato y fricción en el mostrador. Además es inconsistente: las devoluciones no validan fondos. | Dejar pasar, registrar y mostrar un aviso persistente ("la gaveta quedó en negativo según el sistema: revisá el fondo"). Una sola política para todos los movimientos. **S**. *Decisión: ¿preferís que el sistema avise en vez de impedir? sí/no.* |
| **NEG-12** | 🟡 | Pagos/compras/aperturas desde bóveda se rechazan si el saldo derivado es insuficiente; la bóveda arranca en **$0** y la única forma de cargarla es una "inyección" que vive en dos íconos pequeños de Estadísticas. | El día 1 la dueña tiene efectivo guardado que el sistema no conoce: cualquier pago desde "Caja general" falla con "Fondos insuficientes" y nadie sabe por qué. No hay riesgo real en dejar saldo negativo transitorio; el arqueo ya existe para reconciliar. | (1) Asistente de arranque "¿cuánto efectivo guardado tenés hoy?" que crea el `INGRESO_CAPITAL` inicial; (2) permitir bóveda negativa con aviso en vez de bloquear. **S–M**. |
| **NEG-13** | 🟡 | El egreso exige elegir una categoría de gasto; en producción **no hay categorías** (solo las crea el seed de desarrollo) y la lista queda vacía. | Un gasto inmediato sin categoría no es una pérdida; la categoría es un dato de análisis, no un control. | Categoría por defecto "Otros" (se crea sola) y el selector opcional. **S**. |
| **NEG-14** | ⚪ | El cierre con descuadre ≥ $1 no se deja confirmar sin escribir una justificación (BE y FE). | Es decisión explícita (REQ-POS-05) y protege contra el robo hormiga, pero es fricción al final del turno, justo cuando la cajera ya sabe que "falta". La diferencia **ya** se registra siempre, con autor. | Dejar cerrar siempre; marcar el turno "descuadre sin explicar" y mostrarlo en el resumen diario, con la nota como opcional. *Decisión de la dueña:* ¿querés poder exigir la nota? (sí = se queda como está). **S**. |
| **NEG-15** | 🟡 | Una compra `AL_CREDITO` solo se acepta con origen `CAPITAL_DUEÑOS`, y el formulario trae **`CAPITAL_DUEÑOS` por defecto**. | Una compra fiada al distribuidor no es capital de nadie; obligarla a decir "capital" (a) confunde y (b) en la práctica deja el valor por defecto mal para la compra **pagada con la gaveta**: si se olvida de cambiarlo, la mercadería entra y el dinero físico sale **sin movimiento**, y el cierre muestra un faltante igual a la compra. | Si es `AL_CREDITO`, ocultar y ignorar el origen. Quitar el default (obligar a escoger) o ponerlo en "Caja POS". Ver NEG-21. **S**. |
| **NEG-16** | 🟡 | Mermas/ajustes de inventario solo ADMIN (el botón desaparece para la cajera). Y el ajuste positivo solo se puede aplicar a un lote con existencias (la UI esconde lotes en 0). | Cuando se rompe un producto en el mostrador, la cajera no puede registrarlo; se registra tarde o nunca, y la merma se confunde con "faltante de stock". No hay pérdida de dinero adicional por dejarla anotar. Un producto en 0 que se encuentra en la bodega no puede "agregarse" por conteo (hay que hacer una compra). | Permitir a CAJERO registrar **mermas** (no conteos) con motivo, visibles en el resumen diario. Permitir el ajuste positivo sobre producto sin lotes activos (crea un lote al costo del último). **S–M**. |
| **NEG-17** | ⚪ | (Más bien regla *ausente*: factor de conversión y producto de una presentación son editables aunque ya tenga ventas.) Los reportes de "unidades vendidas" usan el factor **actual**, así que cambiarlo reescribe la historia. | No amerita bloqueo (puede ser una corrección legítima). | Avisar al guardar si la presentación ya tiene ventas. **S**. |

---

## §4 Reglas faltantes para una tienda de colonia salvadoreña

Para cada una: **problema real**, **recomendación**, **costo** y si es **decisión de la dueña**.

### 4.1 Mostrador

**NEG-18 — 🔴 Producto fuera de catálogo (o sin código de barras): la cajera no tiene salida.**
*Problema:* llega alguien con un dulce o artículo nuevo que no está cargado; la cajera no puede crear productos (solo ADMIN) ni existe "venta libre"; o lo vende de palabra y fuera del sistema (el efectivo no cuadra) o lo deja ir. En el arranque el catálogo siempre está incompleto. *Evidencia:* BE `productos/productos.controller.ts:23-24`; `presentaciones.controller.ts:24-25`; FE `pos/page.tsx` (no hay "venta libre" ni "alta rápida"). La búsqueda por nombre sí existe (`pos/page.tsx:301-308`), por lo que "sin código" está resuelto; falta lo no registrado.
*Recomendación:* "**Alta rápida**" desde el POS (nombre + precio + categoría "Por revisar"), permitida a CAJERO; la dueña lo completa después. Opcional: botón **"Varios $"** (venta por monto, sin inventario, costo desconocido) como válvula. *Costo:* M. *Decisión (opciones):* A) alta rápida por la cajera (recomendado); B) botón "Varios" por monto; C) nada, la dueña carga todo antes de abrir.

**NEG-19 — 🟡 Precio $0 o por debajo del costo: nadie lo advierte.** *Problema:* un producto creado sin precio queda en $0 (`parseFloat(...) || 0` y backend `Min(0)`), y se vende regalado sin que el sistema diga nada; mismo caso con precio menor al costo del último lote. *Evidencia:* FE `ProductDialog.tsx:156,349`; BE `create-presentacion.dto.ts:44`; `create-compra.dto.ts:25`. *Recomendación:* **avisar/confirmar** ("el precio es $0.00 / queda por debajo del costo $X"), no bloquear; marcarlo en el POS. *Costo:* S.

**NEG-20 — 🟡 Cambio rápido de precios y qué pasa cuando sube el costo.** *Problema:* los precios se cambian de a uno, abriendo el diálogo del producto, solo ADMIN. Cuando una compra entra con costo más alto, nada avisa que el precio actual dejó un margen bajo o negativo (la dueña lo descubre meses después en Estadísticas). Sí existe historial de precios y semáforo de margen. *Evidencia:* BE `presentaciones.service.ts:132-166`; FE `EditProductDialog.tsx`; `stats/page.tsx:108-109`. *Recomendación:* (1) pantalla "Lista de precios" con tabla editable en línea (precio, último costo, margen %); (2) al registrar una compra, listar los productos cuyo margen quedó < umbral (aviso, no bloqueo). Sin precios automáticos. *Costo:* M. *Decisión:* ¿qué margen mínimo querés que te avise? (p. ej. 15%) .

**NEG-28 — 🟡 La compra se captura en unidad base, no por fardo.** *Problema:* la dueña compra "una caja de 24 a $18" pero el formulario pide cantidad y costo **por unidad base del producto**: tiene que dividir ella ($0.75) y un error de cálculo envenena el costo FIFO y el margen de todo ese lote. *Evidencia:* FE `CompraForm.tsx:113-118,189` (no hay selector de presentación). *Recomendación:* elegir la presentación comprada y escribir cantidad y costo **de esa presentación**; el sistema convierte con el factor. *Costo:* S–M.

**NEG-29 — 🟡 Recargas y servicios de terceros (saldo telefónico, pago de servicios).** *Problema:* típico en tiendas de colonia en El Salvador; hoy no existen. Si se cobran en la caja sin registrar, el esperado sube sin explicación (sobrante) o se registra como "venta" de un producto con stock ficticio. *Recomendación:* producto tipo **servicio** (no controla stock; costo = precio − comisión %), vendible en el POS; sin integración con operadoras. *Costo:* M. *Decisión:* ¿vendés recargas o cobrás servicios? sí/no (si no, se descarta).

**NEG-30 — ⚪ Fiado (evaluación, sin decidir).** *Hoy:* fuera de alcance por decisión de producto. *Qué pasa en la práctica:* el fiado se hace fuera del sistema; si se teclea como venta, el esperado sube pero el efectivo no entra y el cierre muestra un faltante igual al fiado (y un sobrante cuando pagan). La utilidad queda neutra pero con "robo hormiga" falso. *Conviene reabrirlo solo si* una parte significativa de las ventas son fiadas. *Opción mínima si se reabre:* venta marcada "fiada" (no suma al efectivo esperado, crea una cuenta por cobrar con nombre) y "abono" que sí suma; sin límites ni intereses. *Costo:* L (nuevo concepto en turno, reportes y patrimonio). *Decisión:* ¿qué porcentaje de lo que vendés es fiado? (si < ~10%, mejor no).

**NEG-32 — ⚪ Stock mostrado en unidades base para toda presentación.** Un "fardo de 12" muestra "stock 5" (unidades), aunque no se pueda vender ni un fardo. *Evidencia:* FE `pos/page.tsx:285-296`. Mostrar `floor(stock/factor)` por presentación. *Costo:* S.

### 4.2 Inventario

**NEG-22 — 🟡 Vencimientos: se capturan y no se usan.** *Problema:* se guarda `fecha_vencimiento` por lote y se muestra en el detalle, pero (1) el FIFO ordena por **fecha de ingreso**, no por vencimiento (un lote nuevo que vence antes se vende después); (2) no hay alerta de "vence pronto"; (3) el patrimonio valora los vencidos a su costo hasta que alguien registre la merma. Para lácteos, embutidos y pan es pérdida directa. *Evidencia:* BE `ventas.service.ts:121-128`; `compras.service.ts:67-69`; `reportes.service.ts:245`. *Recomendación:* primero **alerta** (lista "vencen en 15/30 días" y "vencidos sin merma" en el resumen diario); luego, opcional, descargar **primero lo que vence primero** (FEFO) cuando hay fecha. *Costo:* S (alerta) + M (FEFO, afecta el FIFO y sus tests). *Decisión:* ¿vendés cosas que vencen (lácteos, embutidos, pan)? sí/no; ¿querés que el sistema escoja primero lo que vence antes aunque llegó después? sí/no.

**NEG-23 — 🟡 Alertas de stock bajo.** *Problema:* nadie avisa que se acabó el arroz hasta que la cajera no puede vender. Sin mínimos por producto, la reposición depende de la memoria. *Recomendación:* campo opcional "avisar cuando queden ≤ N" por producto; lista "por reponer" en el resumen diario/inventario (solo avisa). *Costo:* S–M. *Decisión:* ¿querés una lista de "por reponer"? sí/no.

**NEG-24 — 🟡 Conteo físico periódico, hoy lote por lote.** *Problema:* el ajuste es por lote (`Lote #17`), pero quien cuenta ve estantes, no lotes; contar 200 productos así es inviable y se abandona. *Evidencia:* BE `ajustes_inventario.service.ts:19-51`; FE `AjusteInventarioDialog.tsx`. *Recomendación:* pantalla "Conteo" **por producto** (escribe lo que contó; el sistema calcula la diferencia y la reparte: baja de los lotes más antiguos / sube al más reciente), con la merma resultante visible. Frecuencia sugerida: mensual por categoría. *Costo:* M. *Decisión:* ¿cada cuánto querés contar? (opciones: semanal por categoría / mensual completo / nunca).

### 4.3 Dinero y control

**NEG-21 — 🟡 Cuentas por pagar: se crean pero no se pueden pagar.** *Problema:* no hay endpoint ni pantalla para listar, abonar o saldar (la tabla solo se escribe al comprar y se suma al patrimonio). Una deuda de $300 al distribuidor queda **para siempre** restando del patrimonio aunque se pague en efectivo ese viernes; o se paga sin registrar y el cierre muestra faltante. Conectado con NEG-15 (origen sin sentido). *Evidencia:* BE `compras.service.ts:77-86`; `reportes.service.ts:260-268`. *Recomendación:* lista de deudas + **"Pagar/abonar"** (monto, desde gaveta o bóveda; crea `PAGO_PROVEEDOR` y baja `saldo_pendiente`). Con eso se puede quitar la restricción de origen en compras a crédito. *Costo:* M. *Decisión:* ¿comprás fiado a distribuidores? sí/no (si no, se difiere).

**NEG-25 — 🟡 Anulaciones, devoluciones y retiros no son visibles (control blando).** *Problema:* la cajera puede anular una venta del turno (sin autor, **d**), hacer devoluciones de cualquier ticket de cualquier fecha sin motivo obligatorio, y esos movimientos **cuadran el cierre solos** (el esperado baja por el mismo monto). Es el patrón clásico de "cobrar, anular y quedarse el efectivo": el cierre nunca lo detecta. *Evidencia:* BE `ventas.controller.ts:39-57`; `ventas.service.ts:332-339, 486-489`. *Recomendación:* **no bloquear**. (1) Guardar autor de la anulación; (2) devolución con motivo obligatorio de una línea; (3) en el resumen diario: nº y monto de anulaciones/devoluciones **por cajera**, con las más altas resaltadas. *Costo:* S + parte de NEG-27. *Decisión:* ¿querés ver ese conteo por cajera? sí/no.

**NEG-26 — 🟡 Quién puede mover dinero.** *Problema:* hoy cualquier rol puede registrar `RETIRO_PERSONAL` ("Retiro de la dueña") e `INGRESO_CAPITAL` (por API) y gastos desde bóveda (**c**). Una cajera puede "retirar" para cuadrar un faltante o inflar el esperado con un "capital" que nunca entró. *Evidencia:* BE `movimientos_financieros.controller.ts:7`; FE `SacarDineroDialog.tsx:34-53` (el retiro personal se le ofrece a todos). *Recomendación:* cajera = gastos chicos de la gaveta + guardar en bóveda + devoluciones; **solo ADMIN** = retiro personal, ingreso de capital, gastos desde bóveda, arqueo. No toca el flujo cotidiano. *Costo:* S. *Decisión de la dueña (opciones):* A) retiro personal solo yo (recomendado); B) la cajera también, pero aparece en el resumen; C) como está.

**NEG-27 — 🟡 Resumen diario simple para la dueña.** *Problema:* la meta del producto es "saber si ganó". Hoy hay un filtro "Hoy" en Estadísticas (solo ADMIN, requiere entrar y leer P&L completo), pero no existe una vista de **un vistazo** con lo que importa ni los avisos del día. *Recomendación:* tarjeta "**Hoy**" al entrar a Estadísticas (y como resumen de cierre para la cajera): ventas y nº de tickets, ganancia estimada (utilidad bruta), efectivo en gaveta y bóveda, faltantes/sobrantes del día, y **avisos**: descuadre sin explicar, ventas sin stock registrado, anulaciones/devoluciones por cajera, productos por reponer, lotes por vencer, gaveta en negativo. Reusar `getResumen` corregido (NEG-09) y los reportes existentes. *Costo:* M. *Decisión:* ¿lo querés en pantalla, o enviado (WhatsApp/correo) al cerrar? (lo segundo suma complejidad).

### 4.4 Operación

**NEG-31 — ⚪ "Cierre del día" vs turnos; turno olvidado; contingencia sin límite inferior.** *Hoy:* los reportes ya cortan por **día calendario** de la tienda (1B), y el POS reabre el turno al cerrar, así que "turno" ≈ "relevo" y "día" ≈ vista de reportes: no hace falta una entidad "cierre del día". *Huecos:* (1) no hay aviso si un turno quedó abierto desde ayer (las ventas de hoy caen en un turno de ayer; hoy solo lo corrige el cierre forzado del ADMIN); (2) la fecha de una venta de apagón no tiene mínimo (un año mal escrito mueve ventas a otro período); (3) el FIFO se aplica hoy, no en la fecha retroactiva. *Evidencia:* BE `ventas.service.ts:37-45`; `cajas_turnos.service.ts:39-47`. *Recomendación:* aviso en el POS "este turno se abrió ayer" y aviso si la fecha de apagón tiene más de 3 días o es anterior al último cierre. **S**.

**NEG-33 — ⚪ Un solo turno global; con dos cajeras simultáneas la diferencia no se les puede atribuir.** *Evidencia:* BE `cajas_turnos.service.ts:39-47`; `ventas.usuario_id` sí se guarda. Si trabajan en relevo, está bien (cada una abre/cierra). Si coinciden en el mostrador, el descuadre es del turno, no de una persona. Aclarar la práctica con la dueña; **no cambiar el modelo** (sin sobreingeniería).

---

## §5 Decisiones para la dueña / dueño del proyecto

Cada decisión indica **quién decide** (D = dueña de la tienda, P = dueño del proyecto), opciones y mi recomendación. Las marcadas ★ son las de mayor impacto.

**★ D-01 — Vender un producto sin stock registrado (conocido a).** *P.* A) Seguir bloqueando (hoy). B) Permitir: la línea queda "sin stock registrado", costo = el del último lote, aviso al terminar la venta y en el resumen diario. C) Permitir solo a ADMIN. **Recomiendo B** (M): el producto está físicamente delante de la cajera; la información que falta se completa después. Implica relajar el `CHECK >= 0` previsto en el backlog. Depende de NEG-16 (ajuste positivo sin lotes).

**★ D-02 — Productos fuera de catálogo y "venta libre" (NEG-18).** *D.* A) La cajera hace un alta rápida (nombre y precio) marcada "por revisar". B) Botón "Varios $" por monto. C) Se carga todo antes de abrir y no se vende lo que no esté. **Recomiendo A**, y B solo si la dueña lo pide.

**★ D-03 — ¿Se vende por peso o fracción? (NEG-01).** *D.* Sí / No. Si **sí**, arreglar antes de la primera venta (entrada de cantidad decimal y de "por monto", factores decimales). Si **no**, se difiere y NEG-01 baja a ⚪.

**★ D-04 — Pagar con efectivo que el sistema cree que no hay (NEG-11, NEG-12).** *P+D.* A) Bloquear (hoy). B) Dejar pasar, registrar y avisar (gaveta o bóveda "en negativo"). **Recomiendo B**, más un asistente de arranque "efectivo guardado hoy" que carga la bóveda inicial.

**★ D-05 — Compras a crédito y pago de deudas (NEG-15, NEG-21).** *D.* ¿Comprás fiado a distribuidores? Si **sí**: lista de deudas con "Pagar/abonar" y se elimina la regla de `CAPITAL_DUEÑOS`; si **no**: se deja como está y se ajusta el texto. Recomiendo, en cualquier caso, quitar el origen por defecto `CAPITAL_DUEÑOS` del formulario.

**★ D-06 — Matriz de permisos de la cajera (NEG-25, NEG-26; conocidos c y d).** *D.* Recomendado: la cajera vende, anula y devuelve (con autor y motivo registrados), paga gastos chicos de la gaveta y guarda en bóveda; **solo la dueña** hace retiro personal, ingreso de capital, gastos desde bóveda, arqueo, compras y precios. Alternativa: dejar el retiro personal a la cajera pero visible en el resumen.

**D-07 — Resumen diario (NEG-27).** *D.* ¿Qué quiere ver al cerrar el día? Lista propuesta: ventas, ganancia, efectivo (gaveta + bóveda), faltantes, avisos. ¿Pantalla (recomendado) o mensaje enviado?

**D-08 — Descuadre al cerrar (NEG-14).** *D.* A) Exigir nota desde $1 (hoy). B) Dejar cerrar y marcar "sin explicar". **Recomiendo B** si la dueña revisa el resumen diario; A si no.

**D-09 — Vencimientos (NEG-22).** *D.* ¿Hay productos que vencen? Si sí: alerta de "vence pronto" (rápido) y, opcionalmente, vender primero lo que vence primero (FEFO), que cambia el orden de descarga del FIFO (P decide el costo técnico). **Recomiendo alerta ahora, FEFO solo si hay pérdidas por vencimiento.**

**D-10 — Stock bajo (NEG-23).** *D.* ¿Lista de "por reponer" con mínimo por producto? Recomiendo mínimo **opcional** y solo en los 20–30 productos críticos.

**D-11 — Conteo físico (NEG-24).** *D.* Frecuencia deseada (semanal por categoría / mensual / nunca) y si prefiere contar por producto. Recomiendo pantalla de conteo por producto, mensual.

**D-12 — Recargas/servicios (NEG-29).** *D.* ¿Se venden? Si sí, producto tipo servicio con comisión; si no, se descarta.

**D-13 — Fiado (NEG-30).** *D.* ¿Qué parte de las ventas es fiada? Si es poca (< ~10%), mantener fuera de alcance y que la dueña lo lleve aparte; si es mucha, reabrir con el diseño mínimo (venta fiada + abono, sin intereses). **No lo reabro sin ese dato.**

**D-14 — Margen mínimo y precios (NEG-19, NEG-20).** *D.* Umbral de aviso de margen (propongo 15%) y si quiere una "lista de precios" editable en línea. Los precios nunca se cambian solos.

**D-15 — Fondo de apertura distinto al remanente (conocido b + NEG-02).** *P.* A) Nada (hoy). B) Si difiere, preguntar al abrir "¿de dónde viene la diferencia?": *de la bóveda* (crea el traslado), *aporte de la dueña* (ingreso de capital) o *corrección/error* (queda anotado). Sin bloquear. C) Fondo no editable. **Recomiendo B**, junto con la opción "Traer de la bóveda" en "Sacar dinero".

**D-16 — Desactivar en vez de borrar usuarios (NEG-03).** *P.* Sí / No. **Recomiendo sí** (S–M): sin esto, cambiar de cajera borra el historial de quién hizo qué.

---

## Apéndice — Lo que ya está bien resuelto (no tocar)

- El efectivo se conserva por construcción y la bóveda es derivada; el arqueo la verifica.
- FIFO congela el costo real; devoluciones y anulaciones lo revierten al lote exacto.
- Faltantes y sobrantes siempre se registran (aunque sean centavos) y llegan al estado de resultados.
- Umbral de tolerancia ($1) configurable; el cierre forzado de ADMIN evita que un turno olvidado paralice el negocio.
- Reportes por día calendario en la zona horaria de la tienda (1B); anulación segura con devoluciones (1A).
- La devolución **no** bloquea por fondos ni por tiempo: ya sigue el principio rector (aunque, a la vez, habría que hacerla visible: NEG-25).
