import { convertirLineaCompra, redondearA } from './conversion';

describe('convertirLineaCompra', () => {
  it('2 cajas de 24 por $40 → 48 unidades a $0.8333', () => {
    const r = convertirLineaCompra(2, 24, 40);
    expect(r).toEqual({
      cantidadBase: 48,
      costoUnitario: 0.8333,
      totalGuardado: 40,
      diferencia: 0,
    });
  });

  it('busca el costo vecino que reproduce el total al centavo', () => {
    // 0.8333 × 48 = 39.9984 → 40.00 ya cuadra; 7 unidades por $10 no:
    // 10 / 7 = 1.4286 → 7 × 1.4286 = 10.0002 → 10.00
    const r = convertirLineaCompra(7, 1, 10)!;
    expect(r.totalGuardado).toBe(10);
    expect(r.diferencia).toBe(0);
  });

  it('acepta fracciones (media libra) con hasta 3 decimales', () => {
    const r = convertirLineaCompra(0.5, 1, 2)!;
    expect(r.cantidadBase).toBe(0.5);
    expect(r.costoUnitario).toBe(4);
  });

  it('factor decimal: 3 bolsas de 0.5 lb por $9', () => {
    const r = convertirLineaCompra(3, 0.5, 9)!;
    expect(r.cantidadBase).toBe(1.5);
    expect(r.costoUnitario).toBe(6);
    expect(r.totalGuardado).toBe(9);
  });

  it.each([
    [0, 1, 10],
    [1, 0, 10],
    [1, 1, 0],
    [-1, 1, 10],
    [1, 1, -5],
  ])('devuelve null con datos no válidos (%s, %s, %s)', (c, f, t) => {
    expect(convertirLineaCompra(c, f, t)).toBeNull();
  });

  it('cantidades enormes con total chico no cuadran: queda la diferencia', () => {
    const r = convertirLineaCompra(99999, 99999, 0.01)!;
    expect(r.diferencia).not.toBe(0);
  });
});

describe('redondearA', () => {
  it('half-up sin ruido de coma flotante', () => {
    expect(redondearA(1.005, 2)).toBe(1.01);
    expect(redondearA(0.83333333, 4)).toBe(0.8333);
  });
});
