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

export function normalizarPaquete(descripcion: string): string {
  return normalizarTexto(descripcion).slice(0, 50);
}

/** Texto de una línea a buscar en la memoria: lo que escribió y su paquete (si lo hay). */
export interface ClaveAlias {
  texto: string;
  paquete: string | null;
}

export function claveAlias(texto: string, paquete: string | null): string {
  return `${normalizarTexto(texto)}|${paquete ? normalizarPaquete(paquete) : ''}`;
}

export function claveUnidades(
  texto: string,
  paquete: string,
  presentacionId: number,
): string {
  return `${claveAlias(texto, paquete)}|${presentacionId}`;
}

export interface AliasRecordado {
  texto_normalizado: string;
  proveedor: string | null;
  presentacion_id: number;
  usos: number;
  paquete: string | null;
  unidades_paquete: number | null;
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
    const filas = await this.prisma.bot_alias.findMany({
      orderBy: [{ usos: 'desc' }, { id: 'desc' }],
      take: limite,
      select: {
        texto_normalizado: true,
        proveedor: true,
        presentacion_id: true,
        usos: true,
        paquete: true,
        unidades_paquete: true,
      },
    });
    return filas.map((f) => ({
      ...f,
      unidades_paquete:
        f.unidades_paquete === null ? null : Number(f.unidades_paquete),
    }));
  }

  /** Filas de memoria de esos textos, las más usadas primero. */
  private async filasDe(textos: string[]) {
    const normalizados = [...new Set(textos.map(normalizarTexto))].filter(
      (t) => t !== '',
    );
    if (normalizados.length === 0) return [];
    return this.prisma.bot_alias.findMany({
      where: { texto_normalizado: { in: normalizados } },
      orderBy: [{ usos: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * Cuántas trae cada paquete, según lo ya confirmado: mismo texto + mismo
   * paquete + misma presentación; primero el del mismo proveedor, luego el de
   * más usos. La clave del resultado es `claveUnidades`.
   */
  async buscarUnidadesPaquete(
    lineas: { texto: string; paquete: string; presentacionId: number }[],
    proveedor: string | null,
  ): Promise<Map<string, number>> {
    const resultado = new Map<string, number>();
    if (lineas.length === 0) return resultado;
    const filas = (await this.filasDe(lineas.map((l) => l.texto))).filter(
      (f) => f.paquete !== null && f.unidades_paquete !== null,
    );
    const prov = proveedor ? normalizarTexto(proveedor) : null;
    for (const l of lineas) {
      const t = normalizarTexto(l.texto);
      const p = normalizarPaquete(l.paquete);
      const candidatas = filas.filter(
        (f) =>
          f.texto_normalizado === t &&
          f.paquete === p &&
          f.presentacion_id === l.presentacionId,
      );
      const elegida =
        candidatas.find((f) => prov !== null && f.proveedor === prov) ??
        candidatas[0];
      if (elegida) {
        resultado.set(
          claveUnidades(l.texto, l.paquete, l.presentacionId),
          Number(elegida.unidades_paquete),
        );
      }
    }
    return resultado;
  }

  /**
   * Para cada línea, la presentación que mejor le queda: el alias del mismo
   * proveedor primero, luego el más usado. Solo cuenta la memoria con el mismo
   * paquete (o sin paquete, si la línea no lo trae). La clave del resultado es
   * `claveAlias`.
   */
  async buscarExactos(
    claves: ClaveAlias[],
    proveedor: string | null,
  ): Promise<Map<string, number>> {
    const resultado = new Map<string, number>();
    const filas = await this.filasDe(claves.map((c) => c.texto));
    const prov = proveedor ? normalizarTexto(proveedor) : null;
    for (const c of claves) {
      const t = normalizarTexto(c.texto);
      const p = c.paquete ? normalizarPaquete(c.paquete) : null;
      const delTexto = filas.filter(
        (f) => f.texto_normalizado === t && f.paquete === p,
      );
      const elegido =
        delTexto.find((f) => prov !== null && f.proveedor === prov) ??
        delTexto[0];
      if (elegido) {
        resultado.set(claveAlias(c.texto, c.paquete), elegido.presentacion_id);
      }
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
      const paquete = l.paquete
        ? normalizarPaquete(l.paquete.descripcion)
        : null;
      const unidades = l.paquete?.unidades ?? null;
      try {
        const existente = await this.prisma.bot_alias.findFirst({
          where: {
            texto_normalizado: texto,
            presentacion_id: l.presentacion_id,
            proveedor,
            paquete,
          },
        });
        if (existente) {
          await this.prisma.bot_alias.update({
            where: { id: existente.id },
            data: {
              usos: { increment: 1 },
              // Queda el último valor confirmado.
              ...(paquete !== null && unidades !== null
                ? { unidades_paquete: unidades }
                : {}),
            },
          });
        } else {
          await this.prisma.bot_alias.create({
            data: {
              texto_normalizado: texto,
              proveedor,
              presentacion_id: l.presentacion_id,
              paquete,
              unidades_paquete: paquete !== null ? unidades : null,
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
