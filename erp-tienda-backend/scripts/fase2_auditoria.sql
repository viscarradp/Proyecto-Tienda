-- Auditoría ERP - Script de Validación y Queries Financieras
-- Estas consultas verificarán la integridad de las operaciones contables del negocio.

-- 1. Auditoría de Flujo por Turno (Dinero Esperado Físicamente frente a Desglose Operativo)
-- Comprueba si el "efectivo_esperado" en el registro del turno coincide con las matemáticas reales.
SELECT 
    ct.id as turno_id,
    ct.fecha_apertura,
    ct.fondo_inicial,
    COALESCE(SUM(v.total), 0) as total_ventas,
    COALESCE(
        (SELECT SUM(monto) FROM movimientos_financieros WHERE caja_turno_id = ct.id AND tipo_movimiento = 'INGRESO')
    , 0) as otros_ingresos,
    COALESCE(
        (SELECT SUM(monto) FROM movimientos_financieros WHERE caja_turno_id = ct.id AND tipo_movimiento = 'EGRESO')
    , 0) as total_egresos,
    (
        ct.fondo_inicial 
        + COALESCE(SUM(v.total), 0)
        + COALESCE((SELECT SUM(monto) FROM movimientos_financieros WHERE caja_turno_id = ct.id AND tipo_movimiento = 'INGRESO'), 0)
        - COALESCE((SELECT SUM(monto) FROM movimientos_financieros WHERE caja_turno_id = ct.id AND tipo_movimiento = 'EGRESO'), 0)
    ) as calculo_esperado_real,
    ct.efectivo_esperado as efectivo_esperado_sistema,
    CASE 
        WHEN (ct.fondo_inicial + COALESCE(SUM(v.total), 0) + COALESCE((SELECT SUM(monto) FROM movimientos_financieros WHERE caja_turno_id = ct.id AND tipo_movimiento = 'INGRESO'), 0) - COALESCE((SELECT SUM(monto) FROM movimientos_financieros WHERE caja_turno_id = ct.id AND tipo_movimiento = 'EGRESO'), 0)) = ct.efectivo_esperado 
        THEN 'CORRECTO' ELSE 'DESCUADRE MATEMÁTICO' 
    END AS integridad_esperado
FROM cajas_turnos ct
LEFT JOIN ventas v ON v.caja_turno_id = ct.id
WHERE ct.id >= 99000
GROUP BY ct.id, ct.fecha_apertura, ct.fondo_inicial, ct.efectivo_esperado
ORDER BY ct.id;

-- 2. Validación de Descuadre Reportado contra Operación (Declarado vs Esperado)
-- Esto evalúa si el usuario final reportó bien el faltante o sobrante de caja.
SELECT 
    id as turno_id,
    efectivo_esperado,
    efectivo_declarado,
    diferencia as diferencia_almacenada,
    (efectivo_declarado - efectivo_esperado) as diferencia_calculada,
    CASE 
        WHEN diferencia = (efectivo_declarado - efectivo_esperado) 
        THEN 'CORRECTO' ELSE 'ERROR DE CALCULO EN CIERRE' 
    END as integridad_descuadre
FROM cajas_turnos
WHERE id >= 99000;

-- 3. Auditoría de Totales de Facturación vs Detalles
-- Averigua si hay transacciones "huérfanas" o sumas incorrectas en ventas.
SELECT 
    v.id as venta_id,
    v.total as total_venta_cabecera,
    COALESCE(SUM(dv.subtotal), 0) as suma_detalles,
    CASE 
        WHEN v.total = COALESCE(SUM(dv.subtotal), 0) 
        THEN 'CORRECTO' ELSE 'DESCUADRE EN FACTURACIÓN' 
    END as integridad_factura
FROM ventas v
LEFT JOIN detalle_ventas dv ON dv.venta_id = v.id
WHERE v.id >= 99000
GROUP BY v.id, v.total;

-- 4. Impacto directo en Caja General (Gastos / Ingresos Desligados)
-- Compara el monto en el registro financiero maestro con el registro de movimiento.
SELECT 
    cg.id as caja_general_id,
    cg.monto as monto_caja_general,
    mf.monto as monto_movimiento_origen,
    mf.tipo_movimiento,
    CASE WHEN (mf.tipo_movimiento = 'EGRESO' AND cg.monto = -mf.monto) OR (mf.tipo_movimiento = 'INGRESO' AND cg.monto = mf.monto)
    THEN 'CORRECTO' ELSE 'ERROR DE SIGNO EN CAJA GENERAL' 
    END as integridad_caja_general
FROM caja_general cg
JOIN movimientos_financieros mf ON mf.id = cg.movimiento_origen_id
WHERE cg.id >= 99000;
