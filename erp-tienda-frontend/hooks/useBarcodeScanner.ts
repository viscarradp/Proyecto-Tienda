import { useEffect, useRef } from 'react';

type BarcodeCallback = (barcode: string) => void;

interface UseBarcodeScannerOptions {
  onScan: BarcodeCallback;
  enabled?: boolean;
}

/** Entre teclas de un lector pasan menos de 30 ms; una persona tarda más. */
export const UMBRAL_RAFAGA_MS = 30;
/** Largo mínimo de un código para tratarlo como escaneo. */
export const LARGO_MIN_CODIGO = 6;
/** Si la ráfaga se corta sin Enter, pasado este tiempo se deshace lo escrito. */
const ESPERA_SIN_ENTER_MS = 120;

/** Estado de una posible ráfaga dentro de un campo marcado con data-escaner="desviar". */
export interface EstadoDesvio {
  /** Teclas de carácter vistas en la ráfaga (la 1.ª se escribió; desde la 2.ª se bloquean). */
  n: number;
  buffer: string;
  /** Valor del campo justo antes de la 1.ª tecla: al que se vuelve. */
  previo: string;
  t: number;
}

export interface ResultadoDesvio {
  estado: EstadoDesvio | null;
  /** true: hay que hacer preventDefault (la tecla no debe escribirse / activar nada). */
  bloquear: boolean;
  /** Código completo (ráfaga + Enter, >= 6 caracteres): agregar al ticket. */
  codigo?: string;
  /** Valor al que restaurar el campo (hubo ráfaga). */
  restaurar?: string;
}

/**
 * Lógica pura del desvío: decide qué hacer con una tecla pulsada en un campo
 * numérico del POS. La 1.ª tecla de una ráfaga se deja escribir (no se puede saber
 * que es de un lector); desde la 2.ª, a menos de 30 ms de la anterior, se bloquea.
 * Con Enter se devuelve el código y el valor a restaurar.
 */
export function procesarTeclaDesviada(
  estado: EstadoDesvio | null,
  tecla: { key: string; t: number; valor: string },
): ResultadoDesvio {
  const rapida = estado !== null && tecla.t - estado.t <= UMBRAL_RAFAGA_MS;

  if (tecla.key === 'Enter') {
    if (estado && rapida && estado.n >= 2) {
      return {
        estado: null,
        bloquear: true,
        restaurar: estado.previo,
        codigo: estado.buffer.length >= LARGO_MIN_CODIGO ? estado.buffer : undefined,
      };
    }
    return { estado: null, bloquear: false };
  }

  if (tecla.key.length !== 1) return { estado, bloquear: false };

  if (estado && rapida) {
    return {
      estado: { ...estado, n: estado.n + 1, buffer: estado.buffer + tecla.key, t: tecla.t },
      bloquear: true,
    };
  }
  // Tecla lenta (persona) o primera de una posible ráfaga: se escribe normal.
  return {
    estado: { n: 1, buffer: tecla.key, previo: tecla.valor, t: tecla.t },
    bloquear: false,
  };
}

/** Vuelve el campo a su valor anterior avisando a React (setter nativo + evento input). */
function restaurarCampo(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function useBarcodeScanner({ onScan, enabled = true }: UseBarcodeScannerOptions) {
  const buffer = useRef('');
  const lastKeyTime = useRef(0);
  const desvio = useRef<EstadoDesvio | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Campos numéricos del POS (Cantidad, Monto, "Paga con") marcados con
      // data-escaner="desviar": un escaneo ahí no debe quedar escrito; el producto
      // se agrega al ticket y el campo vuelve a su valor.
      const objetivo = e.target instanceof HTMLInputElement ? e.target : null;
      if (objetivo?.dataset.escaner === 'desviar') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const r = procesarTeclaDesviada(desvio.current, {
          key: e.key,
          t: Date.now(),
          valor: objetivo.value,
        });
        desvio.current = r.estado;
        clearTimeout(temporizador);
        if (r.bloquear) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (r.restaurar !== undefined) restaurarCampo(objetivo, r.restaurar);
        if (r.codigo) onScan(r.codigo);
        // Ráfaga sin Enter: se deshace lo escrito, no se agrega nada.
        if (r.estado && r.estado.n >= 2) {
          const previo = r.estado.previo;
          temporizador = setTimeout(() => {
            desvio.current = null;
            restaurarCampo(objetivo, previo);
          }, ESPERA_SIN_ENTER_MS);
        }
        return;
      }

      // Cualquier otro input (buscador, diálogos): se escribe normal, como siempre.
      const activeTag = document.activeElement?.tagName.toUpperCase() || '';
      const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag);
      if (isInputFocused) {
        return;
      }

      const currentTime = Date.now();

      // If time between keystrokes is (> 30ms), it's human typing. Reset buffer.
      if (currentTime - lastKeyTime.current > UMBRAL_RAFAGA_MS) {
        buffer.current = '';
      }

      if (e.key === 'Enter') {
        if (buffer.current.length > 0) {
          onScan(buffer.current);
          buffer.current = '';
          e.preventDefault();
        }
        return;
      }

      // Add normal character
      if (e.key.length === 1) {
        buffer.current += e.key;
      }

      lastKeyTime.current = currentTime;
    };

    // Fase de captura: corre antes que los onKeyDown de los campos (p. ej. el Enter
    // que sale de Cantidad no debe ejecutarse a mitad de una ráfaga).
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      clearTimeout(temporizador);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onScan, enabled]);
}
