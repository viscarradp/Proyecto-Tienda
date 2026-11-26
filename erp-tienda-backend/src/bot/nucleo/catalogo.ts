import { PrismaService } from '../../prisma/prisma.service';
import { CatalogoIds } from './borrador';

export interface PresentacionCat {
  id: number;
  productoId: number;
  producto: string;
  descripcion: string;
  factor: number;
  precio: number;
  codigo: string | null;
}

/** Catálogo activo (productos y presentaciones) tal como lo ve el modelo. */
export class Catalogo implements CatalogoIds {
  readonly porId = new Map<number, PresentacionCat>();

  constructor(presentaciones: PresentacionCat[]) {
    for (const p of presentaciones) this.porId.set(p.id, p);
  }

  tienePresentacion(id: number): boolean {
    return this.porId.has(id);
  }

  /** Texto compacto para el prompt: una línea por producto. */
  paraPrompt(): string {
    const porProducto = new Map<number, PresentacionCat[]>();
    for (const p of this.porId.values()) {
      const lista = porProducto.get(p.productoId) ?? [];
      lista.push(p);
      porProducto.set(p.productoId, lista);
    }
    if (porProducto.size === 0) return '(catálogo vacío)';
    return [...porProducto.values()]
      .map((lista) => {
        const pres = lista
          .map(
            (p) =>
              `[${p.id} "${p.descripcion}" x${p.factor} $${p.precio.toFixed(2)}${
                p.codigo ? ` cb:${p.codigo}` : ''
              }]`,
          )
          .join(' ');
        return `${lista[0].producto}: ${pres}`;
      })
      .join('\n');
  }
}

export async function cargarCatalogo(prisma: PrismaService): Promise<Catalogo> {
  const productos = await prisma.productos.findMany({
    where: { activo: true },
    include: { presentaciones: true },
    orderBy: { id: 'asc' },
  });
  const lista: PresentacionCat[] = [];
  for (const prod of productos) {
    for (const p of prod.presentaciones) {
      lista.push({
        id: p.id,
        productoId: prod.id,
        producto: prod.nombre,
        descripcion: p.descripcion,
        factor: Number(p.factor_conversion),
        precio: Number(p.precio_venta),
        codigo: p.codigo_barras,
      });
    }
  }
  return new Catalogo(lista);
}
