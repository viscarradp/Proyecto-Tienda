import { extraerJson, validarSalidaModelo } from './borrador';
import { normalizarTexto } from './alias.service';
import { unirBorradores } from './bot-nucleo.service';

const catalogo = { tienePresentacion: (id: number) => [1, 2, 3].includes(id) };

function salida(parcial: Record<string, unknown> = {}): string {
  return JSON.stringify({
    proveedor: 'La Fuente',
    origen_pago: 'GAVETA',
    lineas: [
      {
        texto_original: 'coca de lata',
        presentacion_id: 2,
        cantidad: 2,
        total_linea: 40,
        precio_unitario: null,
        confianza: 'alta',
      },
    ],
    productos_nuevos: [],
    total_factura: null,
    preguntas: [],
    ...parcial,
  });
}

describe('validarSalidaModelo', () => {
  it('acepta una salida correcta', () => {
    const r = validarSalidaModelo(salida(), catalogo);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.borrador.proveedor).toBe('La Fuente');
      expect(r.borrador.lineas[0].presentacion_id).toBe(2);
    }
  });

  it('tolera cercas de markdown y texto alrededor', () => {
    const r = validarSalidaModelo(
      'Aquí va:\n```json\n' + salida() + '\n```',
      catalogo,
    );
    expect(r.ok).toBe(true);
    expect(() => extraerJson('sin json')).toThrow();
  });

  it('presentacion_id que no existe → línea "no encontrada" con advertencia', () => {
    const r = validarSalidaModelo(
      salida({
        lineas: [
          {
            texto_original: 'x',
            presentacion_id: 999,
            cantidad: 1,
            total_linea: 5,
          },
        ],
      }),
      catalogo,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.borrador.lineas[0].presentacion_id).toBeNull();
      expect(r.borrador.lineas[0].confianza).toBe('baja');
      expect(r.advertencias).toHaveLength(1);
    }
  });

  it('total_linea = precio_unitario × cantidad cuando solo viene el precio', () => {
    const r = validarSalidaModelo(
      salida({
        lineas: [
          {
            texto_original: 'frijol',
            presentacion_id: 1,
            cantidad: 10,
            total_linea: null,
            precio_unitario: 0.8,
            confianza: 'media',
          },
        ],
      }),
      catalogo,
    );
    expect(r.ok && r.borrador.lineas[0].total_linea).toBe(8);
  });

  it.each([
    [
      'cantidad 0',
      { lineas: [{ texto_original: 'a', presentacion_id: 1, cantidad: 0 }] },
    ],
    [
      'cantidad negativa',
      { lineas: [{ texto_original: 'a', presentacion_id: 1, cantidad: -2 }] },
    ],
    [
      'cantidad en texto',
      { lineas: [{ texto_original: 'a', presentacion_id: 1, cantidad: '2' }] },
    ],
    [
      'total negativo',
      {
        lineas: [
          {
            texto_original: 'a',
            presentacion_id: 1,
            cantidad: 1,
            total_linea: -1,
          },
        ],
      },
    ],
    ['origen inválido', { origen_pago: 'BANCO' }],
    ['lineas no es arreglo', { lineas: 'dos cajas' }],
    ['producto nuevo sin nombre', { productos_nuevos: [{ cantidad: 1 }] }],
    ['preguntas no son texto', { preguntas: [1] }],
  ])('rechaza: %s', (_n, parcial) => {
    const r = validarSalidaModelo(salida(parcial), catalogo);
    expect(r.ok).toBe(false);
  });

  it('rechaza JSON roto', () => {
    expect(validarSalidaModelo('{"proveedor":', catalogo).ok).toBe(false);
  });

  it('producto nuevo: factor 1 y "Unidad" por defecto', () => {
    const r = validarSalidaModelo(
      salida({
        lineas: [],
        productos_nuevos: [{ nombre: 'Galletas', cantidad: 3 }],
      }),
      catalogo,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.borrador.productos_nuevos[0]).toMatchObject({
        nombre: 'Galletas',
        factor: 1,
        descripcion_presentacion: 'Unidad',
        precio_venta: null,
      });
    }
  });
});

