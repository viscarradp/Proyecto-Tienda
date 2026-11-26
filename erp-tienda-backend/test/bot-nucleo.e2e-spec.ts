import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BotNucleoModule } from '../src/bot/nucleo/bot-nucleo.module';
import {
  BOT_NUCLEO,
  BotNucleo,
  RespuestaBot,
} from '../src/bot/nucleo/contrato';
import {
  CLIENTE_LLM,
  ClienteLlm,
  ErrorLlm,
  MensajeLlm,
} from '../src/bot/nucleo/llm/cliente-llm';
import { ensureNoOpenShift, loginAsAdmin } from './helpers/e2e-setup';

interface WithId {
  id: number;
}

/** Cliente de IA falso: respuestas fijas, sin red. */
class LlmFalso implements ClienteLlm {
  cola: (string | Error)[] = [];
  llamadas: MensajeLlm[][] = [];
  interpretar(mensajes: MensajeLlm[]): Promise<string> {
    this.llamadas.push(mensajes);
    const siguiente = this.cola.shift();
    if (siguiente === undefined) return Promise.reject(new Error('sin cola'));
    if (siguiente instanceof Error) return Promise.reject(siguiente);
    return Promise.resolve(siguiente);
  }
}

function json(o: Record<string, unknown>): string {
  return JSON.stringify({
    proveedor: null,
    origen_pago: null,
    lineas: [],
    productos_nuevos: [],
    total_factura: null,
    preguntas: [],
    ...o,
  });
}

