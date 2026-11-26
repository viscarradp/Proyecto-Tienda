import { Borrador } from './borrador';
import { Catalogo } from './catalogo';
import {
  convertirLotes,
  evaluarBorrador,
  preguntaUnidades,
  quitarPaqueteRedundante,
  respuestaBorrador,
} from './resumen';

const catalogo = new Catalogo([
  {
    id: 1,
    productoId: 10,
    producto: 'Coca-Cola',
    descripcion: 'Unidad',
    factor: 1,
    precio: 1,
    codigo: null,
  },
  {
    id: 2,
    productoId: 20,
    producto: 'Frijol',
    descripcion: 'Libra',
    factor: 1,
    precio: 1,
    codigo: null,
  },
]);

function borrador(lineas: Borrador['lineas']): Borrador {
  return {
    proveedor: 'La Fuente',
    origen_pago: 'BOVEDA',
    lineas,
    productos_nuevos: [],
    total_factura: null,
    preguntas: [],
  };
}

const linea = (extra: Partial<Borrador['lineas'][number]>) => ({
  texto_original: 'coca',
  presentacion_id: 1,
  cantidad: 2,
  paquete: null,
  total_linea: 40,
  precio_unitario: null,
  confianza: 'alta' as const,
  ...extra,
});

describe('guardia contra la doble multiplicación', () => {
  const cat = new Catalogo([
    {
      id: 5,
      productoId: 50,
      producto: 'Coca',
      descripcion: 'Caja de 24',
      factor: 24,
      precio: 20,
      codigo: null,
    },
    ...[1].map(() => ({
      id: 6,
      productoId: 50,
      producto: 'Coca',
      descripcion: 'Unidad',
      factor: 1,
      precio: 1,
      codigo: null,
    })),
  ]);

  it('quita el paquete si la presentación elegida ya es ese paquete', () => {
    const l = linea({
      presentacion_id: 5,
      paquete: { descripcion: 'Caja', unidades: 24 },
    });
    const [r] = quitarPaqueteRedundante([l], cat);
    expect(r.paquete).toBeNull();
    const b = borrador([r]);
    const lotes = convertirLotes(b, cat)!;
    expect(lotes[0].conversion.cantidadBase).toBe(48);
  });

  it('deja el paquete si la presentación es la unidad (factor 1)', () => {
    const l = linea({
      presentacion_id: 6,
      paquete: { descripcion: 'Unidad', unidades: 24 },
    });
    expect(quitarPaqueteRedundante([l], cat)[0].paquete).not.toBeNull();
    const m = linea({
      presentacion_id: 6,
      paquete: { descripcion: 'Caja', unidades: 24 },
    });
    expect(quitarPaqueteRedundante([m], cat)[0].paquete).not.toBeNull();
  });
});

describe('plural en la pregunta', () => {
  it('quita la tilde de galón/jamón', () => {
    expect(preguntaUnidades('Caja', 'Galón', 'Aceite')).toBe(
      '¿Cuántas galones trae cada caja de Aceite?',
    );
    expect(preguntaUnidades('Caja', 'Jamón', 'X')).toContain('jamones');
    expect(preguntaUnidades('Caja', 'Libra', 'X')).toContain('libras');
  });
});

describe('paquete en el resumen', () => {
  it('muestra el paquete y convierte a unidad base', () => {
    const b = borrador([
      linea({ paquete: { descripcion: 'Caja', unidades: 24 } }),
    ]);
    const ev = evaluarBorrador(b, catalogo);
    expect(ev.completo).toBe(true);
    expect(ev.lineas[0]).toBe(
      '1. 2 Caja (24 Unidad c/u) de Coca-Cola por $40.00 → 48 unidades a $0.8333',
    );
    const lotes = convertirLotes(b, catalogo)!;
    expect(lotes[0].conversion.cantidadBase).toBe(48);
    expect(lotes[0].conversion.costoUnitario).toBe(0.8333);
  });

  it('sin cuántas trae: pregunta y no ofrece guardar', () => {
    const b = borrador([
      linea({ paquete: { descripcion: 'Caja', unidades: null } }),
    ]);
    const ev = evaluarBorrador(b, catalogo);
    expect(ev.completo).toBe(false);
    expect(ev.faltantes).toContain(
      '¿Cuántas unidades trae cada caja de Coca-Cola?',
    );
    expect(convertirLotes(b, catalogo)).toBeNull();
    const r = respuestaBorrador(b, catalogo);
    expect((r.botones ?? []).flat().map((x) => x.datos)).not.toContain(
      'guardar',
    );
  });

  it('usa la descripción de la presentación si no es "Unidad"', () => {
    const b = borrador([
      linea({
        presentacion_id: 2,
        texto_original: 'frijol',
        paquete: { descripcion: 'Quintal', unidades: null },
      }),
    ]);
    expect(evaluarBorrador(b, catalogo).faltantes).toContain(
      '¿Cuántas libras trae cada quintal de Frijol?',
    );
    expect(preguntaUnidades('Caja de 24', null, 'X')).toBe(
      '¿Cuántas unidades trae cada caja de 24 de X?',
    );
  });

  it('un borrador viejo sin "paquete" se evalúa igual que antes', () => {
    const vieja = linea({});
    delete (vieja as { paquete?: unknown }).paquete;
    const ev = evaluarBorrador(borrador([vieja]), catalogo);
    expect(ev.completo).toBe(true);
    expect(ev.lineas[0]).toContain('→ 2 unidades a $20.0000');
  });

  it('producto nuevo sin factor: pregunta cuántas trae', () => {
    const b = borrador([]);
    b.productos_nuevos = [
      {
        texto_original: 'galletas',
        nombre: 'Galletas',
        descripcion_presentacion: 'Caja',
        factor: null,
        unidad_venta: null,
        cantidad: 2,
        total_linea: 24,
        precio_venta: 0.5,
      },
    ];
    const ev = evaluarBorrador(b, catalogo);
    expect(ev.completo).toBe(false);
    expect(ev.faltantes).toContain(
      '¿Cuántas unidades trae cada caja de Galletas?',
    );
  });
});
