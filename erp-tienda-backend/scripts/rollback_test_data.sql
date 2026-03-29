-- Limpieza de toda la data de prueba en base a IDs 99000+
-- (El orden de delete respeta las foreign keys)

BEGIN;

DELETE FROM detalle_venta_lotes WHERE id >= 99000;
DELETE FROM detalle_ventas WHERE id >= 99000;
DELETE FROM lotes_inventario WHERE id >= 99000;
DELETE FROM cuentas_por_pagar WHERE id >= 99000;
DELETE FROM compras_inventario WHERE id >= 99000;
DELETE FROM presentaciones WHERE id >= 99000;
DELETE FROM productos WHERE id >= 99000;
DELETE FROM categorias WHERE id >= 99000;

DELETE FROM ventas WHERE id >= 99000;
DELETE FROM caja_general WHERE id >= 99000;
DELETE FROM movimientos_financieros WHERE id >= 99000;
DELETE FROM cajas_turnos WHERE id >= 99000;
DELETE FROM categorias_gastos WHERE id >= 99000;
DELETE FROM usuarios WHERE id >= 99000;

COMMIT;