describe('Núcleo del bot de compras (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let bot: BotNucleo;
  let admin: string;
  let usuarioId: number;
  const llm = new LlmFalso();
  const sufijo = Date.now();
  const chatId = `chat-${sufijo}`;

  let cocaCaja: number; // presentación Caja ×24
  let cocaUnidad: number;
  let cocaProductoId: number;
  let frijolLibra: number;
  let frijolProductoId: number;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${admin}` });
  const msg = (texto: string): Promise<RespuestaBot> =>
    bot.recibirMensaje({ chatId, usuarioId, texto });
  const accion = (datos: string): Promise<RespuestaBot> =>
    bot.recibirAccion({ chatId, usuarioId, datos });
  const datosBotones = (r: RespuestaBot) =>
    (r.botones ?? []).flat().map((b) => b.datos);

  async function crearProducto(
    nombre: string,
    presentaciones: { descripcion: string; factor: number; precio: number }[],
  ) {
    const cat = await http()
      .post('/categorias')
      .set(auth())
      .send({ nombre: `Bot-cat-${nombre}-${sufijo}` });
    const res = await http()
      .post('/productos')
      .set(auth())
      .send({
        nombre: `${nombre}-${sufijo}`,
        categoria_id: (cat.body as WithId).id,
        presentaciones: presentaciones.map((p) => ({
          descripcion: p.descripcion,
          factor_conversion: p.factor,
          precio_venta: p.precio,
        })),
      });
    expect(res.status).toBe(201);
    const body = res.body as WithId & { presentaciones: WithId[] };
    return {
      id: body.id,
      presentaciones: body.presentaciones.map((p) => p.id),
    };
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule, BotNucleoModule],
    })
      .overrideProvider(CLIENTE_LLM)
      .useValue(llm)
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    bot = app.get<BotNucleo>(BOT_NUCLEO);
    admin = await loginAsAdmin(app);
    await ensureNoOpenShift(app, admin);
    usuarioId = (
      await prisma.usuarios.findUniqueOrThrow({
        where: { nombre: 'admin' },
      })
    ).id;

    const coca = await crearProducto('Coca-Cola 355ml', [
      { descripcion: 'Unidad', factor: 1, precio: 1 },
      { descripcion: 'Caja', factor: 24, precio: 22 },
    ]);
    cocaProductoId = coca.id;
    [cocaUnidad, cocaCaja] = coca.presentaciones;
    const frijol = await crearProducto('Frijol rojo', [
      { descripcion: 'Libra', factor: 1, precio: 1 },
    ]);
    frijolProductoId = frijol.id;
    frijolLibra = frijol.presentaciones[0];
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    await prisma.bot_conversaciones.deleteMany({ where: { chat_id: chatId } });
    llm.cola = [];
  });

  const borradorDosLineas = () =>
    json({
      proveedor: 'La Fuente',
      lineas: [
        {
          texto_original: 'coca de lata',
          presentacion_id: cocaCaja,
          cantidad: 2,
          total_linea: 40,
          precio_unitario: null,
          confianza: 'alta',
        },
        {
          texto_original: 'frijol',
          presentacion_id: frijolLibra,
          cantidad: 10,
          total_linea: null,
          precio_unitario: 0.8,
          confianza: 'media',
        },
      ],
    });

  let compraId: number;

  it('1-3. mensaje → resumen → pago → guardar: unidades y costos convertidos', async () => {
    llm.cola.push(borradorDosLineas());
    const r1 = await msg(
      'Compré 2 cajas de coca de lata a 20 cada una y 10 libras de frijol en 8 dólares, a La Fuente',
    );
    expect(r1.texto).toContain('48 unidades a $0.8333');
    expect(r1.texto).toContain('10 unidades a $0.8000');
    expect(r1.texto).toContain('Total $48.00 · Proveedor: La Fuente');
    expect(datosBotones(r1)).toEqual(
      expect.arrayContaining(['pago:GAVETA', 'pago:BOVEDA', 'pago:CREDITO']),
    );
    expect(datosBotones(r1)).not.toContain('guardar');
    for (const d of datosBotones(r1)) {
      expect(Buffer.byteLength(d)).toBeLessThanOrEqual(64);
    }
    expect(r1.texto.length).toBeLessThanOrEqual(3500);

    const r2 = await accion('pago:BOVEDA');
    expect(r2.texto).toContain('Pago: bóveda');
    expect(datosBotones(r2)).toContain('guardar');

    const r3 = await accion('guardar');
    const m = /compra #(\d+) por \$48\.00/.exec(r3.texto);
    expect(m).not.toBeNull();
    compraId = Number(m![1]);
    expect(datosBotones(r3)).toContain(`deshacer:${compraId}`);

    const compra = await prisma.compras_inventario.findUniqueOrThrow({
      where: { id: compraId },
      include: { lotes_inventario: { orderBy: { id: 'asc' } } },
    });
    expect(compra.usuario_id).toBe(usuarioId);
    expect(compra.origen_fondos).toBe('CAJA_GENERAL');
    expect(Number(compra.monto_total)).toBe(48);
    const lCoca = compra.lotes_inventario.find(
      (l) => l.producto_id === cocaProductoId,
    )!;
    expect(Number(lCoca.cantidad_inicial)).toBe(48);
    expect(Number(lCoca.costo_unitario_adquisicion)).toBe(0.8333);
    const lFrijol = compra.lotes_inventario.find(
      (l) => l.producto_id === frijolProductoId,
    )!;
    expect(Number(lFrijol.cantidad_inicial)).toBe(10);
    expect(Number(lFrijol.costo_unitario_adquisicion)).toBe(0.8);

    // El borrador se limpió
    expect(
      await prisma.bot_conversaciones.count({ where: { chat_id: chatId } }),
    ).toBe(0);
    // Un segundo toque de "guardar" no guarda otra vez
    const r4 = await accion('guardar');
    expect(r4.texto).toContain('No tengo ninguna compra pendiente');
  });

  it('4. alias guardado: el mismo texto fija la presentación aunque el modelo dude', async () => {
    const alias = await prisma.bot_alias.findFirst({
      where: { texto_normalizado: 'coca de lata', presentacion_id: cocaCaja },
    });
    expect(alias?.usos).toBe(1);

    // El modelo se equivoca y dice "Unidad" (id distinto): el código pone la Caja.
    llm.cola.push(
      json({
        proveedor: 'La Fuente',
        lineas: [
          {
            texto_original: 'Coca de   Lata',
            presentacion_id: cocaUnidad,
            cantidad: 1,
            total_linea: 20,
            precio_unitario: null,
            confianza: 'baja',
          },
        ],
      }),
    );
    const r = await msg('1 caja de coca de lata en 20');
    expect(r.texto).toContain('1 Caja (24 c/u) de Coca-Cola 355ml');
    // La memoria viajó al modelo
    const ultima = llm.llamadas[llm.llamadas.length - 1];
    expect(JSON.stringify(ultima)).toContain(
      `(proveedor la fuente) -> ${cocaCaja}`,
    );
  });

  it('5. producto nuevo: pregunta el precio de venta y se crea "por revisar"', async () => {
    const nuevo = (precio: number | null) =>
      json({
        proveedor: 'Distribuidora Sol',
        origen_pago: 'BOVEDA',
        productos_nuevos: [
          {
            texto_original: 'galletas marilu',
            nombre: `Galletas Marilú ${sufijo}`,
            descripcion_presentacion: 'Caja',
            factor: 12,
            unidad_venta: 'Unidad',
            cantidad: 2,
            total_linea: 24,
            precio_venta: precio,
          },
        ],
      });
    llm.cola.push(nuevo(null));
    const r1 = await msg('2 cajas de galletas marilu de 12, en 24, nuevas');
    expect(r1.texto).toContain('NUEVO');
    expect(r1.texto).toContain('¿A cuánto vendes cada unidad');
    expect(datosBotones(r1)).not.toContain('guardar');
    // Aunque ella toque guardar a la fuerza, no guarda sin el precio
    const forzado = await accion('guardar');
    expect(datosBotones(forzado)).not.toContain('guardar');
    expect(
      await prisma.productos.count({
        where: { nombre: `Galletas Marilú ${sufijo}` },
      }),
    ).toBe(0);

    llm.cola.push(nuevo(0.5));
    const r2 = await msg('las vendo a 50 centavos');
    expect(datosBotones(r2)).toContain('guardar');
    // El borrador previo viajó como contexto
    const ultima = llm.llamadas[llm.llamadas.length - 1];
    expect(JSON.stringify(ultima)).toContain('BORRADOR ACTUAL');
    expect(JSON.stringify(ultima)).toContain('galletas marilu');

    const r3 = await accion('guardar');
    expect(r3.texto).toContain('Listo: compra #');

    const producto = await prisma.productos.findFirstOrThrow({
      where: { nombre: `Galletas Marilú ${sufijo}` },
      include: { presentaciones: true, lotes_inventario: true },
    });
    expect(producto.por_revisar).toBe(true);
    // Solo queda su unidad de venta: la caja es cómo se compró, no se vende.
    expect(producto.presentaciones).toHaveLength(1);
    const unidad = producto.presentaciones[0];
    expect(unidad.descripcion).toBe('Unidad');
    expect(Number(unidad.factor_conversion)).toBe(1);
    expect(Number(unidad.precio_venta)).toBe(0.5);
    // 2 cajas de 12 en $24: 24 unidades a $1
    expect(Number(producto.lotes_inventario[0].cantidad_inicial)).toBe(24);
    expect(
      Number(producto.lotes_inventario[0].costo_unitario_adquisicion),
    ).toBe(1);
    // Su alias apunta a la unidad y recuerda la caja de 12
    const alias = await prisma.bot_alias.findFirstOrThrow({
      where: { texto_normalizado: 'galletas marilu' },
    });
    expect(alias.presentacion_id).toBe(unidad.id);
    expect(alias.paquete).toBe('caja');
    expect(Number(alias.unidades_paquete)).toBe(12);
  });

  it('6. deshacer: anula la compra con el motivo; vencido a los 10 minutos', async () => {
    const r = await accion(`deshacer:${compraId}`);
    expect(r.texto).toContain(`deshice la compra #${compraId}`);
    const compra = await prisma.compras_inventario.findUniqueOrThrow({
      where: { id: compraId },
    });
    expect(compra.anulado).toBe(true);
    expect(compra.motivo_anulacion).toBe('Deshecho desde Telegram');
    expect(compra.anulado_por_id).toBe(usuarioId);

    // Una compra de hace 20 minutos ya no se deshace desde el chat
    llm.cola.push(borradorDosLineas());
    await msg('otra compra');
    await accion('pago:BOVEDA');
    const g = await accion('guardar');
    const id2 = Number(/compra #(\d+)/.exec(g.texto)![1]);
    await prisma.compras_inventario.update({
      where: { id: id2 },
      data: { fecha: new Date(Date.now() - 20 * 60_000) },
    });
    const tarde = await accion(`deshacer:${id2}`);
    expect(tarde.texto).toContain('Ya pasaron más de 10 minutos');
    expect(
      (
        await prisma.compras_inventario.findUniqueOrThrow({
          where: { id: id2 },
        })
      ).anulado,
    ).toBe(false);

    // Compra ajena: no se puede
    const otra = await prisma.compras_inventario.create({
      data: {
        proveedor: 'Otro',
        monto_total: 1,
        estado_pago: 'PAGADO',
        origen_fondos: 'CAPITAL_DUEÑOS',
        usuario_id: null,
      },
    });
    const ajena = await accion(`deshacer:${otra.id}`);
    expect(ajena.texto).toContain('No encuentro esa compra');
  });

  it('7. JSON inválido del modelo: reintenta una vez y responde con amabilidad', async () => {
    llm.llamadas.length = 0;
    llm.cola.push('esto no es json', '{"lineas": "dos cajas"}');
    const r = await msg('compré cosas');
    expect(r.texto).toContain('No pude leer eso ahora');
    expect(llm.llamadas).toHaveLength(2);
    // El segundo intento lleva el error de validación
    expect(JSON.stringify(llm.llamadas[1])).toContain(
      'Tu respuesta no es válida',
    );
    expect(
      await prisma.bot_conversaciones.count({ where: { chat_id: chatId } }),
    ).toBe(0);
  });

  it('7b. si el primer JSON falla pero el reintento sirve, sigue normal', async () => {
    llm.cola.push('basura', borradorDosLineas());
    const r = await msg('2 cajas de coca');
    expect(r.texto).toContain('Esto entendí');
  });

  it('7c. fallo de red o cuota de la IA: respuesta amable, el borrador se conserva', async () => {
    llm.cola.push(borradorDosLineas());
    await msg('2 cajas de coca');
    llm.cola.push(new ErrorLlm('429'));
    const r = await msg('no, eran 3');
    expect(r.texto).toContain('No pude leer eso ahora');
    expect(
      await prisma.bot_conversaciones.count({ where: { chat_id: chatId } }),
    ).toBe(1);
  });

  it('8. gaveta sin caja abierta: lo dice en palabras de tienda y pregunta otra forma de pago', async () => {
    await ensureNoOpenShift(app, admin);
    llm.cola.push(borradorDosLineas());
    await msg('compré coca y frijol');
    await accion('pago:GAVETA');
    const r = await accion('guardar');
    expect(r.texto).toContain(
      'No hay caja abierta. ¿La pagaste de la bóveda o quedó fiada?',
    );
    expect(datosBotones(r)).toContain('pago:BOVEDA');
    // Y quedó fiado funciona: crea la deuda
    const fiado = await accion('pago:CREDITO');
    expect(datosBotones(fiado)).toContain('guardar');
    const g = await accion('guardar');
    const id = Number(/compra #(\d+)/.exec(g.texto)![1]);
    const compra = await prisma.compras_inventario.findUniqueOrThrow({
      where: { id },
    });
    expect(compra.origen_fondos).toBe('CREDITO');
    expect(
      await prisma.cuentas_por_pagar.count({ where: { compra_id: id } }),
    ).toBe(1);
  });

  it('9. cancelar (botón y texto) descarta el borrador; borrador viejo se descarta', async () => {
    llm.cola.push(borradorDosLineas());
    await msg('algo');
    await msg('/cancelar');
    expect(
      await prisma.bot_conversaciones.count({ where: { chat_id: chatId } }),
    ).toBe(0);

    llm.cola.push(borradorDosLineas());
    await msg('algo');
    await accion('cancelar');
    expect(
      await prisma.bot_conversaciones.count({ where: { chat_id: chatId } }),
    ).toBe(0);

    llm.cola.push(borradorDosLineas());
    await msg('algo');
    await prisma.bot_conversaciones.update({
      where: { chat_id: chatId },
      data: { actualizado_en: new Date(Date.now() - 25 * 3600_000) },
    });
    const r = await accion('guardar');
    expect(r.texto).toContain('No tengo ninguna compra pendiente');
  });

  it('10. solo la dueña: un usuario que no es ADMIN no usa el bot', async () => {
    const cajero = await prisma.usuarios.create({
      data: {
        nombre: `cajera-bot-${sufijo}`,
        rol: 'CAJERO',
        password_hash: 'x',
      },
    });
    const r = await bot.recibirMensaje({
      chatId: `otro-${sufijo}`,
      usuarioId: cajero.id,
      texto: 'compré algo',
    });
    expect(r.texto).toContain('Esto lo hace la dueña');
  });

  it('11. texto vacío: muestra la ayuda sin llamar a la IA', async () => {
    llm.llamadas.length = 0;
    const r = await msg('');
    expect(r.texto).toContain('Cuéntame qué compraste');
    expect(llm.llamadas).toHaveLength(0);
  });

  // ── Paquete: lo que compró y no es una presentación del catálogo ──────────

  let aceiteUnidad: number;
  let aceiteProductoId: number;
  const lineaAceite = (extra: Record<string, unknown> = {}) => ({
    texto_original: 'aceite de oliva',
    presentacion_id: aceiteUnidad,
    cantidad: 2,
    total_linea: null,
    precio_unitario: 20,
    paquete: { descripcion: 'Caja', unidades: 24 },
    confianza: 'alta',
    ...extra,
  });

  it('13. producto solo con "Unidad": 2 cajas de 24 a $20 c/u guardan 48 a $0.8333', async () => {
    const aceite = await crearProducto('Aceite oliva', [
      { descripcion: 'Unidad', factor: 1, precio: 1 },
    ]);
    aceiteProductoId = aceite.id;
    aceiteUnidad = aceite.presentaciones[0];

    llm.cola.push(
      json({
        proveedor: 'La Fuente',
        origen_pago: 'BOVEDA',
        lineas: [lineaAceite()],
      }),
    );
    const r1 = await msg('2 cajas de aceite de oliva de 24 a 20 c/u');
    expect(r1.texto).toContain(
      '2 Caja (24 Unidad c/u) de Aceite oliva-' + sufijo,
    );
    expect(r1.texto).toContain('48 unidades a $0.8333');
    expect(datosBotones(r1)).toContain('guardar');

    const g = await accion('guardar');
    expect(g.texto).toMatch(/compra #\d+ por \$40\.00/);
    const id = Number(/compra #(\d+)/.exec(g.texto)![1]);
    const compra = await prisma.compras_inventario.findUniqueOrThrow({
      where: { id },
      include: { lotes_inventario: true },
    });
    expect(Number(compra.monto_total)).toBe(40);
    expect(compra.lotes_inventario).toHaveLength(1);
    expect(compra.lotes_inventario[0].producto_id).toBe(aceiteProductoId);
    expect(Number(compra.lotes_inventario[0].cantidad_inicial)).toBe(48);
    expect(Number(compra.lotes_inventario[0].costo_unitario_adquisicion)).toBe(
      0.8333,
    );

    const alias = await prisma.bot_alias.findFirstOrThrow({
      where: { texto_normalizado: 'aceite de oliva', paquete: 'caja' },
    });
    expect(alias.presentacion_id).toBe(aceiteUnidad);
    expect(Number(alias.unidades_paquete)).toBe(24);
  });

  it('14. paquete sin unidades: pregunta, no ofrece guardar, y la corrección lo completa', async () => {
    llm.cola.push(
      json({
        proveedor: 'Distribuidora Sol',
        origen_pago: 'BOVEDA',
        lineas: [
          lineaAceite({
            texto_original: 'aceite de girasol',
            paquete: { descripcion: 'Caja', unidades: null },
          }),
        ],
      }),
    );
    const r1 = await msg('2 cajas de aceite de girasol a 20 c/u');
    expect(r1.texto).toContain(
      '¿Cuántas unidades trae cada caja de Aceite oliva-' + sufijo + '?',
    );
    expect(datosBotones(r1)).not.toContain('guardar');
    // Aunque toque guardar a la fuerza, no guarda
    const forzado = await accion('guardar');
    expect(datosBotones(forzado)).not.toContain('guardar');
    expect(forzado.texto).toContain('¿Cuántas unidades trae cada caja');

    llm.cola.push(
      json({
        proveedor: 'Distribuidora Sol',
        origen_pago: 'BOVEDA',
        lineas: [
          lineaAceite({
            texto_original: 'aceite de girasol',
            paquete: { descripcion: 'Caja', unidades: 12 },
          }),
        ],
      }),
    );
    const r2 = await msg('trae 12');
    expect(r2.texto).toContain('24 unidades a $1.6667');
    expect(datosBotones(r2)).toContain('guardar');
    const g = await accion('guardar');
    const id = Number(/compra #(\d+)/.exec(g.texto)![1]);
    const lote = await prisma.lotes_inventario.findFirstOrThrow({
      where: { compra_id: id },
    });
    expect(Number(lote.cantidad_inicial)).toBe(24);
  });

  it('15. memoria: el mismo texto y paquete sin unidades se completa solo', async () => {
    // Por la compra de la prueba 13, "aceite de oliva" + caja = 24 ya se recuerda.
    llm.cola.push(
      json({
        proveedor: 'Otra Tienda',
        origen_pago: 'BOVEDA',
        lineas: [
          lineaAceite({ paquete: { descripcion: 'Caja', unidades: null } }),
        ],
      }),
    );
    llm.llamadas.length = 0;
    const r = await msg('3 cajas de aceite de oliva a 20 c/u');
    expect(JSON.stringify(llm.llamadas[0])).toContain(
      `en caja -> ${aceiteUnidad} (caja = 24)`,
    );
    expect(r.texto).not.toContain('¿Cuántas');
    expect(r.texto).toContain('2 Caja (24 Unidad c/u)');
    expect(r.texto).toContain('48 unidades a $0.8333');
    expect(datosBotones(r)).toContain('guardar');

    // Al guardar de nuevo, la memoria suma un uso y conserva el último valor
    await accion('guardar');
    const alias = await prisma.bot_alias.findFirstOrThrow({
      where: {
        texto_normalizado: 'aceite de oliva',
        paquete: 'caja',
        proveedor: 'otra tienda',
      },
    });
    expect(alias.usos).toBe(1);
    expect(Number(alias.unidades_paquete)).toBe(24);
  });

  it('16. producto nuevo por caja sin decir cuántas trae: pregunta y luego se crea solo con la unidad', async () => {
    const nuevo = (factor: number | null) =>
      json({
        proveedor: 'Distribuidora Sol',
        origen_pago: 'BOVEDA',
        productos_nuevos: [
          {
            texto_original: 'jabon rosa',
            nombre: `Jabón rosa ${sufijo}`,
            descripcion_presentacion: 'Caja',
            factor,
            unidad_venta: 'Unidad',
            cantidad: 1,
            total_linea: 12,
            precio_venta: 0.75,
          },
        ],
      });
    llm.cola.push(nuevo(null));
    const r1 = await msg('una caja de jabón rosa en 12, nuevo');
    expect(r1.texto).toContain(
      '¿Cuántas unidades trae cada caja de Jabón rosa ' + sufijo + '?',
    );
    expect(datosBotones(r1)).not.toContain('guardar');

    llm.cola.push(nuevo(12));
    const r2 = await msg('trae 12');
    expect(datosBotones(r2)).toContain('guardar');
    await accion('guardar');
    const producto = await prisma.productos.findFirstOrThrow({
      where: { nombre: `Jabón rosa ${sufijo}` },
      include: { presentaciones: true, lotes_inventario: true },
    });
    expect(producto.presentaciones).toHaveLength(1);
    expect(Number(producto.lotes_inventario[0].cantidad_inicial)).toBe(12);
    expect(
      Number(producto.lotes_inventario[0].costo_unitario_adquisicion),
    ).toBe(1);
  });

  it('12. foto: viaja como image_url al modelo', async () => {
    llm.llamadas.length = 0;
    llm.cola.push(borradorDosLineas());
    const r = await bot.recibirMensaje({
      chatId,
      usuarioId,
      imagen: { base64: 'AAAA', mime: 'image/jpeg' },
    });
    expect(r.texto).toContain('Esto entendí');
    expect(JSON.stringify(llm.llamadas[0])).toContain(
      'data:image/jpeg;base64,AAAA',
    );
  });
});
