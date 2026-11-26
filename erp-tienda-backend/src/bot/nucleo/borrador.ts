import { redondearA } from './conversion';

export type OrigenPago = 'GAVETA' | 'BOVEDA' | 'CREDITO' | 'CAPITAL';
export const ORIGENES_PAGO: readonly OrigenPago[] = [
  'GAVETA',
  'BOVEDA',
  'CREDITO',
  'CAPITAL',
];
export type Confianza = 'alta' | 'media' | 'baja';

/**
 * Lo que ella compró cuando NO es una presentación del catálogo ("Caja" de 24
 * unidades de la presentación elegida). `unidades` = cuántas de la presentación
 * elegida trae un paquete; null = no lo dijo (el sistema pregunta).
 */
export interface PaqueteBorrador {
  descripcion: string;
  unidades: number | null;
}

export interface LineaBorrador {
  texto_original: string;
  /** null = no se encontró en el catálogo. */
  presentacion_id: number | null;
  /** Por lo que ella nombró ("2" cajas): de la presentación, o del paquete si lo hay. */
  cantidad: number;
  /** Ausente en borradores viejos: equivale a null. */
  paquete: PaqueteBorrador | null;
  total_linea: number | null;
  precio_unitario: number | null;
  confianza: Confianza;
}

export interface ProductoNuevoBorrador {
  texto_original: string;
  nombre: string;
  descripcion_presentacion: string;
  /** Cuántas unidades sueltas trae lo comprado. null = no lo dijo (el sistema pregunta). */
  factor: number | null;
  /** Cómo se vende suelto ("Unidad", "Libra"). null = "Unidad". */
  unidad_venta: string | null;
  cantidad: number;
  total_linea: number | null;
  /** Precio de venta de la unidad suelta (la presentación de factor 1). */
  precio_venta: number | null;
}

export interface Borrador {
  proveedor: string | null;
  origen_pago: OrigenPago | null;
  lineas: LineaBorrador[];
  productos_nuevos: ProductoNuevoBorrador[];
  total_factura: number | null;
  preguntas: string[];
}

/** Lo que el validador necesita saber del catálogo. */
export interface CatalogoIds {
  tienePresentacion(id: number): boolean;
}

export type ResultadoValidacion =
  | { ok: true; borrador: Borrador; advertencias: string[] }
  | { ok: false; error: string };

const MAX_DINERO = 999999.99;
const MAX_CANTIDAD = 99999;
const MAX_UNIDADES_PAQUETE = 10000;

type Obj = Record<string, unknown>;

function esObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Saca el objeto JSON de la respuesta (tolera ```json ... ``` y texto alrededor). */
export function extraerJson(crudo: string): unknown {
  let t = crudo.trim();
  const cerca = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (cerca) t = cerca[1].trim();
  const ini = t.indexOf('{');
  const fin = t.lastIndexOf('}');
  if (ini === -1 || fin <= ini) throw new Error('No hay un objeto JSON');
  return JSON.parse(t.slice(ini, fin + 1));
}

function texto(
  v: unknown,
  campo: string,
  max: number,
  obligatorio: boolean,
): string | null {
  if (v === null || v === undefined) {
    if (obligatorio) throw new Error(`${campo} es obligatorio`);
    return null;
  }
  if (typeof v !== 'string') throw new Error(`${campo} debe ser texto`);
  const t = v.trim();
  if (t === '') {
    if (obligatorio) throw new Error(`${campo} no puede estar vacío`);
    return null;
  }
  if (t.length > max) throw new Error(`${campo} pasa de ${max} caracteres`);
  return t;
}

