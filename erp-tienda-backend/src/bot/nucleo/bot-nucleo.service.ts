import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ComprasService } from '../../compras/compras.service';
import { ProductosService } from '../../productos/productos.service';
import { PresentacionesService } from '../../presentaciones/presentaciones.service';
import { CreateCompraDto } from '../../compras/dto/create-compra.dto';
import { AliasService, normalizarTexto } from './alias.service';
import {
  Borrador,
  ORIGENES_PAGO,
  OrigenPago,
  validarSalidaModelo,
} from './borrador';
import { Catalogo, cargarCatalogo } from './catalogo';
import { AccionBot, BotNucleo, EntradaBot, RespuestaBot } from './contrato';
import { redondearA } from './conversion';
import { CLIENTE_LLM, ErrorLlm } from './llm/cliente-llm';
import type { ClienteLlm, MensajeLlm, ParteLlm } from './llm/cliente-llm';
import { PROMPT_SISTEMA, TEXTO_SOLO_FOTO } from './prompt';
import {
  BOTON_CANCELAR,
  convertirLotes,
  dinero,
  evaluarBorrador,
  recortar,
  respuestaBorrador,
} from './resumen';

const HORAS_VIDA_BORRADOR = 24;
const MINUTOS_PARA_DESHACER = 10;
const MAX_BASE64 = 10_000_000;
const MOTIVO_DESHACER = 'Deshecho desde Telegram';

const MSG_NO_PUDE = 'No pude leer eso ahora, intenta de nuevo en un momento.';
const MSG_AYUDA =
  'Cuéntame qué compraste, por ejemplo: "Compré 2 cajas de coca de lata a 20 cada una y 10 libras de frijol en 8 dólares, a La Fuente, lo pagué de la gaveta". También puedes mandarme la foto de la factura. Con /cancelar descarto lo que llevamos.';

const ORIGEN_A_COMPRA: Record<
  OrigenPago,
  { estado_pago: string; origen_fondos?: string }
> = {
  GAVETA: { estado_pago: 'PAGADO', origen_fondos: 'CAJA_POS' },
  BOVEDA: { estado_pago: 'PAGADO', origen_fondos: 'CAJA_GENERAL' },
  CAPITAL: { estado_pago: 'PAGADO', origen_fondos: 'CAPITAL_DUEÑOS' },
  CREDITO: { estado_pago: 'AL_CREDITO' },
};

interface Conversacion {
  borrador: Borrador;
  estado: string;
}

/**
 * Núcleo del bot de compras: flujo controlado por código. El modelo solo
 * interpreta (devuelve un borrador); el código valida, guarda el estado y,
 * solo cuando la dueña confirma, llama a los servicios existentes.
 */
