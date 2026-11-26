import { Module } from '@nestjs/common';
import { BotNucleoModule } from './nucleo/bot-nucleo.module';
import { TelegramModule } from './telegram/telegram.module';

/** Chat de Telegram para registrar compras (ver docs/operations/configuration.md). */
@Module({
  imports: [BotNucleoModule, TelegramModule],
})
export class BotModule {}
