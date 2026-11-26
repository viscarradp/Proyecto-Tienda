import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BOT_NUCLEO,
  type BotNucleo,
  type EntradaBot,
  type RespuestaBot,
} from '../nucleo/contrato';
import { TelegramApi } from './telegram.api';
import {
  leerUsuariosTelegram,
  type TgCallbackQuery,
  type TgMensaje,
  type TgUpdate,
} from './telegram.tipos';

export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;
const MIMES_IMAGEN = ['image/jpeg', 'image/png'];

export const MSG_BIENVENIDA =
  'Hola. Escríbeme lo que compraste o mándame la foto de la factura, y te ayudo a registrar la compra.';
export const MSG_NO_ENTIENDO = 'Por ahora entiendo texto y fotos de facturas.';
export const MSG_NO_ADMIN = 'Las compras las registra la dueña.';
export const MSG_ERROR = 'Algo falló, intenta de nuevo';
export const MSG_IMAGEN_GRANDE =
  'La foto es muy pesada (máximo 5 MB). Mándala de nuevo más liviana.';
export const MSG_IMAGEN_FALLO = 'No pude bajar la foto, intenta de nuevo.';

export const mensajeNoAutorizado = (telegramId: string) =>
  `Hola. Todavía no estás autorizado. Tu número de Telegram es ${telegramId}; pásaselo a quien administra el sistema.`;

/**
 * Decide quién puede usar el bot y traduce cada mensaje de Telegram a una
 * llamada al núcleo. Procesa en orden, uno a la vez, por chat.
 */
@Injectable()
export class TelegramDespachador {
  private readonly logger = new Logger('Telegram');
  private readonly colas = new Map<string, Promise<void>>();

  constructor(
    private readonly api: TelegramApi,
    private readonly prisma: PrismaService,
    @Inject(BOT_NUCLEO) private readonly nucleo: BotNucleo,
  ) {}

  /** Encola el update en la cola de su chat. La promesa nunca rechaza. */
  procesar(update: TgUpdate): Promise<void> {
    const chat = update.message?.chat ?? update.callback_query?.message?.chat;
    if (!chat || chat.type !== 'private') return Promise.resolve();
    const clave = String(chat.id);

    const anterior = this.colas.get(clave) ?? Promise.resolve();
    const actual = anterior.then(() => this.manejar(update, clave));
    this.colas.set(clave, actual);
    void actual.then(() => {
      if (this.colas.get(clave) === actual) this.colas.delete(clave);
    });
    return actual;
  }

  private async manejar(update: TgUpdate, chatId: string): Promise<void> {
    try {
      if (update.callback_query) {
        await this.manejarBoton(update.callback_query, chatId);
      } else if (update.message) {
        await this.manejarMensaje(update.message, chatId);
      }
    } catch (err) {
      this.registrarError('Fallo al procesar un mensaje', err);
      try {
        await this.api.sendMessage(chatId, MSG_ERROR);
      } catch (err2) {
        this.registrarError('No se pudo avisar del fallo', err2);
      }
    }
  }

  /** Devuelve el id del usuario ADMIN activo, o el texto con que rechazarlo. */
  private async autorizar(
    telegramId: string,
  ): Promise<{ usuarioId: number } | { rechazo: string }> {
    const nombre = leerUsuariosTelegram().get(telegramId);
    if (!nombre) return { rechazo: mensajeNoAutorizado(telegramId) };
    const usuario = await this.prisma.usuarios.findUnique({
      where: { nombre },
      select: { id: true, rol: true, activo: true },
    });
    if (!usuario || !usuario.activo) {
      return { rechazo: mensajeNoAutorizado(telegramId) };
    }
    if (usuario.rol !== 'ADMIN') return { rechazo: MSG_NO_ADMIN };
    return { usuarioId: usuario.id };
  }

