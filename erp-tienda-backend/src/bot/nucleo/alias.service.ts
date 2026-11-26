import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Borrador } from './borrador';

/** Minúsculas, sin tildes, espacios simples. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export interface AliasRecordado {
  texto_normalizado: string;
  proveedor: string | null;
  presentacion_id: number;
  usos: number;
}

/**
 * Memoria de equivalencias: lo que la dueña escribe ("coca de lata") →
 * presentación del catálogo. Se refuerza al guardar una compra.
 */
@Injectable()
export class AliasService {
  private readonly logger = new Logger(AliasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Los más usados, para dárselos al modelo como contexto. */
  async masUsados(limite = 200): Promise<AliasRecordado[]> {
    return this.prisma.bot_alias.findMany({
      orderBy: [{ usos: 'desc' }, { id: 'desc' }],
      take: limite,
      select: {
        texto_normalizado: true,
        proveedor: true,
        presentacion_id: true,
        usos: true,
      },
    });
  }

  /**
   * Para cada texto, el alias que mejor le queda: el del mismo proveedor
   * primero, luego el más usado. Solo entre los textos pedidos.
   */
  async buscarExactos(
    textos: string[],
    proveedor: string | null,
  ): Promise<Map<string, number>> {
    const normalizados = [...new Set(textos.map(normalizarTexto))].filter(
      (t) => t !== '',
    );
    const resultado = new Map<string, number>();
    if (normalizados.length === 0) return resultado;
    const filas = await this.prisma.bot_alias.findMany({
      where: { texto_normalizado: { in: normalizados } },
      orderBy: [{ usos: 'desc' }, { id: 'desc' }],
    });
    const prov = proveedor ? normalizarTexto(proveedor) : null;
    for (const t of normalizados) {
      const delTexto = filas.filter((f) => f.texto_normalizado === t);
      const elegido =
        delTexto.find((f) => prov !== null && f.proveedor === prov) ??
        delTexto[0];
      if (elegido) resultado.set(t, elegido.presentacion_id);
    }
    return resultado;
  }

  /** Guarda o refuerza el alias de cada línea de una compra ya guardada. */
  async registrar(borrador: Borrador, usuarioId: number): Promise<void> {
    const proveedor = borrador.proveedor
      ? normalizarTexto(borrador.proveedor)
      : null;
    for (const l of borrador.lineas) {
      if (l.presentacion_id === null) continue;
      const texto = normalizarTexto(l.texto_original);
      if (texto === '') continue;
      try {
        const existente = await this.prisma.bot_alias.findFirst({
          where: {
            texto_normalizado: texto,
            presentacion_id: l.presentacion_id,
            proveedor,
          },
        });
        if (existente) {
          await this.prisma.bot_alias.update({
            where: { id: existente.id },
            data: { usos: { increment: 1 } },
          });
        } else {
          await this.prisma.bot_alias.create({
            data: {
              texto_normalizado: texto,
              proveedor,
              presentacion_id: l.presentacion_id,
              creado_por_id: usuarioId,
            },
          });
        }
      } catch (e) {
        // La memoria es una ayuda: nunca debe tumbar el guardado.
        this.logger.warn(
          `No se pudo guardar el alias "${texto}": ${e instanceof Error ? e.message : 'error'}`,
        );
      }
    }
  }
}
