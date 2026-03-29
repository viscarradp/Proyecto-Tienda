-- Auditoría ERP - Script de Generación de Datos
-- Este script insertará datos de prueba simulando escenarios financieros completos.
-- Utiliza IDs en el rango 99000+ para poder limpiar posteriormente estos registros con el script rollback.

BEGIN;

-- 1. Base Structure (Catálogos, Empleados, Gastos)
INSERT INTO usuarios (id, nombre, rol, password_hash, created_at)
VALUES (99001, 'AUDITOR_TEST', 'ADMIN', 'fake_hash', NOW());

INSERT INTO categorias (id, nombre)
VALUES (99001, 'CAT_TEST_AUDIT');

INSERT INTO productos (id, nombre, categoria_id, created_at)
VALUES (99001, 'PROD_TEST_FINANZAS', 99001, NOW());

INSERT INTO presentaciones (id, producto_id, codigo_barras, descripcion, factor_conversion, precio_venta)
VALUES (99001, 99001, 'AUDIT999', 'Caja x10 Test', 1, 15.00);

-- 2. Inventario Base (Para poder vender)
INSERT INTO compras_inventario (id, proveedor, monto_total, estado_pago, origen_fondos, fecha)
VALUES (99001, 'PROV_TEST_AUDIT', 100.00, 'PAGADO', 'CAJA_GENERAL', NOW());

INSERT INTO lotes_inventario (id, producto_id, compra_id, costo_unitario_adquisicion, cantidad_inicial, cantidad_disponible, fecha_ingreso)
VALUES (99001, 99001, 99001, 1.00, 1000, 1000, NOW());

-- 3. Categorías de Gastos
INSERT INTO categorias_gastos (id, nombre, tipo)
VALUES (99001, 'GASTO_TEST_OPERACION', 'EGRESO');


-- TURNO 1: Operación Perfecta (Ingresos = 30.00, Efectivo Esperado = 130.00, Diferencia = 0)
INSERT INTO cajas_turnos (id, fondo_inicial, estado, efectivo_esperado, efectivo_declarado, diferencia, fecha_apertura, fecha_cierre)
VALUES (99001, 100.00, 'CERRADA', 130.00, 130.00, 0.00, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day 23 hours');

INSERT INTO ventas (id, caja_turno_id, total, fecha)
VALUES (99001, 99001, 30.00, NOW() - INTERVAL '1 day 23 hours 30 mins');

INSERT INTO detalle_ventas (id, venta_id, presentacion_id, cantidad, subtotal)
VALUES (99001, 99001, 99001, 2, 30.00);

INSERT INTO detalle_venta_lotes (id, detalle_venta_id, lote_id, cantidad_descargada, costo_aplicado)
VALUES (99001, 99001, 99001, 2, 1.00);


-- TURNO 2: Descuadre en Caja por Faltante (Ingresos = 60.00, Esperado = 110.00, Declarado = 100.00, Diferencia = -10.00)
INSERT INTO cajas_turnos (id, fondo_inicial, estado, efectivo_esperado, efectivo_declarado, diferencia, fecha_apertura, fecha_cierre)
VALUES (99002, 50.00, 'CERRADA', 110.00, 100.00, -10.00, NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours');

INSERT INTO ventas (id, caja_turno_id, total, fecha)
VALUES (99002, 99002, 60.00, NOW() - INTERVAL '23 hours 30 mins');

INSERT INTO detalle_ventas (id, venta_id, presentacion_id, cantidad, subtotal)
VALUES (99002, 99002, 99001, 4, 60.00);

INSERT INTO detalle_venta_lotes (id, detalle_venta_id, lote_id, cantidad_descargada, costo_aplicado)
VALUES (99002, 99002, 99001, 4, 1.00);


-- TURNO 3: Gastos/Egresos dentro de un Turno Activo (Ingresos = 15.00, Egreso = 5.00, Esperado = 60.00, Diferencia = 0)
INSERT INTO cajas_turnos (id, fondo_inicial, estado, efectivo_esperado, efectivo_declarado, diferencia, fecha_apertura, fecha_cierre)
VALUES (99003, 50.00, 'CERRADA', 60.00, 60.00, 0.00, NOW() - INTERVAL '12 hours', NOW() - INTERVAL '11 hours');

INSERT INTO ventas (id, caja_turno_id, total, fecha)
VALUES (99003, 99003, 15.00, NOW() - INTERVAL '11 hours 45 mins');

INSERT INTO detalle_ventas (id, venta_id, presentacion_id, cantidad, subtotal)
VALUES (99003, 99003, 99001, 1, 15.00);

INSERT INTO detalle_venta_lotes (id, detalle_venta_id, lote_id, cantidad_descargada, costo_aplicado)
VALUES (99003, 99003, 99001, 1, 1.00);

-- Movimiento asociado al turno 3 (Retiro de dinero para un gasto)
INSERT INTO movimientos_financieros (id, caja_turno_id, tipo_movimiento, monto, categoria_gasto_id, descripcion, fecha)
VALUES (99001, 99003, 'EGRESO', 5.00, 99001, 'GASTO_TURNO_AUDIT', NOW() - INTERVAL '11 hours 30 mins');


-- GASTO EXTERNO (Fuera de turno, afecta directamente Caja General)
INSERT INTO movimientos_financieros (id, caja_turno_id, tipo_movimiento, monto, categoria_gasto_id, descripcion, fecha)
VALUES (99002, NULL, 'EGRESO', 150.00, 99001, 'GASTO_GENERAL_AUDIT', NOW() - INTERVAL '1 hour');

INSERT INTO caja_general (id, movimiento_origen_id, monto, descripcion, fecha)
VALUES (99001, 99002, -150.00, 'GASTO_GENERAL_AUDIT', NOW() - INTERVAL '1 hour');

COMMIT;
