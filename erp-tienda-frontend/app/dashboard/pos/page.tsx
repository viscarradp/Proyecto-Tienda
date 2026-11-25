'use client'

import * as React from "react"
import {
  Search,
  ScanBarcode,
  Plus,
  ShoppingCart,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
  DoorOpen,
  DoorClosed,
  HandCoins,
  PackagePlus,
  Zap,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@/components/ui/bottom-sheet"
import { MoneyValue } from "@/components/money-value"
import { CartLines } from "@/components/pos/CartLines"
import { CheckoutSection, ModoApagon } from "@/components/pos/CheckoutSection"
import { textoAvisosSinStock, textoResultadoCierre } from "@/components/pos/pos-utils"
import { SacarDineroDialog } from "@/components/pos/SacarDineroDialog"
import { AbrirCajaDialog } from "@/components/pos/AbrirCajaDialog"
import { AltaRapidaDialog, type ProductoRapido } from "@/components/pos/AltaRapidaDialog"
import { useShallow } from "zustand/react/shallow"
import { useCartStore } from "@/src/store/cartStore"
import { useInventoryStore, stockTotalDe, pendienteTotalDe } from "../../../src/store/inventoryStore"
import { apiFetch, tipoDeError } from "@/lib/api"
import {
  aNumero,
  centavosAMonto,
  formatCantidad,
  formatMoney,
  montoACentavos,
  normalizarBusqueda,
  stockEnPresentacion,
} from "@/lib/format"
import { formatStock } from "@/lib/unidades"
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner"
import {
  borrarSesion,
  claveIdempotencia,
  guardarSesion,
  leerSesion,
  olvidarClaveIdempotencia,
} from "@/lib/almacen-sesion"
import { EsqueletoPagina } from "@/components/esqueleto-pagina"

const CLAVE_CONTINGENCIA = "tienda-contingencia"

// ─── Types ───
interface PresentacionRow {
  presentacion_id: number
  producto_id: number
  producto_nombre: string
  presentacion_desc: string
  codigo_barras: string | null
  factor_conversion: number
  precio_venta: number
  categoria: string
  /** Stock del producto en unidades base (puede ser <= 0: se vende igual y se avisa). */
  stock: number
  /** Unidades base vendidas sin stock registrado. */
  pendiente: number
  /** Stock en la unidad base con su etiqueta ("4.43 lb"). */
  stock_texto: string
}

interface CajaTurno {
  id: number
  fondo_inicial: string
  estado: string
  fecha_apertura: string
  efectivo_esperado: string | null
}

/** Stock en la unidad de la presentación: "7 Six-pack + 2" en vez de 44 latas. Sin stock: se puede vender igual. */
function StockCelda({ row }: { row: PresentacionRow }) {
  if (row.stock <= 0) {
    return (
      <div className="w-24 shrink-0 text-right leading-tight">
        <span className="text-xs font-medium text-warning-text">Sin stock registrado</span>
        {row.pendiente > 0 && <p className="text-[10px] text-muted-foreground">vendido sin registrar</p>}
      </div>
    )
  }
  const { enteras, sueltas, haySueltas } = stockEnPresentacion(row.stock, row.factor_conversion)
  const empaque = row.factor_conversion > 1
  return (
    <div className="w-24 shrink-0 text-right leading-tight">
      {empaque ? (
        <>
          <span className="font-mono text-sm font-medium tabular-nums text-success">{formatCantidad(enteras)}</span>
          <p className="truncate text-[10px] text-muted-foreground">
            {row.presentacion_desc}
            {haySueltas ? ` + ${formatCantidad(sueltas)}` : ""}
          </p>
        </>
      ) : (
        <span className="font-mono text-sm font-medium tabular-nums text-success">{row.stock_texto}</span>
      )}
      {row.pendiente > 0 && <p className="text-[10px] text-warning-text">vendido sin registrar</p>}
    </div>
  )
}

export default function POSPage() {
  const { addItem, items, updateQuantity, setMonto, quitarMonto, removeItem, reinsertarItem, clearCart, getTotal } = useCartStore(
    useShallow((state) => ({
      addItem: state.addItem,
      items: state.items,
      updateQuantity: state.updateQuantity,
      setMonto: state.setMonto,
      quitarMonto: state.quitarMonto,
      removeItem: state.removeItem,
      reinsertarItem: state.reinsertarItem,
      clearCart: state.clearCart,
      getTotal: state.getTotal,
    }))
  )
  const [mounted, setMounted] = React.useState(false)
  const [cartOpen, setCartOpen] = React.useState(false)

  // ─── Datos del backend ───
  const { productos, categorias, loading, error, fetchInventory } = useInventoryStore(
    useShallow((state) => ({
      productos: state.productos,
      categorias: state.categorias,
      loading: state.loading,
      error: state.error,
      fetchInventory: state.fetchInventory,
    }))
  )

  // ─── Caja/Turno ───
  const [cajaActiva, setCajaActiva] = React.useState<CajaTurno | null>(null)
  const [cajaLoading, setCajaLoading] = React.useState(true)
  // true tras la primera respuesta: las recargas posteriores no hacen parpadear el encabezado.
  const [cajaCargada, setCajaCargada] = React.useState(false)
  // Error al consultar la caja (red/servidor): distinto de "no hay caja abierta".
  const [cajaError, setCajaError] = React.useState(false)
  const [openCajaDialog, setOpenCajaDialog] = React.useState(false)
  const [closeCajaDialog, setCloseCajaDialog] = React.useState(false)
  const [sacarDineroOpen, setSacarDineroOpen] = React.useState(false)
  const [efectivoDeclarado, setEfectivoDeclarado] = React.useState<string>("")
  const [montoBoveda, setMontoBoveda] = React.useState<string>("")
  const [autoOpenNext, setAutoOpenNext] = React.useState(true)
  const [observacionesCierre, setObservacionesCierre] = React.useState("")
  const [cajaActionLoading, setCajaActionLoading] = React.useState(false)

  // ─── Checkout ───
  const [checkoutLoading, setCheckoutLoading] = React.useState(false)
  const [checkoutError, setCheckoutError] = React.useState("")
  const [pagoCliente, setPagoCliente] = React.useState<string>("")
  // Modo contingencia (Bloque 3.D): registrar una venta de apagón con su hora real.
  const [contingencia, setContingencia] = React.useState(false)
  const [fechaContingencia, setFechaContingencia] = React.useState<string>("")
  // Tras una venta de apagón la fecha se conserva: se resalta para que la cajera la ajuste.
  const [fechaPorAjustar, setFechaPorAjustar] = React.useState(false)
  // Resumen de la última venta (cambio visible hasta que empiece la siguiente).
  const [ultimaVenta, setUltimaVenta] = React.useState<{ total: number; pago: number | null; cambio: number | null } | null>(null)
  const [vaciarOpen, setVaciarOpen] = React.useState(false)

  // ─── Filtros ───
  const [categoriaActiva, setCategoriaActiva] = React.useState("Todos")
  const [searchTerm, setSearchTerm] = React.useState("")

  // ─── Alta rápida de producto (D-02) ───
  const [altaRapida, setAltaRapida] = React.useState(false)
  // Valores con los que se abre el diálogo (lo buscado o el código escaneado).
  const [altaRapidaInicial, setAltaRapidaInicial] = React.useState({ nombre: "", codigo: "" })

  // Modo apagón (CAJ-23): se restaura tras recargar y se guarda en cada cambio.
  React.useEffect(() => {
    const guardado = leerSesion<{ fecha?: string }>(CLAVE_CONTINGENCIA)
    if (guardado) {
      setContingencia(true)
      setFechaContingencia(typeof guardado.fecha === "string" ? guardado.fecha : "")
    }
    setMounted(true)
  }, [])
  React.useEffect(() => {
    if (!mounted) return
    if (contingencia) guardarSesion(CLAVE_CONTINGENCIA, { fecha: fechaContingencia })
    else borrarSesion(CLAVE_CONTINGENCIA)
  }, [mounted, contingencia, fechaContingencia])

  // Precios al día (CAJ-16): al cargar o refrescar el catálogo, el ticket guardado
  // toma el precio actual de cada línea (el servidor cobra con ese).
  React.useEffect(() => {
    if (!mounted || productos.length === 0) return
    const precios = new Map<string, number>()
    for (const prod of productos) {
      for (const pres of prod.presentaciones) precios.set(`pres-${pres.id}`, aNumero(pres.precio_venta))
    }
    for (const c of useCartStore.getState().reconciliarPrecios(precios)) {
      toast.info(`El precio de «${c.nombre}» cambió: ahora ${formatMoney(c.precio)}.`, { id: `precio-${c.id}`, duration: 8000 })
    }
  }, [mounted, productos])

  const loadData = React.useCallback(async (forzar = false) => {
    await fetchInventory(forzar)
  }, [fetchInventory])

  // Un error de cobro queda visible hasta la siguiente acción: al cambiar el ticket se limpia.
  React.useEffect(() => {
    setCheckoutError("")
    if (items.length > 0) setUltimaVenta(null)
    // Ticket vacío (vaciar, quitar la última línea o cobrar): "Paga con" no pasa al siguiente cliente.
    else setPagoCliente("")
  }, [items])

  const loadCaja = React.useCallback(async () => {
    setCajaLoading(true)
    try {
      const caja = await apiFetch<CajaTurno>("/cajas-turnos/activa")
      setCajaActiva(caja)
      setCajaError(false)
    } catch (err) {
      if (tipoDeError(err) !== "no_encontrado") {
        // Red/servidor: no sabemos si hay caja. No ofrecer abrir otra; dejar reintentar.
        setCajaError(true)
        return
      }
      setCajaError(false)
      setCajaActiva(null)
    } finally {
      setCajaLoading(false)
      setCajaCargada(true)
    }
  }, [])

  React.useEffect(() => {
    if (mounted) { loadData(); loadCaja() }
  }, [mounted, loadData, loadCaja])

  // ─── Cerrar Caja ───
  const handleCerrarCaja = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cajaActiva) return
    const efectivoParsed = parseFloat(efectivoDeclarado)
    const bovedaParsed = parseFloat(montoBoveda) || 0

    if (isNaN(efectivoParsed) || efectivoParsed < 0) {
      toast.error("Por favor ingresa un total de efectivo físico válido")
      return
    }

    if (bovedaParsed > efectivoParsed) {
      toast.error("No puedes mandar a la bóveda más de lo que hay en la gaveta.")
      return
    }

    // Umbral de descuadre (§7): a partir de $1.00 el backend exige justificación.
    // Lo validamos aquí para evitar el round-trip. La diferencia siempre se registra.
    const esperado = parseFloat(cajaActiva.efectivo_esperado || cajaActiva.fondo_inicial)
    const descuadre = Math.abs(efectivoParsed - esperado)
    if (descuadre >= 1 && !observacionesCierre.trim()) {
      toast.error(`El descuadre de $${descuadre.toFixed(2)} requiere una justificación (Observaciones).`)
      return
    }

    const fondoSiguiente = efectivoParsed - bovedaParsed

    setCajaActionLoading(true)
    let cerrada: { diferencia?: string | number | null } | undefined
    try {
      // Cerrar: se declara el efectivo FÍSICO contado (para el descuadre real) y
      // cuánto se traslada a la bóveda. El backend registra el TRASLADO_A_BOVEDA
      // (no un "faltante") — ver docs/domain/caja-y-turnos.md y
      // docs/historial/modelo-contable/00-especificaciones.md §5.5.
      cerrada = await apiFetch<{ diferencia?: string | number | null }>(`/cajas-turnos/${cajaActiva.id}/cerrar`, {
        method: "PATCH",
        body: JSON.stringify({
          efectivo_declarado: efectivoParsed,
          monto_a_boveda: bovedaParsed,
          observaciones: observacionesCierre.trim() || undefined
        }),
      })

    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar caja")
      setCajaActionLoading(false)
      return
    }

    // El cierre salió bien: a partir de aquí la caja ya está cerrada. Resultado
    // visible hasta que la cajera lo toque (la reapertura automática lo haría invisible).
    const diferenciaCentavos = cerrada?.diferencia != null
      ? montoACentavos(cerrada.diferencia)
      : Math.round((efectivoParsed - esperado) * 100)
    toast.success(textoResultadoCierre(diferenciaCentavos, fondoSiguiente), {
      id: "cierre-caja",
      duration: Infinity,
      action: { label: "Entendido", onClick: () => {} },
    })
    try {
      // Reabrir automáticamente con lo que quedó en la gaveta
      if (autoOpenNext && fondoSiguiente > 0) {
        const nuevaCaja = await apiFetch<CajaTurno>("/cajas-turnos/abrir", {
          method: "POST",
          body: JSON.stringify({ fondo_inicial: fondoSiguiente }),
        })
        setCajaActiva(nuevaCaja)
      } else {
        setCajaActiva(null)
      }
    } catch {
      toast.warning("La caja se cerró, pero no se pudo abrir la siguiente: ábrela manualmente.")
      // Consultar el estado real en lugar de suponer cómo quedó.
      await loadCaja()
    } finally {
      setCloseCajaDialog(false)
      setEfectivoDeclarado("")
      setMontoBoveda("")
      setObservacionesCierre("")
      setCajaActionLoading(false)
    }
  }

  // ─── PROCESAR PAGO ───
  const handleCheckout = async () => {
    if (items.length === 0 || !cajaActiva) return
    setCheckoutLoading(true)
    setCheckoutError("")

    // Transformar carrito de Zustand al DTO del backend
    // Línea por monto -> { monto } (el servidor calcula la cantidad); las demás -> { cantidad }.
    const detalles = items.map(item => {
      const presentacion_id = parseInt(item.id.replace("pres-", ""))
      return item.modo === "monto" && item.monto !== undefined
        ? { presentacion_id, monto: Number(item.monto.toFixed(2)) }
        : { presentacion_id, cantidad: item.cantidad }
    })

    // Contingencia (3.D): si está activa y hay fecha, se envía la hora real.
    const fechaReal =
      contingencia && fechaContingencia
        ? new Date(fechaContingencia).toISOString()
        : undefined

    // Misma clave mientras el carrito (y la fecha) no cambien: un reintento tras
    // un error de red no duplica la venta.
    // La clave vive en sessionStorage: si se pierde la respuesta y la cajera recarga,
    // el reintento sigue usando la misma y el servidor devuelve la misma venta.
    const firma = JSON.stringify({ detalles, fechaReal })
    const idemKey = claveIdempotencia(firma)

    try {
      const venta = await apiFetch<{ total?: number | string; avisos?: string[] }>("/ventas", {
        method: "POST",
        headers: { "Idempotency-Key": idemKey },
        body: JSON.stringify(fechaReal ? { detalles, fecha: fechaReal } : { detalles }),
      })

      // Total del servidor; si no viniera, el calculado igual que él (línea a línea).
      const totalCobrado = venta?.total != null ? montoACentavos(venta.total) : montoACentavos(getTotal())
      const pagoCentavos = pagoCliente.trim() === "" ? null : montoACentavos(pagoCliente)
      const cambioCentavos = pagoCentavos !== null ? pagoCentavos - totalCobrado : null
      // Vendido sin stock registrado: la venta vale igual, solo se avisa (D-01), en un solo aviso corto.
      if (Array.isArray(venta?.avisos) && venta.avisos.length > 0) {
        toast.warning(textoAvisosSinStock(venta.avisos.length), {
          id: "avisos-sin-stock",
          duration: 6000,
          description: "El detalle está en Inventario.",
        })
      }

      setUltimaVenta({
        total: centavosAMonto(totalCobrado),
        pago: pagoCentavos !== null ? centavosAMonto(pagoCentavos) : null,
        cambio: cambioCentavos !== null && cambioCentavos >= 0 ? centavosAMonto(cambioCentavos) : null,
      })
      olvidarClaveIdempotencia()
      clearCart()
      setPagoCliente("")
      // Modo apagón: sigue activo con su fecha hasta que la cajera lo apague; solo se pide ajustar la hora.
      if (contingencia) setFechaPorAjustar(true)
      setCartOpen(false)
      // Recargar inventario (forzado: el caché de 3 min mostraría stock viejo)
      loadData(true)
      // Recargar caja para actualizar el efectivo esperado
      loadCaja()
    } catch (err: unknown) {
      // Se queda visible hasta la siguiente acción (no se oculta solo).
      const base = err instanceof Error ? err.message : "No se pudo registrar la venta. Intenta de nuevo."
      // Con fallo de red o del servidor la venta pudo haber quedado registrada aunque no llegara la respuesta.
      const dudosa = ["red", "servidor"].includes(tipoDeError(err) ?? "")
      const mensaje = dudosa ? `${base} Antes de cobrar otra vez, revisa en Movimientos si la venta ya quedó.` : base
      setCheckoutError(mensaje)
      toast.error(mensaje, { id: "error-cobro", duration: 8000 })
    } finally {
      setCheckoutLoading(false)
    }
  }

  // ─── Aplanar productos → filas de presentaciones ───
  const allRows: PresentacionRow[] = productos.flatMap(prod => {
    const stock = stockTotalDe(prod)
    const pendiente = pendienteTotalDe(prod)
    return prod.presentaciones.map(pres => ({
      presentacion_id: pres.id,
      producto_id: prod.id,
      producto_nombre: prod.nombre,
      presentacion_desc: pres.descripcion,
      codigo_barras: pres.codigo_barras,
      factor_conversion: aNumero(pres.factor_conversion),
      precio_venta: aNumero(pres.precio_venta),
      categoria: prod.categorias.nombre,
      stock,
      pendiente,
      stock_texto: formatStock(stock, prod.presentaciones),
    }))
  })

  const categoryNames = ["Todos", ...categorias.map(c => c.nombre)]

  const busqueda = normalizarBusqueda(searchTerm)
  const filteredRows = allRows.filter(row => {
    const matchCategoria = categoriaActiva === "Todos" || row.categoria === categoriaActiva
    const matchSearch = busqueda === "" ||
      normalizarBusqueda(row.producto_nombre).includes(busqueda) ||
      normalizarBusqueda(row.presentacion_desc).includes(busqueda) ||
      row.codigo_barras?.includes(searchTerm.trim())
    return matchCategoria && matchSearch
  })

  const handleAddToCart = React.useCallback((row: PresentacionRow) => {
    // Vibración corta como confirmación al tocar (si el aparato la tiene).
    try { navigator.vibrate?.(15) } catch { /* sin vibración */ }
    addItem({
      id: `pres-${row.presentacion_id}`,
      producto_nombre: row.producto_nombre,
      presentacion_nombre: row.presentacion_desc,
      nombre: row.factor_conversion === 1
        ? row.producto_nombre
        : `${row.producto_nombre} (${row.presentacion_desc})`,
      precio: row.precio_venta,
    })
  }, [addItem])

  const abrirAltaRapida = React.useCallback((nombre: string, codigo: string) => {
    setAltaRapidaInicial({ nombre, codigo })
    setAltaRapida(true)
  }, [])

  // Lo buscado: si parece un código de barras (solo números, 6 o más), va al código; si no, al nombre.
  const abrirAltaDesdeBusqueda = () => {
    const t = searchTerm.trim()
    if (/^\d{6,}$/.test(t)) abrirAltaRapida("", t)
    else abrirAltaRapida(t, "")
  }

  // Producto recién creado: entra al ticket (cantidad 1) y se refresca el catálogo.
  const handleAltaCreada = async (prod: ProductoRapido) => {
    const pres = prod.presentaciones?.[0]
    if (pres) {
      addItem({
        id: `pres-${pres.id}`,
        producto_nombre: prod.nombre,
        presentacion_nombre: pres.descripcion,
        nombre: aNumero(pres.factor_conversion) === 1
          ? prod.nombre
          : `${prod.nombre} (${pres.descripcion})`,
        precio: aNumero(pres.precio_venta),
      })
    }
    setSearchTerm("")
    toast.success(`«${prod.nombre}» agregado al ticket. Después se revisa en Inventario.`)
    await loadData(true)
  }

  // Aviso breve de lectura: mismo id, así cada uno reemplaza al anterior y no se acumulan.
  const avisarAgregado = (row: PresentacionRow) => {
    const nombre = row.factor_conversion === 1 ? row.producto_nombre : `${row.producto_nombre} (${row.presentacion_desc})`
    toast.success(`Agregado: ${nombre}`, { id: "agregado-rapido", duration: 1500, position: "top-center" })
  }

  // Tocar una fila: agrega y avisa con el mismo id que el escáner (no se apilan).
  const agregarDesdeFila = (row: PresentacionRow) => {
    handleAddToCart(row)
    avisarAgregado(row)
  }

  // Quitar una línea con "Deshacer": la reinserta tal como estaba (cantidad, modo, monto y posición).
  const quitarConDeshacer = (id: string) => {
    const indice = items.findIndex((i) => i.id === id)
    if (indice < 0) return
    const linea = items[indice]
    removeItem(id)
    toast(`Quitaste «${linea.producto_nombre || linea.nombre}»`, {
      id: `quitar-${id}`,
      duration: 6000,
      action: { label: "Deshacer", onClick: () => reinsertarItem(linea, indice) },
    })
  }

  // Enter en el buscador: agrega si hay un solo resultado (o si lo escrito es justo un código de barras).
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return
    e.preventDefault()
    const t = searchTerm.trim()
    if (!t) return
    const porCodigo = allRows.find(r => r.codigo_barras === t)
    const elegido = porCodigo ?? (filteredRows.length === 1 ? filteredRows[0] : undefined)
    if (elegido) {
      handleAddToCart(elegido)
      avisarAgregado(elegido)
      setSearchTerm("")
    } else if (filteredRows.length > 1) {
      toast.info("Hay varios resultados: toca el producto que quieres.", { id: "agregado-rapido", duration: 2500, position: "top-center" })
    }
  }

  // ─── Lector de Código de Barras Global ───
  const onBarcodeScanned = React.useCallback((barcode: string) => {
    const targetRow = allRows.find(r => r.codigo_barras === barcode)
    if (targetRow) {
      handleAddToCart(targetRow)
      avisarAgregado(targetRow)
    } else {
      toast.warning(`Código no encontrado en el catálogo: ${barcode}`, {
        duration: 12000,
        action: { label: "Agregar como producto nuevo", onClick: () => abrirAltaRapida("", barcode) },
      })
    }
  }, [allRows, handleAddToCart, abrirAltaRapida])

  useBarcodeScanner({ onScan: onBarcodeScanned, enabled: mounted })

  if (!mounted) return <EsqueletoPagina />
  const mostrandoCarga = cajaLoading && !cajaCargada

  const total = getTotal()
  const pedirVaciar = () => {
    if (items.length > 1) setVaciarOpen(true)
    else clearCart()
  }
  // Cierre de caja: diferencia en vivo entre lo contado y lo esperado (centavos enteros).
  const contadoTexto = efectivoDeclarado.trim()
  const difCierre = cajaActiva && contadoTexto !== "" && !isNaN(parseFloat(contadoTexto))
    ? montoACentavos(contadoTexto) - montoACentavos(cajaActiva.efectivo_esperado || cajaActiva.fondo_inicial)
    : null
  const exigeExplicacion = difCierre !== null && Math.abs(difCierre) >= 100
  const faltaExplicacion = exigeExplicacion && !observacionesCierre.trim()
  // Número de productos distintos (líneas), no la suma de cantidades (que puede ser fraccionada).
  const itemCount = items.length
  // Líneas del ticket por id: la fila del catálogo muestra "× N" si ya está.
  const enTicket = new Map(items.map((i) => [i.id, i]))
  const faltaFecha = contingencia && !fechaContingencia
  const modoApagon = (
    <ModoApagon
      contingencia={contingencia}
      setContingencia={setContingencia}
      fechaContingencia={fechaContingencia}
      setFechaContingencia={setFechaContingencia}
      fechaPorAjustar={fechaPorAjustar}
      setFechaPorAjustar={setFechaPorAjustar}
    />
  )
  const checkout = (
    <CheckoutSection
      total={total}
      itemCount={itemCount}
      pagoCliente={pagoCliente}
      setPagoCliente={setPagoCliente}
      onCheckout={handleCheckout}
      checkoutLoading={checkoutLoading}
      hasCaja={!!cajaActiva}
      checkoutError={checkoutError}
      faltaFecha={faltaFecha}
      ultimaVenta={ultimaVenta}
    />
  )

  const emptyTicket = (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <ShoppingCart className="h-10 w-10 opacity-30" />
      <p className="text-sm font-medium text-foreground">Ticket vacío</p>
      <p className="text-xs">Escanea o toca un producto para empezar</p>
    </div>
  )

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground lg:h-full lg:min-h-0 lg:flex-row">
      {/* ════════ CATÁLOGO ════════ */}
      <section className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
        {/* Encabezado: en escritorio todo pegajoso; en celular solo el buscador (el resto se desplaza con la lista) */}
        <div className="contents lg:sticky lg:top-0 lg:z-10 lg:block lg:border-b lg:border-border lg:bg-background/95 lg:backdrop-blur">
          <div className="flex items-center justify-between gap-x-3 gap-y-2 px-4 py-2 lg:flex-wrap lg:py-3 lg:px-6">
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight lg:text-xl">Nueva venta</h1>
              {mostrandoCarga ? (
                <p className="text-xs text-muted-foreground">Revisando caja…</p>
              ) : cajaActiva ? (
                <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                  <span className="h-2 w-2 rounded-full bg-success" /> Caja abierta
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Caja cerrada</p>
              )}
            </div>

            {mostrandoCarga ? (
              <div className="flex h-11 min-w-32 items-center justify-center px-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : cajaActiva ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSacarDineroOpen(true)}
                  aria-label="Sacar dinero de la gaveta"
                  className="h-11 md:h-11 gap-2"
                >
                  <HandCoins className="h-4 w-4" />
                  <span className="sm:hidden">Sacar</span>
                  <span className="hidden sm:inline">Sacar dinero</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { loadCaja(); setCloseCajaDialog(true) }}
                  className="h-11 md:h-11 gap-2"
                >
                  <DoorClosed className="h-4 w-4" />
                  Cerrar caja
                </Button>
              </div>
            ) : cajaError ? (
              <Button
                variant="outline"
                onClick={() => loadCaja()}
                className="h-11 md:h-11 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <RefreshCw className="h-4 w-4" /> Sin conexión · Reintentar
              </Button>
            ) : (
              <Button
                onClick={() => { loadCaja(); setOpenCajaDialog(true) }}
                className="h-11 md:h-11 gap-2 bg-warning text-warning-foreground hover:bg-warning/90"
              >
                <DoorOpen className="h-4 w-4" /> Abrir caja
              </Button>
            )}
          </div>

          {/* Modo apagón: visible mientras esté encendido */}
          {contingencia && (
            <div className="flex items-center justify-between gap-2 border-t border-warning/30 bg-warning/15 px-4 py-2 text-xs font-medium text-warning-text lg:px-6">
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 shrink-0" /> Modo apagón activo: las ventas se guardan con la fecha y hora que pongas
              </span>
              <Button type="button" size="sm" variant="outline" className="h-11 md:h-9 shrink-0" onClick={() => { setContingencia(false); setFechaContingencia(""); setFechaPorAjustar(false) }}>
                Apagar
              </Button>
            </div>
          )}

          {/* Búsqueda + escaneo */}
          <div className="sticky top-0 z-10 bg-background/95 px-4 pb-2 pt-1 backdrop-blur lg:static lg:bg-transparent lg:px-6 lg:pb-3 lg:pt-0 lg:backdrop-blur-none">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-12 md:h-12 pl-10 pr-10 text-base"
                placeholder="Buscar producto o código…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              <ScanBarcode className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          {/* Chips de categoría */}
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 lg:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categoryNames.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoriaActiva(cat)}
                aria-pressed={categoriaActiva === cat}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center rounded-sm px-3 py-1.5 text-xs font-medium transition-colors md:min-h-0",
                  categoriaActiva === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Banner: caja cerrada */}
          {!mostrandoCarga && !cajaActiva && (
            cajaError ? (
              <div className="flex items-center justify-center gap-2 border-t border-destructive/20 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Sin conexión: no se pudo revisar la caja. Revisa el internet y toca «Reintentar».
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 border-t border-warning/20 bg-warning/10 px-4 py-2 text-xs font-medium text-warning-text">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Debes abrir un turno de caja antes de vender
              </div>
            )
          )}
        </div>

        {/* Lista de presentaciones */}
        <div className="lg:flex-1 lg:overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">Cargando catálogo…</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <AlertTriangle className="h-9 w-9 text-destructive/70" />
              <p className="text-sm font-medium text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => { loadData(); loadCaja() }}>
                <RefreshCw className="h-4 w-4" /> Reintentar
              </Button>
            </div>
          )}

          {!loading && !error && (
            filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-muted-foreground">
                <Search className="h-8 w-8 opacity-30" />
                <p className="text-sm font-medium text-foreground">No se encontraron productos</p>
                <p className="text-xs">¿No está en el catálogo? Agrégalo y véndelo ahora.</p>
                <Button type="button" className="mt-2 h-11 md:h-11 gap-2" onClick={abrirAltaDesdeBusqueda}>
                  <PackagePlus className="h-4 w-4" /> Agregar como producto nuevo
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border pb-36 lg:pb-6">
                {filteredRows.map((row) => (
                  <li key={row.presentacion_id}>
                    <button
                      type="button"
                      onClick={() => agregarDesdeFila(row)}
                      className={cn(
                        "group flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 sm:gap-3 sm:py-3 lg:px-6",
                        enTicket.has(`pres-${row.presentacion_id}`) && "bg-primary/5",
                      )}
                    >
                      <div className="hidden w-24 shrink-0 truncate font-mono text-xs text-muted-foreground sm:block">
                        {row.codigo_barras || `P${String(row.presentacion_id).padStart(4, '0')}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground sm:truncate">{row.producto_nombre}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.presentacion_desc}</p>
                      </div>
                      <StockCelda row={row} />
                      <div className="w-16 shrink-0 text-right sm:w-20">
                        <MoneyValue value={row.precio_venta} className="text-base font-semibold" />
                      </div>
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Plus className="h-4 w-4" />
                        {enTicket.has(`pres-${row.presentacion_id}`) && (
                          // Posición absoluta: la insignia no cambia la altura ni el ancho de la fila.
                          <span
                            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-semibold leading-none text-primary-foreground ring-2 ring-background"
                            aria-label={`${formatCantidad(enTicket.get(`pres-${row.presentacion_id}`)!.cantidad)} en el ticket`}
                          >
                            ×{formatCantidad(enTicket.get(`pres-${row.presentacion_id}`)!.cantidad)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </section>

      {/* ════════ TICKET (panel de escritorio) ════════ */}
      <aside className="hidden w-[380px] flex-col border-l border-border bg-card lg:flex lg:h-full">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShoppingCart className="h-5 w-5 text-primary" /> Ticket
          </h2>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={pedirVaciar}>
              Vaciar
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? emptyTicket : (
            <CartLines items={items} updateQuantity={updateQuantity} setMonto={setMonto} quitarMonto={quitarMonto} removeItem={quitarConDeshacer} />
          )}
          <div className="flex flex-col pb-3">{modoApagon}</div>
        </div>
        <div className="border-t border-border p-4">{checkout}</div>
      </aside>

      {/* ════════ BARRA DE CARRITO (móvil) ════════ */}
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        aria-label={itemCount > 0 ? `Cobrar, ${itemCount} ${itemCount === 1 ? "producto" : "productos"}, ${formatMoney(total)}` : "Ver ticket"}
        className={cn(
          "fixed inset-x-0 z-40 flex items-center justify-between gap-3 border-t px-4 py-3 text-left lg:hidden",
          // Fondo opaco (bg-card); el tinte de éxito va en una capa encima para que nada de atrás se vea.
          "isolate overflow-hidden bg-card",
          itemCount === 0 && ultimaVenta ? "border-success/40" : "border-border",
        )}
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
      >
        {itemCount === 0 && ultimaVenta && <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-success/10" />}
        {itemCount > 0 ? (
          <>
            <span className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary text-primary-foreground">
                <ShoppingCart className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold">
                Cobrar · {itemCount} {itemCount === 1 ? "producto" : "productos"} · {formatMoney(total)}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </>
        ) : ultimaVenta ? (
          // Única confirmación de la venta en celular: el cambio, sin tocar nada, hasta el siguiente producto.
          <>
            <span role="status" className="flex flex-col leading-tight text-success">
              <span className="text-xs font-medium">Venta registrada · {formatMoney(ultimaVenta.total)}</span>
              {ultimaVenta.cambio !== null ? (
                <span className="text-2xl font-bold tabular-nums">Cambio: {formatMoney(ultimaVenta.cambio)}</span>
              ) : (
                <span className="text-sm font-semibold">Cobrada sin dato de pago</span>
              )}
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </>
        ) : (
          <>
            <span className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
              <ShoppingCart className="h-5 w-5" /> Ticket vacío
            </span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </>
        )}
      </button>

      {/* ════════ BOTTOM SHEET: TICKET (móvil) ════════ */}
      <BottomSheet open={cartOpen} onOpenChange={setCartOpen}>
        <BottomSheetContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden px-4 lg:hidden">
          <BottomSheetHeader className="flex-row items-center justify-between p-0 pb-1">
            <BottomSheetTitle>Ticket de compra</BottomSheetTitle>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" className="mr-8 text-muted-foreground hover:text-destructive" onClick={pedirVaciar}>
                Vaciar
              </Button>
            )}
          </BottomSheetHeader>
          {items.length === 0 ? emptyTicket : (
            <>
              {/* Líneas: se desplazan. El cobro queda fijo abajo y siempre se ve. */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <CartLines items={items} updateQuantity={updateQuantity} setMonto={setMonto} quitarMonto={quitarMonto} removeItem={quitarConDeshacer} />
                <div className="flex flex-col pb-2">{modoApagon}</div>
              </div>
              <div className="shrink-0 border-t border-border pt-3">{checkout}</div>
            </>
          )}
        </BottomSheetContent>
      </BottomSheet>

      {/* ════════ DIALOG: ALTA RÁPIDA DE PRODUCTO ════════ */}
      <AltaRapidaDialog
        open={altaRapida}
        onOpenChange={setAltaRapida}
        nombreInicial={altaRapidaInicial.nombre}
        codigoInicial={altaRapidaInicial.codigo}
        onCreado={handleAltaCreada}
      />

      {/* ════════ DIALOG: ABRIR CAJA ════════ */}
      <AbrirCajaDialog<CajaTurno>
        open={openCajaDialog}
        onOpenChange={setOpenCajaDialog}
        onAbierta={setCajaActiva}
      />

      {/* ════════ DIALOG: CERRAR CAJA ════════ */}
      <Dialog open={closeCajaDialog} onOpenChange={setCloseCajaDialog}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorClosed className="h-5 w-5 text-warning-text" /> Cerrar turno de caja
            </DialogTitle>
            <DialogDescription>
              Ingresa el total físico y cuánto enviarás a la bóveda.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCerrarCaja} className="flex flex-col gap-4">
            {cajaActiva && (
              <div className="flex items-center justify-between rounded-sm border border-border bg-muted/50 p-3 text-xs">
                <span className="text-muted-foreground">Efectivo esperado (sistema)</span>
                <MoneyValue value={cajaActiva.efectivo_esperado || cajaActiva.fondo_inicial} className="text-sm font-semibold" />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="pos-total-fisico-en-gaveta" className="text-xs font-medium text-muted-foreground">Total físico en gaveta ($)</Label>
              <Input id="pos-total-fisico-en-gaveta"
                type="number" min={0} step="0.01" inputMode="decimal" value={efectivoDeclarado}
                onChange={(e) => setEfectivoDeclarado(e.target.value)}
                className="h-12 md:h-12 text-center font-mono text-xl font-bold tabular-nums"
                autoFocus
              />
            </div>

            {difCierre !== null && (
              <p
                role="status"
                className={cn(
                  "rounded-sm px-3 py-2 text-center text-sm font-semibold",
                  difCierre === 0 ? "bg-success/10 text-success" : exigeExplicacion ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-text",
                )}
              >
                {difCierre === 0
                  ? "Cuadra"
                  : difCierre > 0
                    ? `Sobran ${formatMoney(centavosAMonto(difCierre))}`
                    : `Faltan ${formatMoney(centavosAMonto(-difCierre))}`}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="pos-trasladar-a-boveda" className="text-xs font-medium text-success">Trasladar a bóveda ($)</Label>
              <Input id="pos-trasladar-a-boveda"
                type="number" min={0} step="0.01" inputMode="decimal" value={montoBoveda}
                onChange={(e) => setMontoBoveda(e.target.value)}
                placeholder="0.00"
                className="h-12 md:h-12 text-center font-mono text-xl font-bold tabular-nums"
              />
            </div>

            <div className="flex items-center justify-between rounded-sm border border-border p-3">
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">Fondo siguiente turno</p>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox" checked={autoOpenNext}
                    onChange={e => setAutoOpenNext(e.target.checked)}
                    className="h-4 w-4 rounded-sm accent-primary"
                  />
                  Reabrir automáticamente
                </label>
              </div>
              <MoneyValue
                value={Math.max(0, (parseFloat(efectivoDeclarado) || 0) - (parseFloat(montoBoveda) || 0))}
                className="text-xl font-bold"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="pos-observaciones-cierre" className={cn("text-xs font-medium", exigeExplicacion ? "text-destructive" : "text-muted-foreground")}>
                {exigeExplicacion ? "Explica la diferencia (obligatorio desde $1)" : "Observaciones (opcional)"}
              </Label>
              <Input id="pos-observaciones-cierre"
                type="text" value={observacionesCierre}
                onChange={(e) => setObservacionesCierre(e.target.value)}
                placeholder={exigeExplicacion ? "Ej. Se dio mal un vuelto" : "Razón de descuadre o nota…"}
                aria-invalid={faltaExplicacion}
                className="h-11 md:h-11"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCloseCajaDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={cajaActionLoading || faltaExplicacion} className="gap-2 bg-warning text-warning-foreground hover:bg-warning/90">
                {cajaActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
                {faltaExplicacion ? "Explica la diferencia para cerrar" : "Confirmar cierre"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════ CONFIRMAR VACIAR TICKET ════════ */}
      <Dialog open={vaciarOpen} onOpenChange={setVaciarOpen}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>¿Vaciar el ticket?</DialogTitle>
            <DialogDescription>Se quitan los {items.length} productos. La venta no se registra.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 md:h-11" onClick={() => setVaciarOpen(false)}>Cancelar</Button>
            <Button type="button" variant="destructive" className="h-11 md:h-11" onClick={() => { clearCart(); setVaciarOpen(false) }}>Sí, vaciar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ SACAR DINERO (bóveda / gasto / retiro personal) ════════ */}
      <SacarDineroDialog
        open={sacarDineroOpen}
        onOpenChange={setSacarDineroOpen}
        onSuccess={loadCaja}
      />
    </div>
  )
}
