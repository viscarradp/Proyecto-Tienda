# Documento de Especificación de Requerimientos (SRS) — v2.0

> **Estado (2026-07-04):** este documento quedó **detrás del código**. Se escribió en fase de diseño, pero el sistema ya está construido (backend NestJS + Prisma completo, frontend en rediseño). Varias cosas que aquí figuran como pendientes ya están decididas o implementadas (backend Node/NestJS, utilidad neta, anulación de ventas, usuarios/roles, caja general), y la [auditoría de negocio del 2026-07-04](../auditorias/2026-07-04-auditoria-negocio-contable.md) identificó correcciones al modelo conceptual (retiro personal de dueños, traslados gaveta↔bóveda, origen/destino de movimientos). **Pendiente: reescribir como v3.0** incorporando esas decisiones. Mientras tanto, si este documento contradice al código, el código manda.

**Proyecto:** Sistema ERP (POS, Inventario FIFO y Contabilidad) para Tienda de Colonia

**Ubicación:** El Salvador

**Fase Actual:** Diseño Arquitectónico Finalizado

## 1. Visión General y Arquitectura

## 1.1 Propósito

Desarrollar un sistema de gestión integral adaptado a la alta transaccionalidad de una tienda de colonia. El sistema automatiza el Punto de Venta (POS), resuelve el fraccionamiento de inventario (fardos a unidades) mediante control de lotes FIFO, y genera estados financieros reales (Patrimonio, Ganancias y Flujo de Efectivo).

## 1.2 Infraestructura y Stack Tecnológico

* **Arquitectura:** 100% Cloud (Nube) para permitir acceso remoto en tiempo real (ej. desde la universidad).
* **Hardware en Sitio:** Laptop (reutilizada) conectada a lector de código de barras vía USB/Bluetooth.
* **Frontend:** React (Alojado en Vercel - Capa gratuita). Prioridad en UI minimalista y rápida.
* **Base de Datos:** PostgreSQL (Alojada en Supabase).
* **Backend:** API REST *(Lenguaje pendiente de definición final: Python/FastAPI o Node.js)*.

---

## 2. Lógica de Negocios y Requerimientos Críticos

## 2.1 Módulo 1: Punto de Venta (POS) y Control de Caja

La caja es una entidad temporal que audita a los cajeros, no la cuenta bancaria del negocio.

* **REQ-POS-01 (Transacciones):** Registro rápido de ventas escaneando códigos de barras o mediante botones de acceso rápido para productos sin código (ej. pan, verduras). Solo se acepta **efectivo**. No hay módulo de créditos (fiado).
* **REQ-POS-02 (Apertura Independiente):** Cada turno de caja es independiente. El usuario debe ingresar explícitamente el "Fondo Inicial" físico al abrir la caja.
* **REQ-POS-03 (Sangrías / Retiros):** Permite registrar retiros de efectivo durante el turno (ej. para guardar ganancias en la casa o pagar un recibo). Esto resta el efectivo esperado del turno, pero pasa a la contabilidad general.
* **REQ-POS-04 (Corte Z estricto):** Al cerrar, el sistema calcula el "Efectivo Esperado" (Fondo + Ventas - Retiros). El usuario ingresa el "Efectivo Declarado" (lo que contó físicamente). El sistema calcula la diferencia.
* **REQ-POS-05 (Auditoría):** Si hay un faltante o sobrante en el cierre, el sistema exige una justificación escrita obligatoria para poder guardar el turno. Turnos anteriores no cerrados bloquean nuevas operaciones.

## 2.2 Módulo 2: Inventario Complejo y Catálogo (El Core del Sistema)

El inventario separa el producto conceptual de su presentación comercial y de su existencia física.

* **REQ-INV-01 (Unidad Mínima):** El sistema rastrea todo el stock en la unidad matemática más pequeña posible (ej. unidades individuales, no fardos).
* **REQ-INV-02 (Escalas y Presentaciones):** Un mismo producto puede tener múltiples códigos de barras y precios según cómo se venda (ej. Unidad a $0.15, Fardo de 25 a $3.00). El sistema traduce la venta del fardo restando 25 unidades del stock base.
* **REQ-INV-03 (Lotes y Trazabilidad FIFO):** **Punto Crítico.** El stock no es un número global. Se divide en "Lotes de Compra". Al vender, el sistema descarga unidades del lote más antiguo primero (FIFO - *First In, First Out*), garantizando que el costo de venta (COGS) refleje exactamente lo que costó esa unidad específica.
* **REQ-INV-04 (Mermas y Ajustes):** Permite registrar pérdidas (producto quebrado, vencido o robado) descontándolo directamente del lote específico e impactando la contabilidad como un "Gasto/Pérdida", sin ensuciar el historial de ventas.

## 2.3 Módulo 3: Compras y Proveedores

* **REQ-COM-01 (Ingreso de Mercadería):** Permite registrar la compra a proveedores (ej. ruteros), creando un nuevo Lote de Inventario con su cantidad, costo de adquisición exacto y fecha.
* **REQ-COM-02 (Origen de Fondos para Compras):** Al registrar una compra de inventario, el sistema debe permitir seleccionar tres orígenes de fondos, ejecutando lógicas distintas en el backend:
  - **Caja POS:** Vincula el egreso al turno actual (reduce el efectivo esperado en gaveta).
  - **Bóveda / General:** Registra el egreso sin afectar la caja del turno activo.
  - **Bolsillo Dueños (Capital):** Genera automáticamente un movimiento previo de "Ingreso de Capital" antes de registrar el egreso por la compra, para mantener el balance patrimonial correcto.

* **REQ-COM-03 (Cuentas por Pagar):** Permite registrar facturas "Al crédito" y gestionar abonos futuros a esa deuda. (no necesario a este punto)

## 2.4 Módulo 4: Contabilidad y Finanzas

Abandona el simple flujo de caja para implementar contabilidad administrativa real.

* **REQ-FIN-01 (Gastos Operativos):** Registro de pagos de servicios (luz, agua, alcaldía, ayudantes), categorizados como fijos o variables.
* **REQ-FIN-02 (Movimientos de Capital):** Registro de inyecciones de dinero (los dueños ponen plata) o retiro de dividendos (los dueños sacan ganancia limpia).
* **REQ-FIN-03 (Activos Fijos):** Catálogo de inmobiliario (vitrinas, refrigeradoras) con su valor estimado.
* **REQ-FIN-04 (Estados Financieros):** El sistema es capaz de calcular en tiempo real:
  * *Utilidad Bruta:* Suma de Ventas - Suma de Costos de Venta (basado en el costo histórico de los lotes descargados).
  * *Valor del Inventario:* Suma de (Cantidad disponible por lote × Costo de adquisición de ese lote).
  * *Patrimonio Total:* (Valor del Inventario + Efectivo + Activos Fijos) - (Deudas por Pagar).

## 3. Modelo de Datos Definido (Entidades Principales)

* Productos / Categorias / Presentaciones (Catálogo y conversión matemática).
* Lotes_Inventario (Stock físico con costo real y fechas).
* Cajas_Turnos (Gaveta diaria).
* Ventas / Detalle_Ventas / Detalle_Venta_Lotes (El puente transaccional que une la venta con el lote específico).
* Ajustes_Inventario (Mermas).
* Compras_Inventario / Cuentas_Por_Pagar.
* Movimientos_Financieros / Categorias_Gastos / Activos_Fijos.
