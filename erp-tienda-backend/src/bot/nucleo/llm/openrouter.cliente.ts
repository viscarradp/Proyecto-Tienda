import { Injectable, Logger } from '@nestjs/common';
import { ClienteLlm, ErrorLlm, MensajeLlm, OpcionesLlm } from './cliente-llm';

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 60_000;

interface RespuestaOpenRouter {
  choices?: {
    message?: { content?: string | null };
    error?: { message?: string };
  }[];
  error?: { message?: string; code?: number };
}

/**
 * Cliente de OpenRouter (API compatible con OpenAI) con `fetch` nativo.
 * Variables: OPENROUTER_API_KEY, OPENROUTER_MODEL, OPENROUTER_MODEL_VISION
 * (opcional), OPENROUTER_DATA_COLLECTION (default "deny": solo proveedores que
 * no guardan ni entrenan con los datos). La clave nunca se escribe en logs.
 */
@Injectable()
export class OpenRouterCliente implements ClienteLlm {
  private readonly logger = new Logger(OpenRouterCliente.name);

  async interpretar(
    mensajes: MensajeLlm[],
    opciones: OpcionesLlm,
  ): Promise<string> {
    const clave = process.env.OPENROUTER_API_KEY;
    const modelo = opciones.vision
      ? process.env.OPENROUTER_MODEL_VISION || process.env.OPENROUTER_MODEL
      : process.env.OPENROUTER_MODEL;
    if (!clave || !modelo) {
      throw new ErrorLlm('Falta OPENROUTER_API_KEY u OPENROUTER_MODEL');
    }
    const recoleccion =
      process.env.OPENROUTER_DATA_COLLECTION === 'allow' ? 'allow' : 'deny';

    let res: Response;
    try {
      res = await fetch(URL_OPENROUTER, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clave}`,
          'Content-Type': 'application/json',
          'X-Title': 'Tienda ERP bot',
        },
        body: JSON.stringify({
          model: modelo,
          messages: mensajes,
          temperature: 0,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
          provider: { data_collection: recoleccion },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new ErrorLlm(
        `Sin respuesta de OpenRouter: ${e instanceof Error ? e.name : 'error'}`,
      );
    }

    let cuerpo: RespuestaOpenRouter;
    try {
      cuerpo = (await res.json()) as RespuestaOpenRouter;
    } catch {
      throw new ErrorLlm(`OpenRouter respondió ${res.status} sin JSON`);
    }
    if (!res.ok || cuerpo.error) {
      const detalle = cuerpo.error?.message ?? '';
      this.logger.warn(`OpenRouter ${res.status} (${modelo}): ${detalle}`);
      throw new ErrorLlm(`OpenRouter respondió ${res.status}`);
    }
    const contenido = cuerpo.choices?.[0]?.message?.content;
    if (!contenido || !contenido.trim()) {
      throw new ErrorLlm(
        cuerpo.choices?.[0]?.error?.message ?? 'Respuesta vacía del modelo',
      );
    }
    return contenido;
  }
}
