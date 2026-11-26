import {
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'crypto';
import { Public } from '../../auth/decorators/public.decorator';
import { TelegramService } from './telegram.service';
import type { TgUpdate } from './telegram.tipos';

function igual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly servicio: TelegramService) {}

  /** Webhook de Telegram: público, protegido por el secreto del encabezado. */
  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Headers('x-telegram-bot-api-secret-token') secreto: string | undefined,
    @Body() update: TgUpdate,
  ) {
    if (this.servicio.modo !== 'webhook') throw new NotFoundException();
    const esperado = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
    if (!esperado || !secreto || !igual(secreto, esperado)) {
      throw new UnauthorizedException();
    }
    this.servicio.recibirWebhook(update);
    return { ok: true };
  }
}
