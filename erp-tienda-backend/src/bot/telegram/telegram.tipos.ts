/** Subconjunto de los objetos de la Bot API de Telegram que usamos. */
export interface TgUsuario {
  id: number;
}
export interface TgChat {
  id: number;
  type: string;
}
export interface TgFoto {
  file_id: string;
  file_size?: number;
}
export interface TgDocumento {
  file_id: string;
  file_size?: number;
  mime_type?: string;
}
export interface TgMensaje {
  message_id: number;
  from?: TgUsuario;
  chat: TgChat;
  text?: string;
  caption?: string;
  photo?: TgFoto[];
  document?: TgDocumento;
}
export interface TgCallbackQuery {
  id: string;
  from: TgUsuario;
  data?: string;
  message?: TgMensaje;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMensaje;
  callback_query?: TgCallbackQuery;
}

export type ModoTelegram = 'apagado' | 'polling' | 'webhook';

export function leerModo(env: NodeJS.ProcessEnv = process.env): ModoTelegram {
  const m = (env.TELEGRAM_MODO ?? '').trim().toLowerCase();
  return m === 'polling' || m === 'webhook' ? m : 'apagado';
}

/** Interpreta TELEGRAM_USUARIOS ("123:admin,456:maria") -> telegramId -> nombre. */
export function leerUsuariosTelegram(
  env: NodeJS.ProcessEnv = process.env,
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const par of (env.TELEGRAM_USUARIOS ?? '').split(',')) {
    const i = par.indexOf(':');
    if (i < 0) continue;
    const id = par.slice(0, i).trim();
    const nombre = par.slice(i + 1).trim();
    if (id && nombre) mapa.set(id, nombre);
  }
  return mapa;
}
