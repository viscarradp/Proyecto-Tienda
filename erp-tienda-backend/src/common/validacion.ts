import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

/**
 * Límites compartidos de los DTOs. Los topes caben en las columnas del schema
 * (Decimal(10,2) para dinero, Decimal(12,3) para cantidades) con margen: un
 * número enorme debe dar 400, no un 500 por desbordamiento en la base.
 */
export const MAX_DINERO = 999999.99;
export const MAX_CANTIDAD = 99999;
export const MAX_FACTOR_CONVERSION = 99999;

interface OpcionesNumero {
  /** Mínimo permitido. */
  min?: number;
  /** Mensaje para el mínimo. */
  mensajeMin?: string;
  /** Decimales máximos (default 2 para dinero). */
  decimales?: number;
}

/** Monto de dinero: ≤ 2 decimales y ≤ $999,999.99. */
export function IsDinero(opciones: OpcionesNumero = {}) {
  const { min = 0, mensajeMin, decimales = 2 } = opciones;
  return applyDecorators(
    IsNumber(
      { maxDecimalPlaces: decimales },
      { message: `Debe ser un número con máximo ${decimales} decimales` },
    ),
    Min(min, mensajeMin ? { message: mensajeMin } : undefined),
    Max(MAX_DINERO, {
      message: `El monto no puede superar ${MAX_DINERO.toFixed(2)}`,
    }),
  );
}

/** Cantidad (unidades o fracciones): ≤ 3 decimales y ≤ 99,999. */
export function IsCantidad(opciones: OpcionesNumero = {}) {
  const { min = 0.001, mensajeMin } = opciones;
  return applyDecorators(
    IsNumber(
      { maxDecimalPlaces: 3 },
      { message: 'La cantidad debe tener máximo 3 decimales' },
    ),
    Min(min, mensajeMin ? { message: mensajeMin } : undefined),
    Max(MAX_CANTIDAD, {
      message: `La cantidad no puede superar ${MAX_CANTIDAD}`,
    }),
  );
}

/** Texto opcional: recorta espacios y, si queda vacío, lo vuelve null. */
export function VaciarANull() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const recortado = value.trim();
    return recortado === '' ? null : recortado;
  });
}