  private async manejarMensaje(msg: TgMensaje, chatId: string) {
    const telegramId = String(msg.from?.id ?? msg.chat.id);
    const auth = await this.autorizar(telegramId);
    if ('rechazo' in auth) {
      await this.api.sendMessage(chatId, auth.rechazo);
      return;
    }
    const { usuarioId } = auth;

    if (msg.text !== undefined) {
      if (/^\/start(@\w+)?(\s|$)/.test(msg.text)) {
        await this.api.sendMessage(chatId, MSG_BIENVENIDA);
        return;
      }
      await this.consultarNucleo(chatId, {
        chatId,
        usuarioId,
        texto: msg.text,
      });
      return;
    }

    let fileId: string | undefined;
    let tamano: number | undefined;
    let mimeBase = 'image/jpeg';
    if (msg.photo && msg.photo.length > 0) {
      const mayor = msg.photo.reduce((a, b) =>
        (b.file_size ?? 0) >= (a.file_size ?? 0) ? b : a,
      );
      fileId = mayor.file_id;
      tamano = mayor.file_size;
    } else if (
      msg.document?.mime_type &&
      MIMES_IMAGEN.includes(msg.document.mime_type)
    ) {
      fileId = msg.document.file_id;
      tamano = msg.document.file_size;
      mimeBase = msg.document.mime_type;
    }

    if (!fileId) {
      await this.api.sendMessage(chatId, MSG_NO_ENTIENDO);
      return;
    }
    if (tamano !== undefined && tamano > MAX_BYTES_IMAGEN) {
      await this.api.sendMessage(chatId, MSG_IMAGEN_GRANDE);
      return;
    }
    let archivo: { buffer: Buffer; mime: string };
    try {
      archivo = await this.api.descargarArchivo(
        fileId,
        MAX_BYTES_IMAGEN,
        mimeBase,
      );
    } catch (err) {
      this.registrarError('No se pudo descargar la imagen', err);
      await this.api.sendMessage(chatId, MSG_IMAGEN_FALLO);
      return;
    }
    await this.consultarNucleo(chatId, {
      chatId,
      usuarioId,
      imagen: { base64: archivo.buffer.toString('base64'), mime: archivo.mime },
      texto: msg.caption,
    });
  }

  private async manejarBoton(cb: TgCallbackQuery, chatId: string) {
    try {
      await this.api.answerCallbackQuery(cb.id);
    } catch (err) {
      this.registrarError('No se pudo confirmar el botón', err);
    }
    const auth = await this.autorizar(String(cb.from.id));
    if ('rechazo' in auth) {
      await this.api.sendMessage(chatId, auth.rechazo);
      return;
    }
    if (cb.message) {
      try {
        await this.api.quitarBotones(chatId, cb.message.message_id);
      } catch (err) {
        this.registrarError('No se pudieron quitar los botones', err);
      }
    }
    if (!cb.data) return;
    const datos = cb.data;
    const { usuarioId } = auth;
    await this.conEscribiendo(chatId, async () => {
      const r = await this.nucleo.recibirAccion({ chatId, usuarioId, datos });
      await this.responder(chatId, r);
    });
  }

  private async consultarNucleo(chatId: string, entrada: EntradaBot) {
    await this.conEscribiendo(chatId, async () => {
      const r = await this.nucleo.recibirMensaje(entrada);
      await this.responder(chatId, r);
    });
  }

  private responder(chatId: string, r: RespuestaBot) {
    return this.api.sendMessage(chatId, r.texto, r.botones);
  }

  /** Muestra "escribiendo..." mientras corre la tarea (se renueva cada 4 s). */
  private async conEscribiendo(chatId: string, tarea: () => Promise<void>) {
    const avisar = () => {
      this.api.sendChatAction(chatId).catch(() => undefined);
    };
    avisar();
    const timer = setInterval(avisar, 4000);
    timer.unref();
    try {
      await tarea();
    } finally {
      clearInterval(timer);
    }
  }

  /** Registra solo el mensaje del error (sin token ni contenido del chat). */
  private registrarError(contexto: string, err: unknown) {
    const msg = err instanceof Error ? err.message : 'error desconocido';
    this.logger.error(`${contexto}: ${this.api.enmascarar(msg)}`);
  }
}
