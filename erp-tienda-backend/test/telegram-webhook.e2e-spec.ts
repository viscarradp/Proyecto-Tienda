import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { BOT_NUCLEO } from './../src/bot/nucleo/contrato';
import { TelegramApi } from './../src/bot/telegram/telegram.api';

const SECRETO = 'secreto-de-prueba-123456';

describe('POST /telegram/webhook (e2e)', () => {
  let app: INestApplication;
  const nucleo = {
    recibirMensaje: jest.fn().mockResolvedValue({ texto: 'listo' }),
    recibirAccion: jest.fn().mockResolvedValue({ texto: 'hecho' }),
  };
  const fetchFalso = jest.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ ok: true, result: true }))),
  );
  const envPrevio = { ...process.env };

  beforeAll(async () => {
    process.env.TELEGRAM_MODO = 'webhook';
    process.env.TELEGRAM_BOT_TOKEN = '999:token-de-prueba';
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRETO;
    delete process.env.TELEGRAM_WEBHOOK_URL;
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BOT_NUCLEO)
      .useValue(nucleo)
      .overrideProvider(TelegramApi)
      .useValue(
        new TelegramApi(
          '999:token-de-prueba',
          fetchFalso as unknown as typeof fetch,
        ),
      )
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    // El admin sembrado se llama "admin"; el e2e lo autoriza como usuario de Telegram.
    process.env.TELEGRAM_USUARIOS = '4242:admin';
  });

  afterAll(async () => {
    await app.close();
    for (const k of [
      'TELEGRAM_MODO',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_WEBHOOK_SECRET',
      'TELEGRAM_USUARIOS',
    ]) {
      if (envPrevio[k] === undefined) delete process.env[k];
      else process.env[k] = envPrevio[k];
    }
  });

  const update = {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: 4242 },
      chat: { id: 4242, type: 'private' },
      text: '5 libras de frijol',
    },
  };

  it('sin secreto -> 401', async () => {
    await request(app.getHttpServer())
      .post('/telegram/webhook')
      .send(update)
      .expect(401);
    await request(app.getHttpServer())
      .post('/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'incorrecto')
      .send(update)
      .expect(401);
    expect(nucleo.recibirMensaje).not.toHaveBeenCalled();
  });

  it('con el secreto correcto -> 200 y llama al núcleo', async () => {
    await request(app.getHttpServer())
      .post('/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', SECRETO)
      .send(update)
      .expect(200);
    for (
      let i = 0;
      i < 50 && nucleo.recibirMensaje.mock.calls.length === 0;
      i++
    ) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(nucleo.recibirMensaje).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: '4242', texto: '5 libras de frijol' }),
    );
  });
});
