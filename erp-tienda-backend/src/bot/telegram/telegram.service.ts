import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { TelegramApi } from './telegram.api';
import { TelegramDespachador } from './telegram.despachador';
import { leerModo, type ModoTelegram, type TgUpdate } from './telegram.tipos';

const ESPERA_MIN_MS = 1000;
const ESPERA_MAX_MS = 60000;

/** Arranca y detiene el modo elegido (polling o webhook) según TELEGRAM_MODO. */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Telegram');
  private detenido = false;
  private abort: AbortController | null = null;
  private espera: { timer: NodeJS.Timeout; fin: () => void } | null = null;
  private ciclo: Promise<void> | null = null;
  modo: ModoTelegram = 'apagado';

  constructor(
    private readonly api: TelegramApi,
    private readonly despachador: TelegramDespachador,
  ) {}

  onModuleInit() {
    this.modo = leerModo();
    if (this.modo === 'apagado') return;
    if (!this.api.configurado) {
      this.logger.warn(
        'TELEGRAM_MODO está activo pero falta TELEGRAM_BOT_TOKEN: el bot queda apagado.',
      );
      this.modo = 'apagado';
      return;
    }
    if (this.modo === 'polling') {
      this.ciclo = this.cicloPolling();
    } else {
      void this.registrarWebhook();
    }
  }

  async onModuleDestroy() {
    this.detenido = true;
    this.abort?.abort();
    if (this.espera) {
      clearTimeout(this.espera.timer);
      this.espera.fin();
    }
    await this.ciclo;
  }

  /** Entrada del webhook: responde ya; el proceso sigue aparte. */
  recibirWebhook(update: TgUpdate) {
    void this.despachador.procesar(update);
  }

  private async registrarWebhook() {
    const url = (process.env.TELEGRAM_WEBHOOK_URL ?? '').trim();
    if (!url) {
      this.logger.warn(
        'Modo webhook sin TELEGRAM_WEBHOOK_URL: no se registró el webhook en Telegram.',
      );
      return;
    }
    try {
      await this.api.setWebhook(url, process.env.TELEGRAM_WEBHOOK_SECRET ?? '');
      this.logger.log('Webhook de Telegram registrado.');
    } catch (err) {
      this.logger.error(
        `No se pudo registrar el webhook: ${this.mensaje(err)}`,
      );
    }
  }

  private async cicloPolling() {
    let espera = ESPERA_MIN_MS;
    let offset: number | undefined;
    let listo = false;
    while (!this.detenido) {
      try {
        if (!listo) {
          // Con un webhook activo, getUpdates falla: se quita primero.
          await this.api.deleteWebhook();
          listo = true;
          this.logger.log('Bot de Telegram escuchando (polling).');
        }
        this.abort = new AbortController();
        const updates = await this.api.getUpdates(offset, this.abort.signal);
        espera = ESPERA_MIN_MS;
        for (const u of updates) {
          offset = u.update_id + 1;
          void this.despachador.procesar(u);
        }
      } catch (err) {
        if (this.detenido) break;
        this.logger.error(
          `Fallo en polling (reintento en ${espera / 1000} s): ${this.mensaje(err)}`,
        );
        await this.dormir(espera);
        espera = Math.min(espera * 2, ESPERA_MAX_MS);
      }
    }
  }

  private dormir(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.espera = null;
        resolve();
      }, ms);
      this.espera = { timer, fin: resolve };
    });
  }

  private mensaje(err: unknown): string {
    const msg = err instanceof Error ? err.message : 'error desconocido';
    return this.api.enmascarar(msg);
  }
}
