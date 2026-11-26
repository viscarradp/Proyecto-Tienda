import type { BotonBot } from '../nucleo/contrato';
import type { TgUpdate } from './telegram.tipos';

export const LIMITE_TEXTO_TELEGRAM = 4000;

export type FetchFn = typeof fetch;

export class TelegramApiError extends Error {}

/** Divide un texto en trozos de a lo más `max`, cortando en salto de línea o espacio si puede. */
export function dividirTexto(
  texto: string,
  max = LIMITE_TEXTO_TELEGRAM,
): string[] {
  if (texto.length <= max) return [texto];
  const partes: string[] = [];
  let resto = texto;
  while (resto.length > max) {
    let corte = resto.lastIndexOf('\n', max);
    if (corte < max / 2) corte = resto.lastIndexOf(' ', max);
    if (corte < max / 2) corte = max;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte).replace(/^[\n ]/, '');
  }
  if (resto.length > 0) partes.push(resto);
  return partes;
}

export function armarTecladoInline(botones: BotonBot[][]) {
  return {
    inline_keyboard: botones.map((fila) =>
      fila.map((b) => ({ text: b.texto, callback_data: b.datos })),
    ),
  };
}

function mimePorExtension(ruta: string, porDefecto: string): string {
  const ext = ruta.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return porDefecto;
}

interface RespuestaTelegram<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

/** Cliente mínimo de la Bot API con fetch nativo. Nunca expone el token. */
export class TelegramApi {
  constructor(
    private readonly token: string,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
    private readonly base = 'https://api.telegram.org',
  ) {}

  get configurado(): boolean {
    return this.token.length > 0;
  }

  /** Reemplaza el token por asteriscos en cualquier texto. */
  enmascarar(texto: string): string {
    return this.token ? texto.split(this.token).join('***') : texto;
  }

  private url(metodo: string): string {
    return `${this.base}/bot${this.token}/${metodo}`;
  }

  private falla(contexto: string, err: unknown): TelegramApiError {
    const msg = err instanceof Error ? err.message : String(err);
    return new TelegramApiError(`${contexto}: ${this.enmascarar(msg)}`);
  }

  async llamar<T>(
    metodo: string,
    params: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url(metodo), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal,
      });
    } catch (err) {
      throw this.falla(`Telegram ${metodo} no respondió`, err);
    }
    let cuerpo: RespuestaTelegram<T>;
    try {
      cuerpo = (await res.json()) as RespuestaTelegram<T>;
    } catch (err) {
      throw this.falla(`Telegram ${metodo} respondió algo ilegible`, err);
    }
    if (!res.ok || !cuerpo.ok) {
      throw this.falla(
        `Telegram ${metodo} falló (${cuerpo.error_code ?? res.status})`,
        cuerpo.description ?? 'sin descripción',
      );
    }
    return cuerpo.result as T;
  }

  getMe() {
    return this.llamar<{ id: number; username?: string }>('getMe');
  }

  getUpdates(offset: number | undefined, signal?: AbortSignal) {
    return this.llamar<TgUpdate[]>(
      'getUpdates',
      {
        timeout: 30,
        offset,
        allowed_updates: ['message', 'callback_query'],
      },
      signal,
    );
  }

  /** Envía texto plano (sin parse_mode); los botones van en el último trozo. */
  async sendMessage(
    chatId: string,
    texto: string,
    botones?: BotonBot[][],
  ): Promise<void> {
    const partes = dividirTexto(texto);
    for (let i = 0; i < partes.length; i++) {
      const ultima = i === partes.length - 1;
      const params: Record<string, unknown> = {
        chat_id: chatId,
        text: partes[i],
      };
      if (ultima && botones && botones.length > 0) {
        params.reply_markup = armarTecladoInline(botones);
      }
      await this.llamar('sendMessage', params);
    }
  }

  sendChatAction(chatId: string, accion = 'typing') {
    return this.llamar('sendChatAction', { chat_id: chatId, action: accion });
  }

  answerCallbackQuery(callbackQueryId: string, texto?: string) {
    return this.llamar('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: texto,
    });
  }

  /** Quita los botones de un mensaje (teclado vacío). */
  quitarBotones(chatId: string, messageId: number) {
    return this.llamar('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
  }

  setWebhook(url: string, secretToken: string) {
    return this.llamar('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    });
  }

  deleteWebhook() {
    return this.llamar('deleteWebhook');
  }

  getFile(fileId: string) {
    return this.llamar<{ file_path?: string; file_size?: number }>('getFile', {
      file_id: fileId,
    });
  }

  /** Descarga un archivo de Telegram respetando un máximo de bytes. */
  async descargarArchivo(
    fileId: string,
    maxBytes: number,
    mimePorDefecto = 'image/jpeg',
  ): Promise<{ buffer: Buffer; mime: string }> {
    const info = await this.getFile(fileId);
    if (!info.file_path) throw new TelegramApiError('Telegram no dio la ruta');
    if (info.file_size !== undefined && info.file_size > maxBytes) {
      throw new TelegramApiError('Archivo demasiado grande');
    }
    let res: Response;
    try {
      res = await this.fetchFn(
        `${this.base}/file/bot${this.token}/${info.file_path}`,
      );
    } catch (err) {
      throw this.falla('Descarga de archivo falló', err);
    }
    if (!res.ok) {
      throw new TelegramApiError(`Descarga de archivo falló (${res.status})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new TelegramApiError('Archivo demasiado grande');
    }
    return { buffer, mime: mimePorExtension(info.file_path, mimePorDefecto) };
  }
}
