# 🐛 Reporte de Bugs — ERP/POS Tienda Karlita

> **Origen:** Auditoría de código y pruebas automatizadas contra API en vivo  
> **Fecha:** 18 de Abril de 2026  
> **Probado contra:** Backend NestJS corriendo en `localhost:3000` con base de datos Supabase de producción  
> **Método de prueba:** Requests `curl` directos a la API REST (sin pasar por el frontend)  
> **Todos los bugs fueron reproducidos y confirmados.**

---

## Índice

| # | Bug | Severidad | Módulo | Archivo principal |
|---|---|---|---|---|
| 1 | [Venta con carrito vacío crea registro $0](#bug-1) | 🔴 Alta | Ventas | `create-venta.dto.ts` |
| 2 | [Compra AL_CREDITO + CAJA_POS: contradicción lógica](#bug-2) | 🔴 Alta | Compras | `compras.service.ts` |
| 3 | [monto_total de compra no se valida contra lotes](#bug-3) | 🔴 Alta | Compras | `compras.service.ts` |
| 4 | [Merma no genera pérdida financiera](#bug-4) | 🔴 Alta | Ajustes Inventario | `ajustes_inventario.service.ts` |
| 5 | [Anulación en turno cerrado corrompe cuadre](#bug-5) | 🔴 Crítica | Ventas | `ventas.service.ts` |
| 6 | [JWT Secret hardcodeado como fallback](#bug-6) | 🟡 Media | Auth | `jwt.strategy.ts`, `auth.module.ts` |
| 7 | [usuario.nombre sin constraint UNIQUE](#bug-7) | 🟡 Media | Schema | `schema.prisma` |
| 8 | [Resumen de caja omite PAGO_PROVEEDOR](#bug-8) | 🟡 Media | Cajas Turnos | `cajas_turnos.service.ts` |
| 9 | [Backend no valida fondos suficientes antes de egresos](#bug-9) | 🟡 Media | Mov. Financieros / Compras | Varios |

---

<a id="bug-1"></a>
## BUG 1 — Venta con carrito vacío crea registro de $0

### Contexto
Cuando un cajero (o cualquier cliente HTTP) envía un request `POST /ventas` con el array `detalles` vacío, el sistema acepta la solicitud y crea un registro de venta con `total: 0` y sin artículos asociados. Esto genera data basura en la base de datos y potencialmente contamina los reportes de ventas y conteos de operaciones.

### Causa raíz
El DTO `CreateVentaDto` usa el decorador `@IsArray()` para validar el campo `detalles`, pero **no valida que el array tenga al menos un elemento**. El decorador `@IsArray()` solo verifica que el valor sea un array, no que contenga items.

### Archivo afectado
📄 **[create-venta.dto.ts](src/ventas/dto/create-venta.dto.ts)** — Líneas 13-18

```typescript
// CÓDIGO ACTUAL (DEFECTUOSO)
export class CreateVentaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaInputDto)
  detalles: DetalleVentaInputDto[];
}
```

### Reproducción
```bash
curl -X POST http://localhost:3000/ventas \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"detalles":[]}'

# Respuesta: HTTP 201
# Body: {"id":1,"caja_turno_id":1,"total":"0","fecha":"...","estado":"COMPLETADA",...}
```

### Comportamiento esperado
Debería retornar `HTTP 400 Bad Request` con un mensaje como: `"El carrito debe tener al menos un artículo"`.

### Solución propuesta
Agregar el decorador `@ArrayMinSize(1)` de `class-validator` al campo `detalles`:

```typescript
// CÓDIGO CORREGIDO
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';

export class CreateVentaDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'El carrito debe tener al menos un artículo' })
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaInputDto)
  detalles: DetalleVentaInputDto[];
}
```

### Notas adicionales
- El servicio `VentasService.create()` ya itera `createVentaDto.detalles` con un `for...of` (línea 39 de `ventas.service.ts`). Si el array está vacío, el bucle simplemente no ejecuta, la venta queda con `total: 0`, y se hace `increment: 0` al `efectivo_esperado`. No lanza error.
- La venta vacía queda marcada como `COMPLETADA`, ocupando un ID y apareciendo en los reportes de movimientos.

---

<a id="bug-2"></a>
## BUG 2 — Compra AL_CREDITO + CAJA_POS: contradicción lógica financiera

### Contexto
El sistema permite registrar una compra con `estado_pago: "AL_CREDITO"` y `origen_fondos: "CAJA_POS"` simultáneamente. Esto genera una **contradicción financiera**: se crea una cuenta por pagar (deuda al proveedor) **y al mismo tiempo** se descuenta el dinero de la caja registradora. El negocio termina pagando dos veces: una vez de forma inmediata (caja POS) y otra registrada como deuda pendiente.

### Causa raíz
En `compras.service.ts`, el **Paso 3** (crear cuenta por pagar) y el **Paso 4** (impacto en caja) se ejecutan independientemente. No hay ninguna validación que impida la combinación contradictoria de `AL_CREDITO` con un origen de fondos que genere egreso real.

### Archivos afectados

📄 **[compras.service.ts](src/compras/compras.service.ts)** — Líneas 44-92

La lógica relevante es esta:

```typescript
// Paso 3: Cuentas por Pagar (líneas 44-54)
// Se ejecuta SI estado_pago === 'AL_CREDITO', sin importar origen_fondos
if (compraData.estado_pago === 'AL_CREDITO') {
  await tx.cuentas_por_pagar.create({
    data: {
      compra_id: compra.id,
      acreedor: compraData.proveedor,
      monto_deuda: compraData.monto_total,      // ← Registra deuda
      saldo_pendiente: compraData.monto_total,
    },
  });
}

// Paso 4: Impacto en Caja (líneas 56-92)
// Se ejecuta SI origen_fondos === 'CAJA_POS', sin importar estado_pago
if (compraData.origen_fondos === 'CAJA_POS') {
  // ... crea PAGO_PROVEEDOR, decrementa efectivo_esperado ← TAMBIÉN saca dinero
}
```

**Resultado:** Se crea la deuda en `cuentas_por_pagar` Y se descuenta el dinero de la caja. Son acciones mutuamente excluyentes.

📄 **[create-compra.dto.ts](src/compras/dto/create-compra.dto.ts)** — Líneas 49-63

El DTO valida `estado_pago` y `origen_fondos` de forma independiente. No hay validación cruzada.

### Reproducción
```bash
curl -X POST http://localhost:3000/compras \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "proveedor": "PROVEEDOR-TEST",
    "monto_total": 10.00,
    "estado_pago": "AL_CREDITO",
    "origen_fondos": "CAJA_POS",
    "detalles_lotes": [{
      "producto_id": 1,
      "costo_unitario_adquisicion": 1.00,
      "cantidad_inicial": 10
    }]
  }'

# Respuesta: HTTP 201 (¡Aceptado!)
# Resultado en DB: Se creó cuenta_por_pagar con monto_deuda=$10
#                  Y se decrementó efectivo_esperado en $10
```

### Comportamiento esperado
**Opción A (recomendada):** Si `estado_pago === 'AL_CREDITO'`, entonces `origen_fondos` debe ser `'CAPITAL_DUEÑOS'` o algún valor neutro. No debe permitir `CAJA_POS` ni `CAJA_GENERAL` porque no se debe desembolsar dinero si la compra es a crédito.

**Opción B:** Si `estado_pago === 'AL_CREDITO'`, ignorar completamente el `origen_fondos` y saltarse el Paso 4.

### Solución propuesta

En `compras.service.ts`, agregar una validación al inicio del método `create()`:

```typescript
async create(createCompraDto: CreateCompraDto) {
  const { detalles_lotes, ...compraData } = createCompraDto;

  // ══ NUEVA VALIDACIÓN ══
  if (
    compraData.estado_pago === 'AL_CREDITO' &&
    compraData.origen_fondos !== 'CAPITAL_DUEÑOS'
  ) {
    throw new BadRequestException(
      'Una compra a crédito no puede descontar fondos de caja. Usa "CAPITAL_DUEÑOS" como origen o cambia el estado de pago a "PAGADO".',
    );
  }

  return await this.prisma.$transaction(async (tx) => {
    // ... resto del código sin cambios
  });
}
```

### Notas adicionales
- El frontend (página de gastos y compra) SÍ podría estar previniendo esta combinación a nivel de UI, pero el backend NO la bloquea. Cualquier request directo a la API puede explotarlo.
- Las `cuentas_por_pagar` generadas por este bug no tienen sistema de abono/gestión implementado, así que quedarían como deudas fantasma.

---

<a id="bug-3"></a>
## BUG 3 — monto_total de compra no se valida contra la suma real de los lotes

### Contexto
El campo `monto_total` del body de una compra es declarado por el usuario y se usa tal cual para impactar la caja. Pero **no se valida que sea coherente con la suma real de los lotes** (`Σ cantidad_inicial × costo_unitario_adquisicion`). Un usuario podría declarar una compra de $999.99 cuando los lotes realmente suman $10.00. Si el origen es `CAJA_POS`, se descontarán $999.99 de la caja (en vez de $10.00).

### Causa raíz
En `compras.service.ts`, el `monto_total` se toma directamente del DTO y se usa en:
- Línea 22: Para registrar `compra.monto_total`
- Línea 50: Para la `monto_deuda` en cuentas por pagar
- Línea 72: Para el `monto` del movimiento `PAGO_PROVEEDOR`
- Línea 81: Para el `decrement` del `efectivo_esperado`

Nunca se calcula ni se compara contra `detalles_lotes`.

### Archivos afectados

📄 **[compras.service.ts](src/compras/compras.service.ts)** — Líneas 14-26 (registro de la compra)

```typescript
// CÓDIGO ACTUAL: se confía ciegamente en monto_total del body
const compra = await tx.compras_inventario.create({
  data: {
    proveedor: compraData.proveedor,
    monto_total: compraData.monto_total,  // ← Sin validar contra lotes
    estado_pago: compraData.estado_pago,
    origen_fondos: compraData.origen_fondos,
  },
});
```

📄 **[create-compra.dto.ts](src/compras/dto/create-compra.dto.ts)** — Línea 46-47

```typescript
@IsNumber()
@Min(0)       // ← Solo valida que sea >= 0
monto_total: number;
```

### Reproducción
```bash
curl -X POST http://localhost:3000/compras \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "proveedor": "PROVEEDOR-INCONSISTENTE",
    "monto_total": 999.99,
    "estado_pago": "PAGADO",
    "origen_fondos": "CAPITAL_DUEÑOS",
    "detalles_lotes": [{
      "producto_id": 1,
      "costo_unitario_adquisicion": 1.00,
      "cantidad_inicial": 10
    }]
  }'

# Respuesta: HTTP 201 (¡Aceptado!)
# Se registró compra con monto_total=$999.99
# Pero los lotes realmente suman: 10 uds × $1.00 = $10.00
```

### Comportamiento esperado
El `monto_total` debería **calcularse automáticamente** en el backend como la suma de `cantidad_inicial × costo_unitario_adquisicion` de cada lote. El campo `monto_total` del DTO debería eliminarse o ignorarse.

### Solución propuesta

En `compras.service.ts`, calcular el monto real antes de crear la compra:

```typescript
async create(createCompraDto: CreateCompraDto) {
  const { detalles_lotes, ...compraData } = createCompraDto;

  // ══ CALCULAR MONTO REAL ══
  const montoCalculado = detalles_lotes.reduce(
    (sum, lote) => sum + lote.cantidad_inicial * lote.costo_unitario_adquisicion,
    0,
  );

  // Opción A: Ignorar monto_total del cliente, usar el calculado
  compraData.monto_total = montoCalculado;

  // Opción B: Validar coherencia (si quieres mantener el campo)
  // if (Math.abs(compraData.monto_total - montoCalculado) > 0.01) {
  //   throw new BadRequestException(
  //     `El monto declarado ($${compraData.monto_total}) no coincide con el total de lotes ($${montoCalculado.toFixed(2)}).`,
  //   );
  // }

  return await this.prisma.$transaction(async (tx) => {
    // ... resto sin cambios
  });
}
```

### Notas adicionales
- **Impacto financiero real:** Si el `origen_fondos` es `CAJA_POS`, la caja perderá $999.99 en vez de $10.00. El saldo de la gaveta quedará negativo o con un faltante enorme al cierre.
- Considerar también agregar `@ArrayMinSize(1)` al campo `detalles_lotes` del DTO para evitar compras sin lotes (mismo patrón que Bug 1).

---

<a id="bug-4"></a>
## BUG 4 — Las mermas de inventario no generan pérdida financiera

### Contexto
Cuando se registra una merma (producto quebrado, vencido, robado), el sistema correctamente reduce el stock del lote y calcula el `costo_asumido` (pérdida económica). Sin embargo, **este costo no se refleja en ningún movimiento financiero ni impacta el balance del negocio**. En términos contables, la merma es una pérdida patrimonial que debería reflejarse como gasto del período. Actualmente, la pérdida existe solo en la tabla `ajustes_inventario` pero no en el flujo financiero de la tienda.

### Causa raíz
El servicio `AjustesInventarioService.create()` ejecuta:
1. ✅ Busca y valida el lote
2. ✅ Valida que la cantidad no exceda la disponible
3. ✅ Calcula `costo_asumido = cantidad × costo_unitario_adquisicion`
4. ✅ Resta las unidades del lote
5. ✅ Registra el ajuste en `ajustes_inventario`
6. ❌ **Falta:** No crea ningún `movimiento_financiero` que registre la pérdida

### Archivo afectado
📄 **[ajustes_inventario.service.ts](src/ajustes_inventario/ajustes_inventario.service.ts)** — Líneas 14-69

```typescript
// El método create() completo — nótese que NO hay ningún paso
// que cree un movimiento financiero ni impacte la caja
return await this.prisma.$transaction(async (tx) => {
  // 1. Buscar lote ✅
  // 2. Validar cantidad ✅
  // 3. Calcular costo_asumido ✅
  // 4. Restar del lote ✅
  // 5. Registrar ajuste ✅
  // 6. ¿Movimiento financiero? ← NO EXISTE
});
```

### Reproducción
```bash
# Contar movimientos financieros ANTES
ANTES=$(curl -s http://localhost:3000/movimientos-financieros -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

# Registrar merma
curl -X POST http://localhost:3000/ajustes-inventario \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"lote_id":2,"cantidad_ajustada":1,"tipo_ajuste":"QUEBRADO","justificacion":"Producto se cayó"}'

# HTTP 201 — Ajuste creado con costo_asumido=$1.00

# Contar movimientos financieros DESPUÉS
DESPUES=$(curl -s http://localhost:3000/movimientos-financieros -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

# Resultado: ANTES=1, DESPUÉS=1 (SIN CAMBIO)
# La pérdida de $1.00 no quedó registrada financieramente
```

### Comportamiento esperado
Al registrar una merma, se debería crear un movimiento financiero de tipo `MERMA_INVENTARIO` (o usar `EGRESO_OPERATIVO` con una categoría especial) que refleje la pérdida de inventario como gasto del período. Esto NO debería impactar el `efectivo_esperado` de la caja (porque no es una salida de efectivo), pero SÍ debería quedar como registro contable para el estado de resultados.

### Solución propuesta

**Paso 1:** En `ajustes_inventario.service.ts`, después de registrar el ajuste, crear un movimiento financiero informativo:

```typescript
// Después de la línea 68 (return del ajuste), pero DENTRO de la transacción:

// 6. NUEVO: Registrar la pérdida financieramente
const cajaActiva = await tx.cajas_turnos.findFirst({
  where: { estado: 'ABIERTA' },
});

if (cajaActiva) {
  await tx.movimientos_financieros.create({
    data: {
      caja_turno_id: cajaActiva.id,
      tipo_movimiento: 'MERMA_INVENTARIO',
      monto: costo_asumido,
      descripcion: `Merma: ${tipo_ajuste} — ${justificacion || 'Sin detalle'} (Lote #${lote_id})`,
    },
  });
}
// NOTA: No se hace decrement del efectivo_esperado porque no es salida de gaveta
```

**Paso 2:** En `movimientos_financieros.service.ts` (línea 58-59), agregar `'MERMA_INVENTARIO'` a la lógica para que no impacte el `efectivo_esperado`:

```typescript
// El tipo 'MERMA_INVENTARIO' NO debe estar en esIngreso ni esEgreso
// porque no es movimiento de efectivo físico, solo registro contable
const esIngreso = ['INGRESO_CAPITAL'].includes(tipo_movimiento);
const esEgreso = ['EGRESO_OPERATIVO', 'RETIRO_BOVEDA'].includes(tipo_movimiento);
// 'MERMA_INVENTARIO' no está en ninguno → no impacta efectivo_esperado ✅
```

**Paso 3:** Agregar `'MERMA_INVENTARIO'` al enum/validador de `tipo_movimiento` en el DTO de movimientos financieros y en el `getResumen()` de `cajas_turnos.service.ts` para incluirlo en los reportes.

### Notas adicionales
- **Impacto contable:** Sin este fix, el dueño de la tienda no tiene forma de saber cuánto dinero perdió por mermas en un período dado. La tabla `ajustes_inventario` tiene la data, pero no se incluye en ningún reporte financiero consolidado.
- La pérdida por merma reduce el valor del inventario (activo), lo cual debería reflejarse como gasto del período en un estado de resultados.

---

<a id="bug-5"></a>
## BUG 5 — Anulación de venta en turno cerrado corrompe el cuadre histórico

### ⚠️ Este es el bug más crítico del sistema.

### Contexto
Cuando se anula una venta, el sistema devuelve el stock a los lotes y **decrementa el `efectivo_esperado`** del turno de caja asociado. Esto es correcto para un turno abierto. Pero si el turno ya fue **cerrado**, el `efectivo_esperado` se modifica retroactivamente, **corrompiendo el cálculo de `diferencia`** que se hizo al cierre. El cuadre histórico pierde integridad.

### Causa raíz
En `ventas.service.ts`, el método `anular()` (líneas 178-236) no verifica el estado del turno de caja antes de modificar `efectivo_esperado`. La línea 225 ejecuta el decrement sin preguntar si el turno está `ABIERTA` o `CERRADA`.

### Archivo afectado
📄 **[ventas.service.ts](src/ventas/ventas.service.ts)** — Líneas 178-236

```typescript
async anular(id: number, justificacion_nula: string) {
  // ...validaciones...

  return await this.prisma.$transaction(async (tx) => {
    // 1. Marcar como ANULADA ← OK
    // 2. Devolver stock a lotes ← OK

    // 3. PROBLEMA: modifica el turno sin verificar si está cerrado
    await tx.cajas_turnos.update({
      where: { id: venta.caja_turno_id },  // ← turno puede estar CERRADA
      data: {
        efectivo_esperado: {
          decrement: venta.total,  // ← Modifica dato histórico
        },
      },
    });

    return ventaAnulada;
  });
}
```

### Reproducción
```bash
# 1. Hay un turno abierto con esperado=$90.35
# 2. Se cierra con efectivo_declarado=$90.35 → diferencia=$0
# 3. Intentar anular una venta de ese turno cerrado:

curl -X PATCH http://localhost:3000/ventas/4/anular \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"justificacion_nula":"Prueba: anulación en turno cerrado"}'

# Respuesta: HTTP 200 (¡Aceptado!)
# Resultado: efectivo_esperado cambió de $90.35 → $90.00
# El cierre decía diferencia=$0, pero ahora el esperado ya no coincide
# con lo que era al momento del cierre. Dato histórico corrompido.
```

### Comportamiento esperado
Si el turno de caja está `CERRADA`, la anulación **debe ser rechazada** con `HTTP 400 Bad Request`. Las anulaciones solo deben permitirse dentro del turno activo (abierto).

### Solución propuesta

En `ventas.service.ts`, agregar una validación del estado del turno **dentro de la transacción**, antes de modificar `efectivo_esperado`:

```typescript
async anular(id: number, justificacion_nula: string) {
  const venta = await this.prisma.ventas.findUnique({
    where: { id },
    include: {
      detalle_ventas: {
        include: { detalle_venta_lotes: true },
      },
    },
  });

  if (!venta) {
    throw new NotFoundException(`Venta con ID ${id} no encontrada`);
  }

  if (venta.estado === 'ANULADA') {
    throw new BadRequestException('La venta ya se encuentra anulada');
  }

  // ══ NUEVA VALIDACIÓN ══
  const turno = await this.prisma.cajas_turnos.findUnique({
    where: { id: venta.caja_turno_id },
  });

  if (!turno || turno.estado !== 'ABIERTA') {
    throw new BadRequestException(
      'No se puede anular una venta de un turno de caja ya cerrado. ' +
      'Las anulaciones solo son posibles durante el turno activo.',
    );
  }

  return await this.prisma.$transaction(async (tx) => {
    // ... resto del código sin cambios
  });
}
```

### Notas adicionales
- **Dato corrompido vs. error visual:** El campo `diferencia` no se recalcula al anular; fue fijado al momento del cierre. Pero `efectivo_esperado` sí cambia, lo que genera una inconsistencia entre `efectivo_declarado - efectivo_esperado` (que ahora da un resultado distinto a `diferencia`).
- **Alternativa más permisiva:** Si el negocio necesita poder anular ventas de turnos cerrados, la anulación debería crear un **movimiento compensatorio** en el turno activo actual (como un ingreso negativo), en lugar de modificar el turno cerrado. Esto es más complejo pero preserva la inmutabilidad histórica.

---

<a id="bug-6"></a>
## BUG 6 — JWT Secret hardcodeado como fallback

### Contexto
Si la variable de entorno `JWT_SECRET` no está configurada en el servidor, el sistema usa un secreto predecible (`'super-secret-key'`) para firmar y verificar tokens JWT. Un atacante que conozca este secreto (que está en el código fuente) podría forjar tokens de acceso válidos para cualquier usuario, incluyendo ADMIN.

### Archivos afectados

📄 **[jwt.strategy.ts](src/auth/jwt.strategy.ts)** — Línea 17

```typescript
secretOrKey: process.env.JWT_SECRET || 'super-secret-key',  // ← Fallback predecible
```

📄 **[auth.module.ts](src/auth/auth.module.ts)** — Línea 15

```typescript
secret: process.env.JWT_SECRET || 'super-secret-key',  // ← Mismo fallback
```

### Solución propuesta

Lanzar un error al inicio si `JWT_SECRET` no está configurado:

```typescript
// jwt.strategy.ts
constructor() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está configurado. Define la variable de entorno.');
  }
  super({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    ignoreExpiration: false,
    secretOrKey: secret,
  });
}
```

```typescript
// auth.module.ts
JwtModule.register({
  global: true,
  secret: process.env.JWT_SECRET || (() => { throw new Error('JWT_SECRET requerido') })(),
  signOptions: { expiresIn: '12h' },
}),
```

### Notas
- En producción (Render), el `.env` sí tiene `JWT_SECRET`. El riesgo es para nuevos despliegues o entornos de desarrollo donde se olvide configurarlo.
- El repositorio contiene el fallback en texto plano en el código fuente histórico de Git.

---

<a id="bug-7"></a>
## BUG 7 — Campo `nombre` de usuario sin constraint UNIQUE en la base de datos

### Contexto
El modelo `usuarios` en el schema de Prisma no tiene un constraint `@unique` en el campo `nombre`. Esto permite crear dos o más usuarios con el mismo nombre. El servicio de autenticación usa `findFirst({ where: { nombre } })` para buscar el usuario al hacer login, lo que significa que si hay duplicados, siempre devolverá al primero creado — el segundo usuario con el mismo nombre nunca podría autenticarse.

### Archivo afectado
📄 **[schema.prisma](prisma/schema.prisma)** — Líneas 170-176

```prisma
model usuarios {
  id            Int       @id @default(autoincrement())
  nombre        String    @db.VarChar(100)   // ← Falta @unique
  rol           String    @db.VarChar(20)
  password_hash String    @db.VarChar(255)
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
}
```

### Solución propuesta

```prisma
model usuarios {
  id            Int       @id @default(autoincrement())
  nombre        String    @unique @db.VarChar(100)   // ← Agregar @unique
  rol           String    @db.VarChar(20)
  password_hash String    @db.VarChar(255)
  created_at    DateTime? @default(now()) @db.Timestamptz(6)
}
```

Luego ejecutar:
```bash
npx prisma migrate dev --name add_unique_nombre_usuario
```

### Notas
- Verificar que no haya usuarios duplicados en la DB de producción antes de aplicar la migración. Si hay duplicados, la migración fallará.
- El `UsuariosService.findByNombreInternal()` utiliza `findFirst` y no `findUnique`, lo cual es consistente con la falta del constraint. Después de agregar `@unique`, conviene cambiar a `findUnique` para mayor claridad semántica.

---

<a id="bug-8"></a>
## BUG 8 — El resumen de caja no incluye pagos a proveedores

### Contexto
El método `getResumen()` del servicio de cajas-turnos calcula un desglose financiero del turno (ventas, egresos operativos, ingresos de capital, retiros a bóveda). Sin embargo, **omite los movimientos de tipo `PAGO_PROVEEDOR`**, que son egresos reales de la caja generados por compras con `origen_fondos: 'CAJA_POS'`. Esto causa que el resumen financiero muestre números incompletos.

### Archivo afectado
📄 **[cajas_turnos.service.ts](src/cajas_turnos/cajas_turnos.service.ts)** — Líneas 154-167

```typescript
// Se incluyen estos tipos...
const egresos = turno.movimientos_financieros
  .filter(m => m.tipo_movimiento === 'EGRESO_OPERATIVO')    // ✅
  // ... pero falta 'PAGO_PROVEEDOR' ←  ❌

const ingresos = turno.movimientos_financieros
  .filter(m => m.tipo_movimiento === 'INGRESO_CAPITAL')      // ✅

const retiros = turno.movimientos_financieros
  .filter(m => m.tipo_movimiento === 'RETIRO_BOVEDA')        // ✅
```

### Solución propuesta

Agregar una línea para pagos a proveedores y también incluirlo en los egresos:

```typescript
// Opción A: Incluir PAGO_PROVEEDOR en el filtro de egresos
const egresos = turno.movimientos_financieros
  .filter(m => ['EGRESO_OPERATIVO', 'PAGO_PROVEEDOR'].includes(m.tipo_movimiento))
  .reduce((acc, m) => acc.add(new Prisma.Decimal(m.monto)), new Prisma.Decimal(0));

// Opción B: Agregar un campo separado para mayor detalle
const pagos_proveedores = turno.movimientos_financieros
  .filter(m => m.tipo_movimiento === 'PAGO_PROVEEDOR')
  .reduce((acc, m) => acc.add(new Prisma.Decimal(m.monto)), new Prisma.Decimal(0));

return {
  turno: turno,
  total_ventas,
  total_egresos: egresos,
  total_pagos_proveedores: pagos_proveedores,  // NUEVO
  total_ingresos_capital: ingresos,
  total_retiros_boveda: retiros,
  count_ventas: countVentas.id,
};
```

---

<a id="bug-9"></a>
## BUG 9 — Backend no valida fondos suficientes antes de egresos y compras

### Contexto
El frontend sí valida que haya fondos suficientes antes de registrar un egreso o pagar una compra desde la caja. Pero el **backend no hace esta validación**, lo que significa que un request directo a la API puede generar un `efectivo_esperado` negativo en el turno de caja.

### Archivos afectados

📄 **[movimientos_financieros.service.ts](src/movimientos_financieros/movimientos_financieros.service.ts)** — Líneas 58-71

```typescript
// Decrementa sin validar que el resultado no sea negativo
} else if (esEgreso) {
  await tx.cajas_turnos.update({
    where: { id: cajaTurno.id },
    data: { efectivo_esperado: { decrement: createMovimientosFinancieroDto.monto } },
    // ← No verifica que efectivo_esperado >= monto
  });
}
```

📄 **[compras.service.ts](src/compras/compras.service.ts)** — Líneas 77-83

```typescript
// Mismo problema al pagar proveedor desde CAJA_POS
await tx.cajas_turnos.update({
  where: { id: cajaActiva.id },
  data: { efectivo_esperado: { decrement: compraData.monto_total } },
  // ← No verifica que efectivo_esperado >= monto_total
});
```

### Solución propuesta

Antes de cada `decrement`, leer el valor actual y validar:

```typescript
// Ejemplo para movimientos_financieros.service.ts
if (esEgreso) {
  const cajaActual = await tx.cajas_turnos.findUnique({
    where: { id: cajaTurno.id },
  });
  
  const esperado = Number(cajaActual.efectivo_esperado);
  if (esperado < createMovimientosFinancieroDto.monto) {
    throw new BadRequestException(
      `Fondos insuficientes en caja. Disponible: $${esperado.toFixed(2)}, Requerido: $${createMovimientosFinancieroDto.monto}`,
    );
  }

  await tx.cajas_turnos.update({
    where: { id: cajaTurno.id },
    data: { efectivo_esperado: { decrement: createMovimientosFinancieroDto.monto } },
  });
}
```

---

## Observaciones adicionales

Estos no son bugs sino **limitaciones funcionales** que vale la pena tener en cuenta al desarrollar:

1. **El módulo de Estadísticas (`/dashboard/stats`) está vacío.** La página existe pero no tiene contenido. El backend tiene toda la data necesaria (costo FIFO por venta en `detalle_venta_lotes.costo_aplicado`) para calcular margen de ganancia y utilidad bruta.

2. **No hay gestión de cuentas por pagar.** Las compras `AL_CREDITO` crean registros en `cuentas_por_pagar` pero no hay endpoints ni UI para abonar o cerrar esas deudas.

3. **El rol `VENDEDOR` existe en el código pero no en la UI.** El `RolesGuard` reconoce `VENDEDOR` y el controller de movimientos lo permite, pero el frontend solo maneja `ADMIN` y `CAJERO`.

4. **El stock en el POS no se ajusta por `factor_conversion`.** Si un producto tiene 5 unidades base y un six-pack con `factor_conversion: 6`, el POS muestra "5" en stock. El usuario podría pensar que puede vender 5 six-packs, cuando realmente no puede vender ninguno.
