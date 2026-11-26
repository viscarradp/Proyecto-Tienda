import { Module } from '@nestjs/common';
import { BotNucleoModule } from '../nucleo/bot-nucleo.module';
import { TelegramApi } from './telegram.api';
import { TelegramController } from './telegram.controller';
import { TelegramDespachador } from './telegram.despachador';
import { TelegramService } from './telegram.service';

@Module({
  imports: [BotNucleoModule],
  controllers: [TelegramController],
  providers: [
    {
      provide: TelegramApi,
      useFactory: () => new TelegramApi(process.env.TELEGRAM_BOT_TOKEN ?? ''),
    },
    TelegramDespachador,
    TelegramService,
  ],
})
export class TelegramModule {}
