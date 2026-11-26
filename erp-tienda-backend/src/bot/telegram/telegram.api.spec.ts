import { TelegramApi, dividirTexto } from './telegram.api';

const TOKEN = '123456:SECRETO-ABC';

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status });
}

type CuerpoJson = { text: string; [k: string]: unknown };

function cuerpoDe(
  mock: jest.Mock<Promise<Response>, [string, RequestInit?]>,
  i: number,
): CuerpoJson {
  return JSON.parse(mock.mock.calls[i][1]?.body as string) as CuerpoJson;
}

function crear(respuestas: Response[]) {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();
  for (const r of respuestas) fetchMock.mockResolvedValueOnce(r);
  return {
    api: new TelegramApi(TOKEN, fetchMock as unknown as typeof fetch),
    fetchMock,
  };
}

describe('TelegramApi', () => {
  it('arma la URL con el token y el método', async () => {
    const { api, fetchMock } = crear([
      respuestaJson({ ok: true, result: { id: 1 } }),
    ]);
    await api.getMe();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.telegram.org/bot${TOKEN}/getMe`,
    );
  });

  it('getUpdates usa timeout 30 y offset', async () => {
    const { api, fetchMock } = crear([respuestaJson({ ok: true, result: [] })]);
    await api.getUpdates(42);
    const cuerpo = cuerpoDe(fetchMock, 0);
    expect(cuerpo.timeout).toBe(30);
    expect(cuerpo.offset).toBe(42);
  });

  it('enmascara el token en los errores', async () => {
    const fetchMock = jest
      .fn<Promise<Response>, [string, RequestInit?]>()
      .mockRejectedValue(new Error(`fallo en https://x/bot${TOKEN}/getMe`));
    const api = new TelegramApi(TOKEN, fetchMock as unknown as typeof fetch);
    const err = await api.getMe().catch((e: Error) => e);
    expect((err as Error).message).not.toContain(TOKEN);
    expect((err as Error).message).toContain('***');
  });

  it('enmascara el token cuando Telegram responde con error', async () => {
    const { api } = crear([
      respuestaJson(
        { ok: false, error_code: 401, description: `malo ${TOKEN}` },
        401,
      ),
    ]);
    const err = await api.getMe().catch((e: Error) => e);
    expect((err as Error).message).toContain('401');
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('divide textos largos y deja los botones en el último trozo', async () => {
    const largo = 'a'.repeat(4000) + ' ' + 'b'.repeat(1500);
    const { api, fetchMock } = crear([
      respuestaJson({ ok: true, result: {} }),
      respuestaJson({ ok: true, result: {} }),
    ]);
    await api.sendMessage('77', largo, [[{ texto: 'Sí', datos: 'si' }]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const c1 = cuerpoDe(fetchMock, 0);
    const c2 = cuerpoDe(fetchMock, 1);
    expect(c1.text.length).toBeLessThanOrEqual(4000);
    expect(c1.reply_markup).toBeUndefined();
    expect(c1.parse_mode).toBeUndefined();
    expect(c2.reply_markup).toEqual({
      inline_keyboard: [[{ text: 'Sí', callback_data: 'si' }]],
    });
  });

  it('dividirTexto no pierde caracteres', () => {
    const t = 'palabra '.repeat(1200);
    const partes = dividirTexto(t);
    expect(partes.every((p) => p.length <= 4000)).toBe(true);
    expect(partes.join(' ').replace(/\s+/g, '')).toBe(t.replace(/\s+/g, ''));
  });

  it('quita botones con un teclado vacío', async () => {
    const { api, fetchMock } = crear([
      respuestaJson({ ok: true, result: true }),
    ]);
    await api.quitarBotones('5', 9);
    expect(fetchMock.mock.calls[0][0]).toContain('/editMessageReplyMarkup');
    const c = cuerpoDe(fetchMock, 0);
    expect(c).toEqual({
      chat_id: '5',
      message_id: 9,
      reply_markup: { inline_keyboard: [] },
    });
  });

  it('setWebhook manda el secret_token', async () => {
    const { api, fetchMock } = crear([
      respuestaJson({ ok: true, result: true }),
    ]);
    await api.setWebhook(
      'https://x.test/telegram/webhook',
      'secreto-largo-1234',
    );
    const c = cuerpoDe(fetchMock, 0);
    expect(c.secret_token).toBe('secreto-largo-1234');
    expect(c.url).toBe('https://x.test/telegram/webhook');
  });

  it('descarga un archivo con getFile y la URL /file/bot', async () => {
    const { api, fetchMock } = crear([
      respuestaJson({
        ok: true,
        result: { file_path: 'photos/f.png', file_size: 3 },
      }),
      new Response(new Uint8Array([1, 2, 3])),
    ]);
    const r = await api.descargarArchivo('FID', 1000);
    expect(fetchMock.mock.calls[1][0]).toBe(
      `https://api.telegram.org/file/bot${TOKEN}/photos/f.png`,
    );
    expect(r.buffer.length).toBe(3);
    expect(r.mime).toBe('image/png');
  });

  it('rechaza archivos más grandes que el máximo', async () => {
    const { api } = crear([
      respuestaJson({
        ok: true,
        result: { file_path: 'a.jpg', file_size: 9999 },
      }),
    ]);
    await expect(api.descargarArchivo('FID', 100)).rejects.toThrow(/grande/);
  });
});
