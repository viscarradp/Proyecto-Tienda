import type { BotNucleo } from '../nucleo/contrato';
import type { TelegramApi } from './telegram.api';
import {
  MSG_BIENVENIDA,
  MSG_ERROR,
  MSG_NO_ADMIN,
  MSG_NO_ENTIENDO,
  TelegramDespachador,
} from './telegram.despachador';
import type { TgMensaje, TgUpdate } from './telegram.tipos';

interface UsuarioFalso {
  id: number;
  rol: string;
  activo: boolean;
}

function montar(usuarios: Record<string, UsuarioFalso>) {
  const api = {
    sendMessage: jest
      .fn<Promise<void>, [string, string, unknown?]>()
      .mockResolvedValue(undefined),
    sendChatAction: jest.fn().mockResolvedValue(undefined),
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
    quitarBotones: jest.fn().mockResolvedValue(undefined),
    descargarArchivo: jest.fn<
      Promise<{ buffer: Buffer; mime: string }>,
      [string, number, string?]
    >(),
    enmascarar: (t: string) => t,
  };
  const nucleo = {
    recibirMensaje: jest.fn().mockResolvedValue({ texto: 'ok' }),
    recibirAccion: jest.fn().mockResolvedValue({ texto: 'hecho' }),
  };
  const prisma = {
    usuarios: {
      findUnique: jest.fn(({ where }: { where: { nombre: string } }) =>
        Promise.resolve(usuarios[where.nombre] ?? null),
      ),
    },
  };
  const d = new TelegramDespachador(
    api as unknown as TelegramApi,
    prisma as never,
    nucleo as unknown as BotNucleo,
  );
  return { d, api, nucleo };
}

const msg = (
  extra: Partial<TgMensaje>,
  chatId = 100,
  fromId = 100,
): TgUpdate => ({
  update_id: 1,
  message: {
    message_id: 1,
    from: { id: fromId },
    chat: { id: chatId, type: 'private' },
    ...extra,
  },
});

