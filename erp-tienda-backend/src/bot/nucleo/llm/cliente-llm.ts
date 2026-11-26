export type ParteLlm =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface MensajeLlm {
  role: 'system' | 'user' | 'assistant';
  content: string | ParteLlm[];
}

export interface OpcionesLlm {
  /** true si algún mensaje lleva imagen (usa el modelo de visión). */
  vision?: boolean;
}

/** Falla del proveedor de IA (red, cuota, modelo, respuesta vacía). */
export class ErrorLlm extends Error {}

/**
 * El modelo SOLO interpreta: devuelve el texto (JSON) de su respuesta. Nunca
 * escribe en la base ni decide guardar.
 */
export interface ClienteLlm {
  interpretar(mensajes: MensajeLlm[], opciones: OpcionesLlm): Promise<string>;
}

export const CLIENTE_LLM = 'CLIENTE_LLM';
