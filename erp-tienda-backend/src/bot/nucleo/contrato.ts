/**
 * Contrato entre el núcleo del bot (este módulo) y los adaptadores de chat
 * (Telegram). El adaptador ya resolvió quién escribe: `usuarioId` es un usuario
 * real, activo y con rol ADMIN. Las respuestas son texto plano (sin Markdown)
 * de máximo ~3500 caracteres.
 */
export interface EntradaBot {
  chatId: string;
  usuarioId: number;
  texto?: string;
  imagen?: { base64: string; mime: string };
}

/** `datos` va en el callback_data de Telegram: máximo 64 bytes. */
export interface BotonBot {
  texto: string;
  datos: string;
}

/** `botones` son filas de botones. */
export interface RespuestaBot {
  texto: string;
  botones?: BotonBot[][];
}

/** Cuando la persona toca un botón. */
export interface AccionBot {
  chatId: string;
  usuarioId: number;
  datos: string;
}

export const BOT_NUCLEO = 'BOT_NUCLEO';

export interface BotNucleo {
  recibirMensaje(e: EntradaBot): Promise<RespuestaBot>;
  recibirAccion(a: AccionBot): Promise<RespuestaBot>;
}