@Injectable()
export class BotNucleoService implements BotNucleo {
  private readonly logger = new Logger(BotNucleoService.name);
  /** Una cola por chat: dos mensajes seguidos no se pisan el borrador. */
  private readonly colas = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly compras: ComprasService,
    private readonly productos: ProductosService,
    private readonly presentaciones: PresentacionesService,
    private readonly alias: AliasService,
    @Inject(CLIENTE_LLM) private readonly llm: ClienteLlm,
  ) {}

  recibirMensaje(e: EntradaBot): Promise<RespuestaBot> {
    return this.enCola(e.chatId, () => this.procesarMensaje(e));
  }

  recibirAccion(a: AccionBot): Promise<RespuestaBot> {
    return this.enCola(a.chatId, () => this.procesarAccion(a));
  }

  // ── Infraestructura ───────────────────────────────────────────────────────

  private enCola(
    chatId: string,
    fn: () => Promise<RespuestaBot>,
  ): Promise<RespuestaBot> {
    const anterior = this.colas.get(chatId) ?? Promise.resolve();
    const siguiente = anterior
      .catch(() => undefined)
      .then(async () => {
        try {
          return await fn();
        } catch (err) {
          this.logger.error(
            `Error en el bot: ${err instanceof Error ? err.message : 'desconocido'}`,
          );
          return { texto: MSG_NO_PUDE };
        }
      });
    this.colas.set(chatId, siguiente);
    void siguiente.then(() => {
      if (this.colas.get(chatId) === siguiente) this.colas.delete(chatId);
    });
    return siguiente;
  }

  private async esDuena(usuarioId: number): Promise<boolean> {
    const u = await this.prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: { rol: true, activo: true },
    });
    return !!u && u.activo && u.rol === 'ADMIN';
  }

  private async cargarConversacion(
    chatId: string,
    usuarioId: number,
  ): Promise<Conversacion | null> {
    const fila = await this.prisma.bot_conversaciones.findUnique({
      where: { chat_id: chatId },
    });
    if (!fila) return null;
    const vieja =
      Date.now() - fila.actualizado_en.getTime() >
      HORAS_VIDA_BORRADOR * 3600_000;
    if (vieja || fila.usuario_id !== usuarioId) {
      await this.prisma.bot_conversaciones.deleteMany({
        where: { chat_id: chatId },
      });
      return null;
    }
    // Un "guardando" de hace minutos quedó colgado (se cayó el servidor): se libera.
    let estado = fila.estado;
    if (
      estado === 'GUARDANDO' &&
      Date.now() - fila.actualizado_en.getTime() > 2 * 60_000
    ) {
      estado = 'BORRADOR';
      await this.prisma.bot_conversaciones.updateMany({
        where: { chat_id: chatId },
        data: { estado },
      });
    }
    return { borrador: fila.borrador as unknown as Borrador, estado };
  }

  private async guardarConversacion(
    chatId: string,
    usuarioId: number,
    borrador: Borrador,
    estado = 'BORRADOR',
  ): Promise<void> {
    const json = borrador as unknown as Prisma.InputJsonValue;
    await this.prisma.bot_conversaciones.upsert({
      where: { chat_id: chatId },
      create: {
        chat_id: chatId,
        usuario_id: usuarioId,
        borrador: json,
        estado,
      },
      update: { usuario_id: usuarioId, borrador: json, estado },
    });
  }

  private descartar(chatId: string) {
    return this.prisma.bot_conversaciones.deleteMany({
      where: { chat_id: chatId },
    });
  }

  // ── Mensajes ──────────────────────────────────────────────────────────────

  private async procesarMensaje(e: EntradaBot): Promise<RespuestaBot> {
    if (!(await this.esDuena(e.usuarioId))) {
      return { texto: 'Esto lo hace la dueña (administradora).' };
    }
    const texto = (e.texto ?? '').trim();
    const norm = normalizarTexto(texto);

    if (norm === 'cancelar' || norm.startsWith('/cancelar')) {
      await this.descartar(e.chatId);
      return {
        texto: 'Listo, descarté la compra. Cuando quieras, cuéntame otra.',
      };
    }
    if (
      !e.imagen &&
      (texto === '' || norm.startsWith('/start') || norm.startsWith('/ayuda'))
    ) {
      return { texto: MSG_AYUDA };
    }
    if (e.imagen && e.imagen.base64.length > MAX_BASE64) {
      return {
        texto:
          'La foto es muy pesada. Mándala más chica o escríbeme lo que compraste.',
      };
    }

    const conv = await this.cargarConversacion(e.chatId, e.usuarioId);
    if (conv?.estado === 'GUARDANDO') {
      return { texto: 'Estoy guardando la compra, espera un momento.' };
    }
    const previo = conv?.borrador ?? null;
    const catalogo = await cargarCatalogo(this.prisma);

    let nuevo: Borrador | null;
    try {
      nuevo = await this.interpretar(e, texto, previo, catalogo);
    } catch (err) {
      if (err instanceof ErrorLlm) {
        this.logger.warn(`La IA falló: ${err.message}`);
        return { texto: MSG_NO_PUDE };
      }
      throw err;
    }
    if (!nuevo) return { texto: MSG_NO_PUDE };

    nuevo = await this.aplicarAlias(nuevo, previo, catalogo);
    const unido = unirBorradores(previo, nuevo);
    await this.guardarConversacion(e.chatId, e.usuarioId, unido);
    return respuestaBorrador(unido, catalogo);
  }

  /** Pide el borrador al modelo; si la forma no es válida, reintenta una vez. */
  private async interpretar(
    e: EntradaBot,
    texto: string,
    previo: Borrador | null,
    catalogo: Catalogo,
  ): Promise<Borrador | null> {
    const memoria = (await this.alias.masUsados(200)).filter((a) =>
      catalogo.tienePresentacion(a.presentacion_id),
    );
    const bloque = [
      'CATALOGO (producto: [id "presentación" xfactor $precio cb:código]):',
      catalogo.paraPrompt(),
      '',
      'MEMORIA DE EQUIVALENCIAS (como lo escribe ella -> id de presentación):',
      memoria.length === 0
        ? '(vacía)'
        : memoria
            .map(
              (a) =>
                `"${a.texto_normalizado}"${a.proveedor ? ` (proveedor ${a.proveedor})` : ''} -> ${a.presentacion_id}`,
            )
            .join('\n'),
      '',
      'BORRADOR ACTUAL:',
      previo ? JSON.stringify(previo) : '(ninguno)',
      '',
      '<<<MENSAJE>>>',
      (texto || TEXTO_SOLO_FOTO).replaceAll('<<<', '').replaceAll('>>>', ''),
      '<<<FIN>>>',
    ].join('\n');

    const partes: ParteLlm[] = [{ type: 'text', text: bloque }];
    if (e.imagen) {
      partes.push({
        type: 'image_url',
        image_url: { url: `data:${e.imagen.mime};base64,${e.imagen.base64}` },
      });
    }
    let mensajes: MensajeLlm[] = [
      { role: 'system', content: PROMPT_SISTEMA },
      { role: 'user', content: partes },
    ];

    for (let intento = 0; intento < 2; intento++) {
      const crudo = await this.llm.interpretar(mensajes, {
        vision: !!e.imagen,
      });
      const v = validarSalidaModelo(crudo, catalogo);
      if (v.ok) {
        for (const adv of v.advertencias) this.logger.warn(adv);
        return v.borrador;
      }
      this.logger.warn(`Respuesta de la IA no válida: ${v.error}`);
      mensajes = [
        ...mensajes,
        { role: 'assistant', content: crudo.slice(0, 4000) },
        {
          role: 'user',
          content: `Tu respuesta no es válida: ${v.error}. Devuelve SOLO el JSON corregido, con la forma exacta indicada.`,
        },
      ];
    }
    return null;
  }

  /**
   * Si el texto de una línea coincide EXACTAMENTE con un alias, el código fija
   * la presentación aunque el modelo dude. Excepción: en una corrección, si la
   * dueña ya tenía esa línea con otra presentación y el modelo la cambió a
   * propósito, se respeta el cambio.
   */
  private async aplicarAlias(
    nuevo: Borrador,
    previo: Borrador | null,
    catalogo: Catalogo,
  ): Promise<Borrador> {
    const exactos = await this.alias.buscarExactos(
      nuevo.lineas.map((l) => l.texto_original),
      nuevo.proveedor ?? previo?.proveedor ?? null,
    );
    if (exactos.size === 0) return nuevo;
    const previas = new Map<string, number | null>();
    for (const l of previo?.lineas ?? []) {
      previas.set(normalizarTexto(l.texto_original), l.presentacion_id);
    }
    const lineas = nuevo.lineas.map((l) => {
      const clave = normalizarTexto(l.texto_original);
      const id = exactos.get(clave);
      if (id === undefined || !catalogo.tienePresentacion(id)) return l;
      const antes = previas.get(clave);
      const corregidaAPropósito =
        antes !== undefined &&
        antes !== null &&
        l.presentacion_id !== null &&
        l.presentacion_id !== antes;
      if (corregidaAPropósito) return l;
      return { ...l, presentacion_id: id, confianza: 'alta' as const };
    });
    return { ...nuevo, lineas };
  }

  // ── Botones ───────────────────────────────────────────────────────────────

  private async procesarAccion(a: AccionBot): Promise<RespuestaBot> {
    if (!(await this.esDuena(a.usuarioId))) {
      return { texto: 'Esto lo hace la dueña (administradora).' };
    }
    const [accion, param] = a.datos.split(':');

    if (accion === 'deshacer') return this.deshacer(a, Number(param));
    if (accion === 'cancelar') {
      await this.descartar(a.chatId);
      return { texto: 'Listo, descarté la compra.' };
    }
    if (accion !== 'pago' && accion !== 'guardar') {
      return { texto: 'No entendí ese botón. Escríbeme lo que compraste.' };
    }

    const conv = await this.cargarConversacion(a.chatId, a.usuarioId);
    if (!conv) {
      return {
        texto: 'No tengo ninguna compra pendiente. Cuéntame qué compraste.',
      };
    }
    if (conv.estado === 'GUARDANDO') {
      return { texto: 'Ya la estoy guardando, espera un momento.' };
    }
    const catalogo = await cargarCatalogo(this.prisma);

    if (accion === 'pago') {
      if (!ORIGENES_PAGO.includes(param as OrigenPago)) {
        return { texto: 'No entendí ese botón. Escríbeme cómo pagaste.' };
      }
      const borrador: Borrador = {
        ...conv.borrador,
        origen_pago: param as OrigenPago,
      };
      await this.guardarConversacion(a.chatId, a.usuarioId, borrador);
      return respuestaBorrador(borrador, catalogo);
    }
    return this.guardar(a, conv.borrador, catalogo);
  }

  private async guardar(
    a: AccionBot,
    borrador: Borrador,
    catalogo: Catalogo,
  ): Promise<RespuestaBot> {
    if (!evaluarBorrador(borrador, catalogo).completo) {
      return respuestaBorrador(borrador, catalogo);
    }

    // Se reclama el borrador: un segundo toque del botón no guarda dos veces.
    const reclamado = await this.prisma.bot_conversaciones.updateMany({
      where: { chat_id: a.chatId, estado: 'BORRADOR' },
      data: { estado: 'GUARDANDO' },
    });
    if (reclamado.count === 0) {
      return { texto: 'Ya la estoy guardando, espera un momento.' };
    }

    let actual = borrador;
    try {
      // 1. Productos nuevos (por revisar). Cada uno pasa a ser una línea y el
      //    borrador se guarda, para no duplicarlos si la compra falla.
      while (actual.productos_nuevos.length > 0) {
        const nuevo = actual.productos_nuevos[0];
        const presentacionId = await this.crearProductoNuevo(nuevo);
        actual = {
          ...actual,
          productos_nuevos: actual.productos_nuevos.slice(1),
          lineas: [
            ...actual.lineas,
            {
              texto_original: nuevo.texto_original,
              presentacion_id: presentacionId,
              cantidad: nuevo.cantidad,
              total_linea: nuevo.total_linea,
              precio_unitario: null,
              confianza: 'alta',
            },
          ],
        };
        await this.guardarConversacion(
          a.chatId,
          a.usuarioId,
          actual,
          'GUARDANDO',
        );
      }

      // 2. La compra, con la misma regla de la app (FIFO, avisos, autor).
      const cat = await cargarCatalogo(this.prisma);
      const lotes = convertirLotes(actual, cat);
      if (!lotes) throw new Error('El borrador no se pudo convertir');
      const pago = ORIGEN_A_COMPRA[actual.origen_pago!];
      const dto: CreateCompraDto = {
        proveedor: actual.proveedor!,
        estado_pago: pago.estado_pago,
        origen_fondos: pago.origen_fondos,
        detalles_lotes: lotes.map((l) => ({
          producto_id: l.productoId,
          costo_unitario_adquisicion: l.conversion.costoUnitario,
          cantidad_inicial: l.conversion.cantidadBase,
        })),
      };
      const compra = await this.compras.create(dto, a.usuarioId);

      await this.alias.registrar(actual, a.usuarioId);
      try {
        await this.descartar(a.chatId);
      } catch (e) {
        // La compra ya quedó guardada: no se reporta como falla.
        this.logger.warn(
          `No se pudo limpiar el borrador: ${e instanceof Error ? e.message : 'error'}`,
        );
      }

      const avisos = (compra as { avisos?: string[] }).avisos ?? [];
      const texto = [
        `Listo: compra #${compra.id} por ${dinero(Number(compra.monto_total))}.`,
        ...avisos,
      ].join('\n');
      return {
        texto: recortar(texto),
        botones: [[{ texto: 'Deshacer', datos: `deshacer:${compra.id}` }]],
      };
    } catch (err) {
      const { texto, quitarPago } = this.traducirError(err, actual);
      const restaurado: Borrador = quitarPago
        ? { ...actual, origen_pago: null }
        : actual;
      await this.guardarConversacion(a.chatId, a.usuarioId, restaurado);
      if (quitarPago) {
        const r = respuestaBorrador(
          restaurado,
          await cargarCatalogo(this.prisma),
        );
        return { ...r, texto: recortar(`${texto}\n\n${r.texto}`) };
      }
      return { texto, botones: [[BOTON_CANCELAR]] };
    }
  }

  /** Crea el producto "por revisar" y devuelve la presentación que se compró. */
  private async crearProductoNuevo(
    n: Borrador['productos_nuevos'][number],
  ): Promise<number> {
    const precio = n.precio_venta ?? 0.01;
    const producto = await this.productos.createRapido({
      nombre: n.nombre,
      precio_venta: precio,
      descripcion: n.factor === 1 ? n.descripcion_presentacion : 'Unidad',
    });
    const unidad = producto.presentaciones[0];
    if (n.factor === 1) return unidad.id;
    const creada = await this.presentaciones.create({
      producto_id: producto.id,
      descripcion: n.descripcion_presentacion,
      factor_conversion: n.factor,
      precio_venta: Math.min(redondearA(precio * n.factor, 2), 999999.99),
    });
    return creada!.id;
  }

  private traducirError(
    err: unknown,
    borrador: Borrador,
  ): { texto: string; quitarPago: boolean } {
    if (err instanceof HttpException) {
      const r = err.getResponse();
      const m =
        typeof r === 'string' ? r : (r as { message?: unknown }).message;
      const msg = Array.isArray(m)
        ? m.join(' ')
        : typeof m === 'string'
          ? m
          : err.message;
      if (borrador.origen_pago === 'GAVETA' && /turno abierto/i.test(msg)) {
        return {
          texto: 'No hay caja abierta. ¿La pagaste de la bóveda o quedó fiada?',
          quitarPago: true,
        };
      }
      return {
        texto: `No pude guardar la compra: ${msg}\nTu borrador sigue aquí; corrígelo o toca Cancelar.`,
        quitarPago: false,
      };
    }
    this.logger.error(
      `Falló el guardado: ${err instanceof Error ? err.message : 'desconocido'}`,
    );
    return {
      texto:
        'No pude guardar la compra ahora. Tu borrador sigue aquí; intenta de nuevo en un momento.',
      quitarPago: false,
    };
  }

  private async deshacer(
    a: AccionBot,
    compraId: number,
  ): Promise<RespuestaBot> {
    if (!Number.isInteger(compraId))
      return { texto: 'No encuentro esa compra.' };
    const compra = await this.prisma.compras_inventario.findUnique({
      where: { id: compraId },
    });
    if (!compra || compra.usuario_id !== a.usuarioId) {
      return { texto: 'No encuentro esa compra entre las tuyas.' };
    }
    if (compra.anulado) {
      return { texto: `La compra #${compraId} ya estaba deshecha.` };
    }
    const minutos = (Date.now() - (compra.fecha?.getTime() ?? 0)) / 60_000;
    if (minutos > MINUTOS_PARA_DESHACER) {
      return {
        texto: `Ya pasaron más de ${MINUTOS_PARA_DESHACER} minutos. Para corregir la compra #${compraId}, entra a la app.`,
      };
    }
    try {
      const r = await this.compras.anular(
        compraId,
        MOTIVO_DESHACER,
        a.usuarioId,
      );
      const avisos = (r as { avisos?: string[] }).avisos ?? [];
      return {
        texto: recortar(
          [`Listo, deshice la compra #${compraId}.`, ...avisos].join('\n'),
        ),
      };
    } catch (err) {
      if (err instanceof HttpException) {
        return { texto: `No pude deshacerla: ${err.message}` };
      }
      throw err;
    }
  }
}

/** Une la interpretación nueva con el borrador anterior (si lo había). */
export function unirBorradores(
  previo: Borrador | null,
  nuevo: Borrador,
): Borrador {
  if (!previo) return nuevo;
  const trajoProductos =
    nuevo.lineas.length > 0 || nuevo.productos_nuevos.length > 0;
  return {
    proveedor: nuevo.proveedor ?? previo.proveedor,
    origen_pago: nuevo.origen_pago ?? previo.origen_pago,
    lineas: trajoProductos ? nuevo.lineas : previo.lineas,
    productos_nuevos: trajoProductos
      ? nuevo.productos_nuevos
      : previo.productos_nuevos,
    total_factura: nuevo.total_factura ?? previo.total_factura,
    preguntas: nuevo.preguntas,
  };
}
