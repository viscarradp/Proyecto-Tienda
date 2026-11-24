import { Prisma } from '@prisma/client';
import { redondearCantidad } from './pendientes-stock';

describe('redondearCantidad', () => {
  it('redondea a 3 decimales, mitad hacia arriba', () => {
    expect(redondearCantidad(new Prisma.Decimal(1).div(3.5)).toString()).toBe(
      '0.286',
    );
    expect(redondearCantidad('0.0005').toString()).toBe('0.001');
    expect(redondearCantidad('0.0004').toString()).toBe('0');
    expect(redondearCantidad('2').toString()).toBe('2');
  });
});
