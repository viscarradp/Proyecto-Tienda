import { Module } from '@nestjs/common';
import { ComprasModule } from '../../compras/compras.module';
import { PresentacionesModule } from '../../presentaciones/presentaciones.module';
import { ProductosModule } from '../../productos/productos.module';
import { AliasService } from './alias.service';
import { BotNucleoService } from './bot-nucleo.service';
import { BOT_NUCLEO } from './contrato';
import { CLIENTE_LLM } from './llm/cliente-llm';
import { OpenRouterCliente } from './llm/openrouter.cliente';

/**
 * Núcleo del bot de compras. Provee `BOT_NUCLEO` (ver contrato.ts) para los
 * adaptadores de chat. PrismaService es global.
 */
@Module({
  imports: [ComprasModule, ProductosModule, PresentacionesModule],
  providers: [
    AliasService,
    { provide: CLIENTE_LLM, useClass: OpenRouterCliente },
    { provide: BOT_NUCLEO, useClass: BotNucleoService },
  ],
  exports: [BOT_NUCLEO],
})
export class BotNucleoModule {}
