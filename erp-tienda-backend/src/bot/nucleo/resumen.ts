import { Borrador, OrigenPago } from './borrador';
import { Catalogo } from './catalogo';
import { convertirLineaCompra, LineaCompraConvertida } from './conversion';
import { BotonBot, RespuestaBot } from './contrato';

export const MAX_CARACTERES = 3500;

const ETIQUETA_PAGO: Record<OrigenPago, string> = {
  GAVETA: 'gaveta',
  BOVEDA: 'bóveda',
  CREDITO: 'quedó fiado',
  CAPITAL: 'capital de la dueña',
};

export const BOTON_CANCELAR: BotonBot = {
  texto: 'Cancelar',
  datos: 'cancelar',
};

export function dinero(n: number): string {
  return `$${n.toFixed(2)}`;
}

function cantidadTexto(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export interface Evaluacion {
  lineas: string[];
  total: number;
  faltantes: string[];
  avisos: string[];
  completo: boolean;
}

/** Igual que convertirLineaCompra, pero rechaza lo que no cabe en el lote (≤ 99,999 unidades). */
function convertirSeguro(
  cantidad: number,
  factor: number,
  total: number,
): LineaCompraConvertida | null {
  const r = convertirLineaCompra(cantidad, factor, total);
  return r && r.cantidadBase <= 99999 ? r : null;
}

/** Línea ya convertida a unidades base, lista para armar el lote. */
export interface LoteConvertido {
  presentacionId: number;
  productoId: number;
  conversion: LineaCompraConvertida;
}

/** Convierte las líneas resueltas del borrador (null si alguna no se puede). */
export function convertirLotes(
  b: Borrador,
  cat: Catalogo,
): LoteConvertido[] | null {
  const lotes: LoteConvertido[] = [];
  for (const l of b.lineas) {
    const pres =
      l.presentacion_id !== null ? cat.porId.get(l.presentacion_id) : undefined;
    if (!pres || l.total_linea === null) return null;
    const conversion = convertirSeguro(l.cantidad, pres.factor, l.total_linea);
    if (!conversion) return null;
    lotes.push({
      presentacionId: pres.id,
      productoId: pres.productoId,
      conversion,
    });
  }
  return lotes;
}

/** Arma las líneas del resumen y lo que todavía falta para poder guardar. */
export function evaluarBorrador(b: Borrador, cat: Catalogo): Evaluacion {
  const lineas: string[] = [];
  const faltantes: string[] = [];
  const avisos: string[] = [];
  let total = 0;
  let totalesCompletos = true;
  let n = 0;

  for (const l of b.lineas) {
    n++;
    const pres =
      l.presentacion_id !== null ? cat.porId.get(l.presentacion_id) : undefined;
    if (!pres) {
      lineas.push(`${n}. No encontré «${l.texto_original}» en el catálogo.`);
      faltantes.push(`¿Qué producto del catálogo es «${l.texto_original}»?`);
      totalesCompletos = false;
      continue;
    }
    const factorTxt =
      pres.factor !== 1 ? ` (${cantidadTexto(pres.factor)} c/u)` : '';
    const cabeza = `${n}. ${cantidadTexto(l.cantidad)} ${pres.descripcion}${factorTxt} de ${pres.producto}`;
    if (l.total_linea === null) {
      lineas.push(`${cabeza} — falta el precio`);
      faltantes.push(`¿Cuánto pagaste por ${pres.producto}?`);
      totalesCompletos = false;
      continue;
    }
    const conv = convertirSeguro(l.cantidad, pres.factor, l.total_linea);
    if (!conv) {
      lineas.push(`${cabeza} — no pude calcular el costo`);
      faltantes.push(`Revisa la cantidad y el precio de ${pres.producto}.`);
      totalesCompletos = false;
      continue;
    }
    total += conv.totalGuardado;
    if (Math.abs(conv.diferencia) > 0.01) {
      avisos.push(
        `Ojo: en ${pres.producto} no pude cuadrar el costo al centavo (guardaría ${dinero(conv.totalGuardado)}). Revisa la cantidad y el precio.`,
      );
    }
    const dudosa = l.confianza === 'baja' ? ' (no estoy segura de este)' : '';
    lineas.push(
      `${cabeza} por ${dinero(l.total_linea)} → ${cantidadTexto(conv.cantidadBase)} unidades a $${conv.costoUnitario.toFixed(4)}${dudosa}`,
    );
  }

  for (const p of b.productos_nuevos) {
    n++;
    const factorTxt = p.factor !== 1 ? ` (${cantidadTexto(p.factor)} c/u)` : '';
    const cabeza = `${n}. NUEVO: ${cantidadTexto(p.cantidad)} ${p.descripcion_presentacion}${factorTxt} de ${p.nombre}`;
    const conv =
      p.total_linea !== null
        ? convertirSeguro(p.cantidad, p.factor, p.total_linea)
        : null;
    if (conv && p.total_linea !== null) {
      total += conv.totalGuardado;
      lineas.push(
        `${cabeza} por ${dinero(p.total_linea)} → ${cantidadTexto(conv.cantidadBase)} unidades a $${conv.costoUnitario.toFixed(4)} (se crea «por revisar»)`,
      );
    } else {
      lineas.push(`${cabeza} — falta el precio`);
      faltantes.push(`¿Cuánto pagaste por ${p.nombre}?`);
      totalesCompletos = false;
    }
    if (p.precio_venta === null) {
      faltantes.push(`¿A cuánto vendes cada unidad de ${p.nombre}?`);
    }
  }

  if (b.lineas.length + b.productos_nuevos.length === 0) {
    faltantes.push(
      '¿Qué compraste? Dime los productos, cuántos y cuánto pagaste.',
    );
  }
  if (!b.proveedor) faltantes.push('¿A quién le compraste (proveedor)?');
  if (!b.origen_pago) faltantes.push('¿De dónde salió el dinero?');

  if (
    totalesCompletos &&
    b.total_factura !== null &&
    Math.abs(b.total_factura - total) > 0.01
  ) {
    avisos.push(
      `Ojo: la factura dice ${dinero(b.total_factura)} y lo que leí suma ${dinero(total)}. Revisa si falta algo.`,
    );
  }

  return {
    lineas,
    total: Math.round(total * 100) / 100,
    faltantes,
    avisos,
    completo: faltantes.length === 0,
  };
}

export function recortar(texto: string): string {
  if (texto.length <= MAX_CARACTERES) return texto;
  return texto.slice(0, MAX_CARACTERES - 20).trimEnd() + '\n… (recortado)';
}

/** Resumen del borrador con sus preguntas y los botones que corresponden. */
export function respuestaBorrador(b: Borrador, cat: Catalogo): RespuestaBot {
  const ev = evaluarBorrador(b, cat);
  const partes: string[] = ['Esto entendí:', '', ...ev.lineas, ''];
  partes.push(
    `Total ${dinero(ev.total)} · Proveedor: ${b.proveedor ?? '(falta)'} · Pago: ${
      b.origen_pago ? ETIQUETA_PAGO[b.origen_pago] : '(falta)'
    }`,
  );
  for (const a of ev.avisos) partes.push('', a);

  const preguntas = [...ev.faltantes, ...b.preguntas];
  if (preguntas.length > 0) {
    partes.push('', 'Me falta saber:', ...preguntas.map((q) => `- ${q}`));
    partes.push('', 'Escríbeme la respuesta o corrige lo que esté mal.');
  } else {
    partes.push('', '¿Lo guardo? Si algo está mal, escríbeme qué cambiar.');
  }

  let botones: BotonBot[][];
  if (ev.completo) {
    botones = [[{ texto: 'Sí, guardar', datos: 'guardar' }, BOTON_CANCELAR]];
  } else if (!b.origen_pago) {
    botones = [
      [
        { texto: 'Gaveta', datos: 'pago:GAVETA' },
        { texto: 'Bóveda', datos: 'pago:BOVEDA' },
        { texto: 'Quedó fiado', datos: 'pago:CREDITO' },
      ],
      [BOTON_CANCELAR],
    ];
  } else {
    botones = [[BOTON_CANCELAR]];
  }
  return { texto: recortar(partes.join('\n')), botones };
}
