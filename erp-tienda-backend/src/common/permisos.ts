import { ForbiddenException } from '@nestjs/common';

/** Mensaje único para todo 403 por rol (D-06: "la cajera opera, la dueña controla"). */
export const MENSAJE_SOLO_DUENA = 'Esto lo hace la dueña (administradora).';

/**
 * Permisos de `POST /movimientos-financieros` según D-06. Un `@Roles` de clase
 * no alcanza: el mismo endpoint sirve a ambos roles y lo que se permite
 * depende del tipo de movimiento y del origen de los fondos.
 *
 * CAJERO: egreso desde la gaveta y guardar en la bóveda (RETIRO_BOVEDA).
 * Solo ADMIN: retiro personal, aporte de capital, traer de la bóveda y todo
 * egreso pagado desde la bóveda.
 */
export function exigirPermisoMovimiento(
  rol: string | undefined,
  tipo_movimiento: string,
  origen_fondos?: string,
): void {
  if (rol === 'ADMIN') return;
  const esEgresoDeGaveta =
    tipo_movimiento === 'EGRESO_OPERATIVO' &&
    (origen_fondos ?? 'GAVETA') === 'GAVETA';
  if (esEgresoDeGaveta || tipo_movimiento === 'RETIRO_BOVEDA') return;
  throw new ForbiddenException(MENSAJE_SOLO_DUENA);
}