describe('validarSalidaModelo: paquete y producto nuevo', () => {
  const linea = (extra: Record<string, unknown>) =>
    salida({
      lineas: [
        {
          texto_original: 'aceite',
          presentacion_id: 1,
          cantidad: 2,
          total_linea: 40,
          ...extra,
        },
      ],
    });

  it('un borrador guardado sin "paquete" sigue siendo válido (queda null)', () => {
    const r = validarSalidaModelo(linea({}), catalogo);
    expect(r.ok && r.borrador.lineas[0].paquete).toBeNull();
  });

  it('acepta paquete con unidades, con null y redondea a 3 decimales', () => {
    const a = validarSalidaModelo(
      linea({ paquete: { descripcion: ' Caja ', unidades: 24 } }),
      catalogo,
    );
    expect(a.ok && a.borrador.lineas[0].paquete).toEqual({
      descripcion: 'Caja',
      unidades: 24,
    });
    const b = validarSalidaModelo(
      linea({ paquete: { descripcion: 'Caja', unidades: null } }),
      catalogo,
    );
    expect(b.ok && b.borrador.lineas[0].paquete?.unidades).toBeNull();
    const c = validarSalidaModelo(
      linea({ paquete: { descripcion: 'Caja', unidades: 12.34567 } }),
      catalogo,
    );
    expect(c.ok && c.borrador.lineas[0].paquete?.unidades).toBe(12.346);
    const d = validarSalidaModelo(linea({ paquete: null }), catalogo);
    expect(d.ok && d.borrador.lineas[0].paquete).toBeNull();
  });

  it('el límite de unidades es 10000 y de la descripción 50 caracteres', () => {
    const ok = validarSalidaModelo(
      linea({ paquete: { descripcion: 'x'.repeat(50), unidades: 10000 } }),
      catalogo,
    );
    expect(ok.ok).toBe(true);
  });

  it.each([
    ['unidades 0', { descripcion: 'Caja', unidades: 0 }],
    ['unidades negativas', { descripcion: 'Caja', unidades: -1 }],
    ['unidades 10001', { descripcion: 'Caja', unidades: 10001 }],
    ['unidades en texto', { descripcion: 'Caja', unidades: '24' }],
    ['descripción vacía', { descripcion: '  ', unidades: 2 }],
    ['sin descripción', { unidades: 2 }],
    ['descripción de 51', { descripcion: 'x'.repeat(51), unidades: 2 }],
    ['paquete en texto', 'caja'],
  ])('rechaza paquete: %s', (_n, paquete) => {
    expect(validarSalidaModelo(linea({ paquete }), catalogo).ok).toBe(false);
  });

  it('producto nuevo: factor null (no dijo cuántas trae) y unidad_venta', () => {
    const r = validarSalidaModelo(
      salida({
        lineas: [],
        productos_nuevos: [
          {
            nombre: 'Galletas',
            cantidad: 2,
            descripcion_presentacion: 'Caja',
            factor: null,
            unidad_venta: 'Libra',
          },
        ],
      }),
      catalogo,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.borrador.productos_nuevos[0].factor).toBeNull();
      expect(r.borrador.productos_nuevos[0].unidad_venta).toBe('Libra');
    }
  });

  it('producto nuevo: unidad_venta ausente → null', () => {
    const r = validarSalidaModelo(
      salida({
        lineas: [],
        productos_nuevos: [{ nombre: 'Galletas', cantidad: 2, factor: 12 }],
      }),
      catalogo,
    );
    expect(r.ok && r.borrador.productos_nuevos[0].unidad_venta).toBeNull();
  });
});

describe('normalizarTexto', () => {
  it('minúsculas, sin tildes, espacios simples', () => {
    expect(normalizarTexto('  Coca   de LATA ')).toBe('coca de lata');
    expect(normalizarTexto('Frijol Rojo Piñata')).toBe('frijol rojo pinata');
  });
});

describe('unirBorradores', () => {
  const base = validarSalidaModelo(salida(), catalogo);
  const b = base.ok ? base.borrador : (null as never);

  it('sin borrador previo, queda el nuevo', () => {
    expect(unirBorradores(null, b)).toBe(b);
  });

  it('conserva proveedor y pago si el nuevo viene en null, y las líneas si no trae', () => {
    const solo = { ...b, proveedor: null, origen_pago: null, lineas: [] };
    const u = unirBorradores(b, solo);
    expect(u.proveedor).toBe('La Fuente');
    expect(u.origen_pago).toBe('GAVETA');
    expect(u.lineas).toHaveLength(1);
  });
});
