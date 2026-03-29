import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // <- Esto hace que Prisma esté disponible en todo el proyecto sin tener que importarlo módulo por módulo
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // <- Exportamos el servicio
})
export class PrismaModule {}