function numero(
  v: unknown,
  campo: string,
  opts: { max: number; obligatorio: boolean; decimales?: number },
): number | null {
  if (v === null || v === undefined) {
    if (opts.obligatorio) throw new Error(`${campo} es obligatorio`);
    return null;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${campo} debe ser un número`);
  }
  if (!(v > 0)) throw new Error(`${campo} debe ser mayor a 0`);
  if (v > opts.max) throw new Error(`${campo} no puede pasar de ${opts.max}`);
  return redondearA(v, opts.decimales ?? 2);
}

/**
 * Valida con tipos estrictos la salida del modelo. Un error de forma devuelve
 * `ok: false` (el servicio reintenta una vez con ese mensaje). Una
 * presentación que no existe en el catálogo NO es error: la línea queda "no
 * encontrada" (presentacion_id null) con una advertencia.
 */
export function validarSalidaModelo(
  crudo: string,
  catalogo: CatalogoIds,
): ResultadoValidacion {
  const advertencias: string[] = [];
  try {
    const raiz = extraerJson(crudo);
    if (!esObj(raiz)) throw new Error('La respuesta debe ser un objeto JSON');

    const proveedor = texto(raiz.proveedor, 'proveedor', 150, false);

    let origen: OrigenPago | null = null;
    if (raiz.origen_pago !== null && raiz.origen_pago !== undefined) {
      if (
        typeof raiz.origen_pago !== 'string' ||
        !ORIGENES_PAGO.includes(raiz.origen_pago as OrigenPago)
      ) {
        throw new Error(
          'origen_pago debe ser GAVETA, BOVEDA, CREDITO, CAPITAL o null',
        );
      }
      origen = raiz.origen_pago as OrigenPago;
    }

    const lineasCrudas = raiz.lineas ?? [];
    if (!Array.isArray(lineasCrudas))
      throw new Error('lineas debe ser un arreglo');
    const lineas: LineaBorrador[] = lineasCrudas.map((l, i) => {
      const c = `lineas[${i}]`;
      if (!esObj(l)) throw new Error(`${c} debe ser un objeto`);
      const texto_original = texto(
        l.texto_original,
        `${c}.texto_original`,
        200,
        true,
      )!;
      const cantidad = numero(l.cantidad, `${c}.cantidad`, {
        max: MAX_CANTIDAD,
        obligatorio: true,
        decimales: 3,
      })!;
      let total_linea = numero(l.total_linea, `${c}.total_linea`, {
        max: MAX_DINERO,
        obligatorio: false,
      });
      const precio_unitario = numero(
        l.precio_unitario,
        `${c}.precio_unitario`,
        {
          max: MAX_DINERO,
          obligatorio: false,
          decimales: 4,
        },
      );
      if (total_linea === null && precio_unitario !== null) {
        total_linea = redondearA(precio_unitario * cantidad, 2);
      }
      let paquete: PaqueteBorrador | null = null;
      if (l.paquete !== null && l.paquete !== undefined) {
        if (!esObj(l.paquete)) {
          throw new Error(`${c}.paquete debe ser un objeto o null`);
        }
        paquete = {
          descripcion: texto(
            l.paquete.descripcion,
            `${c}.paquete.descripcion`,
            50,
            true,
          )!,
          unidades: numero(l.paquete.unidades, `${c}.paquete.unidades`, {
            max: MAX_UNIDADES_PAQUETE,
            obligatorio: false,
            decimales: 3,
          }),
        };
      }
      let confianza: Confianza = 'media';
      if (l.confianza !== undefined && l.confianza !== null) {
        if (!['alta', 'media', 'baja'].includes(l.confianza as string)) {
          throw new Error(`${c}.confianza debe ser alta, media o baja`);
        }
        confianza = l.confianza as Confianza;
      }
      let presentacion_id: number | null = null;
      if (l.presentacion_id !== null && l.presentacion_id !== undefined) {
        if (
          typeof l.presentacion_id !== 'number' ||
          !Number.isInteger(l.presentacion_id)
        ) {
          throw new Error(`${c}.presentacion_id debe ser un entero o null`);
        }
        if (catalogo.tienePresentacion(l.presentacion_id)) {
          presentacion_id = l.presentacion_id;
        } else {
          advertencias.push(
            `"${texto_original}": el modelo usó una presentación (${l.presentacion_id}) que no existe.`,
          );
          confianza = 'baja';
        }
      }
      return {
        texto_original,
        presentacion_id,
        cantidad,
        paquete,
        total_linea,
        precio_unitario,
        confianza,
      };
    });

    const nuevosCrudos = raiz.productos_nuevos ?? [];
    if (!Array.isArray(nuevosCrudos)) {
      throw new Error('productos_nuevos debe ser un arreglo');
    }
    const productos_nuevos: ProductoNuevoBorrador[] = nuevosCrudos.map(
      (p, i) => {
        const c = `productos_nuevos[${i}]`;
        if (!esObj(p)) throw new Error(`${c} debe ser un objeto`);
        const nombre = texto(p.nombre, `${c}.nombre`, 150, true)!;
        return {
          texto_original:
            texto(p.texto_original, `${c}.texto_original`, 200, false) ??
            nombre,
          nombre,
          descripcion_presentacion:
            texto(
              p.descripcion_presentacion,
              `${c}.descripcion_presentacion`,
              100,
              false,
            ) ?? 'Unidad',
          // Ausente = 1 (se compra por unidad); null explícito = no dijo cuántas trae.
          factor: numero(p.factor === undefined ? 1 : p.factor, `${c}.factor`, {
            max: MAX_CANTIDAD,
            obligatorio: false,
            decimales: 3,
          }),
          unidad_venta: texto(p.unidad_venta, `${c}.unidad_venta`, 100, false),
          cantidad: numero(p.cantidad, `${c}.cantidad`, {
            max: MAX_CANTIDAD,
            obligatorio: true,
            decimales: 3,
          })!,
          total_linea: numero(p.total_linea, `${c}.total_linea`, {
            max: MAX_DINERO,
            obligatorio: false,
          }),
          precio_venta: numero(p.precio_venta, `${c}.precio_venta`, {
            max: MAX_DINERO,
            obligatorio: false,
          }),
        };
      },
    );

    const total_factura = numero(raiz.total_factura, 'total_factura', {
      max: MAX_DINERO,
      obligatorio: false,
    });

    const prCrudas = raiz.preguntas ?? [];
    if (
      !Array.isArray(prCrudas) ||
      prCrudas.some((q) => typeof q !== 'string')
    ) {
      throw new Error('preguntas debe ser un arreglo de textos');
    }
    const preguntas = (prCrudas as string[])
      .map((q) => q.trim())
      .filter((q) => q !== '')
      .slice(0, 5);

    return {
      ok: true,
      borrador: {
        proveedor,
        origen_pago: origen,
        lineas,
        productos_nuevos,
        total_factura,
        preguntas,
      },
      advertencias,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Respuesta no válida',
    };
  }
}