describe('TelegramDespachador', () => {
  const envOriginal = process.env.TELEGRAM_USUARIOS;
  beforeEach(() => {
    process.env.TELEGRAM_USUARIOS = '100:dueña,200:cajero,300:inactivo';
  });
  afterAll(() => {
    process.env.TELEGRAM_USUARIOS = envOriginal;
  });

  const usuarios = {
    dueña: { id: 1, rol: 'ADMIN', activo: true },
    cajero: { id: 2, rol: 'CAJERO', activo: true },
    inactivo: { id: 3, rol: 'ADMIN', activo: false },
  };

  it('a un desconocido le da su número de Telegram', async () => {
    const { d, api, nucleo } = montar(usuarios);
    await d.procesar(msg({ text: 'hola' }, 555, 555));
    expect(api.sendMessage.mock.calls[0][1]).toContain('555');
    expect(api.sendMessage.mock.calls[0][1]).toContain(
      'Todavía no estás autorizado',
    );
    expect(nucleo.recibirMensaje).not.toHaveBeenCalled();
  });

  it('un usuario inactivo recibe el mismo aviso de no autorizado', async () => {
    process.env.TELEGRAM_USUARIOS = '300:inactivo';
    const { d, api, nucleo } = montar(usuarios);
    await d.procesar(msg({ text: 'hola' }, 300, 300));
    expect(api.sendMessage.mock.calls[0][1]).toContain(
      'Todavía no estás autorizado',
    );
    expect(nucleo.recibirMensaje).not.toHaveBeenCalled();
  });

  it('rechaza a quien no es ADMIN', async () => {
    const { d, api, nucleo } = montar(usuarios);
    await d.procesar(msg({ text: 'hola' }, 200, 200));
    expect(api.sendMessage).toHaveBeenCalledWith('200', MSG_NO_ADMIN);
    expect(nucleo.recibirMensaje).not.toHaveBeenCalled();
  });

  it('ignora los grupos', async () => {
    const { d, api, nucleo } = montar(usuarios);
    const u = msg({ text: 'hola' });
    u.message!.chat.type = 'group';
    await d.procesar(u);
    expect(api.sendMessage).not.toHaveBeenCalled();
    expect(nucleo.recibirMensaje).not.toHaveBeenCalled();
  });

  it('/start saluda sin llamar al núcleo', async () => {
    const { d, api, nucleo } = montar(usuarios);
    await d.procesar(msg({ text: '/start' }));
    expect(api.sendMessage).toHaveBeenCalledWith('100', MSG_BIENVENIDA);
    expect(nucleo.recibirMensaje).not.toHaveBeenCalled();
  });

  it('texto -> núcleo y responde con sus botones', async () => {
    const { d, api, nucleo } = montar(usuarios);
    const botones = [[{ texto: 'Guardar', datos: 'g' }]];
    nucleo.recibirMensaje.mockResolvedValueOnce({ texto: 'Borrador', botones });
    await d.procesar(msg({ text: '10 libras de arroz' }));
    expect(nucleo.recibirMensaje).toHaveBeenCalledWith({
      chatId: '100',
      usuarioId: 1,
      texto: '10 libras de arroz',
    });
    expect(api.sendChatAction).toHaveBeenCalledWith('100');
    expect(api.sendMessage).toHaveBeenCalledWith('100', 'Borrador', botones);
  });

  it('foto -> descarga la más grande y la manda en base64 con el pie', async () => {
    const { d, api, nucleo } = montar(usuarios);
    api.descargarArchivo.mockResolvedValue({
      buffer: Buffer.from('hola'),
      mime: 'image/jpeg',
    });
    await d.procesar(
      msg({
        photo: [
          { file_id: 'chica', file_size: 10 },
          { file_id: 'grande', file_size: 500 },
        ],
        caption: 'factura',
      }),
    );
    expect(api.descargarArchivo.mock.calls[0][0]).toBe('grande');
    expect(nucleo.recibirMensaje).toHaveBeenCalledWith({
      chatId: '100',
      usuarioId: 1,
      imagen: {
        base64: Buffer.from('hola').toString('base64'),
        mime: 'image/jpeg',
      },
      texto: 'factura',
    });
  });

  it('foto de más de 5 MB se rechaza sin descargar', async () => {
    const { d, api, nucleo } = montar(usuarios);
    await d.procesar(
      msg({ photo: [{ file_id: 'x', file_size: 6 * 1024 * 1024 }] }),
    );
    expect(api.descargarArchivo).not.toHaveBeenCalled();
    expect(nucleo.recibirMensaje).not.toHaveBeenCalled();
    expect(api.sendMessage.mock.calls[0][1]).toContain('5 MB');
  });

  it('documento de imagen se trata como foto; otros tipos no se entienden', async () => {
    const { d, api, nucleo } = montar(usuarios);
    api.descargarArchivo.mockResolvedValue({
      buffer: Buffer.from('x'),
      mime: 'image/png',
    });
    await d.procesar(
      msg({ document: { file_id: 'd', mime_type: 'image/png' } }),
    );
    expect(nucleo.recibirMensaje).toHaveBeenCalledTimes(1);

    await d.procesar(
      msg({ document: { file_id: 'd2', mime_type: 'application/pdf' } }),
    );
    expect(api.sendMessage).toHaveBeenLastCalledWith('100', MSG_NO_ENTIENDO);
    await d.procesar(msg({}));
    expect(api.sendMessage).toHaveBeenLastCalledWith('100', MSG_NO_ENTIENDO);
  });

  it('botón -> responde el callback, quita botones y llama recibirAccion', async () => {
    const { d, api, nucleo } = montar(usuarios);
    await d.procesar({
      update_id: 2,
      callback_query: {
        id: 'cb1',
        from: { id: 100 },
        data: 'guardar:1',
        message: { message_id: 55, chat: { id: 100, type: 'private' } },
      },
    });
    expect(api.answerCallbackQuery).toHaveBeenCalledWith('cb1');
    expect(api.quitarBotones).toHaveBeenCalledWith('100', 55);
    expect(nucleo.recibirAccion).toHaveBeenCalledWith({
      chatId: '100',
      usuarioId: 1,
      datos: 'guardar:1',
    });
    expect(api.sendMessage).toHaveBeenCalledWith('100', 'hecho', undefined);
  });

  it('si el núcleo falla responde un aviso genérico', async () => {
    const { d, api, nucleo } = montar(usuarios);
    nucleo.recibirMensaje.mockRejectedValueOnce(new Error('boom'));
    await d.procesar(msg({ text: 'hola' }));
    expect(api.sendMessage).toHaveBeenCalledWith('100', MSG_ERROR);
  });

  it('procesa en orden por chat, y chats distintos no se esperan', async () => {
    const { d, nucleo } = montar(usuarios);
    process.env.TELEGRAM_USUARIOS = '100:dueña,101:dueña';
    const eventos: string[] = [];
    let soltarPrimero!: () => void;
    nucleo.recibirMensaje.mockImplementation(({ texto, chatId }) => {
      eventos.push(`ini:${chatId}:${texto}`);
      if (texto === 'uno') {
        return new Promise((resolve) => {
          soltarPrimero = () => {
            eventos.push('fin:uno');
            resolve({ texto: 'r' });
          };
        });
      }
      return Promise.resolve({ texto: 'r' });
    });
    const p1 = d.procesar(msg({ text: 'uno' }, 100, 100));
    const p2 = d.procesar(msg({ text: 'dos' }, 100, 100));
    const p3 = d.procesar(msg({ text: 'otro' }, 101, 101));
    await p3;
    expect(eventos).toContain('ini:101:otro');
    expect(eventos).not.toContain('ini:100:dos');
    soltarPrimero();
    await Promise.all([p1, p2]);
    expect(eventos.indexOf('fin:uno')).toBeLessThan(
      eventos.indexOf('ini:100:dos'),
    );
  });
});
