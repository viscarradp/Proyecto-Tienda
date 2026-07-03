'use client'

import * as React from "react"
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  ChevronRight,
  Store,
  Loader2,
  AlertTriangle,
  RefreshCw,
  DoorOpen,
  DoorClosed,
  CheckCircle2,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useShallow } from "zustand/react/shallow"
import { useCartStore } from "@/src/store/cartStore"
import { useInventoryStore, type Producto, type Categoria } from "../../../src/store/inventoryStore"
import { apiFetch } from "@/lib/api"
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner"

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
  stock: number
}

interface CajaTurno {
  id: number
  fondo_inicial: string
  estado: string
  fecha_apertura: string
  efectivo_esperado: string | null
}

export default function POSPage() {
  const { addItem, items, updateQuantity, removeItem, clearCart, getTotal } = useCartStore(
    useShallow((state) => ({
      addItem: state.addItem,
      items: state.items,
      updateQuantity: state.updateQuantity,
      removeItem: state.removeItem,
      clearCart: state.clearCart,
      getTotal: state.getTotal,
    }))
  )
  const [mounted, setMounted] = React.useState(false)

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
  const [openCajaDialog, setOpenCajaDialog] = React.useState(false)
  const [closeCajaDialog, setCloseCajaDialog] = React.useState(false)
  const [fondoInicial, setFondoInicial] = React.useState<string>("")
  const [efectivoDeclarado, setEfectivoDeclarado] = React.useState<string>("")
  const [montoBoveda, setMontoBoveda] = React.useState<string>("")
  const [autoOpenNext, setAutoOpenNext] = React.useState(true)
  const [observacionesCierre, setObservacionesCierre] = React.useState("")
  const [cajaActionLoading, setCajaActionLoading] = React.useState(false)

  // ─── Checkout ───
  const [checkoutLoading, setCheckoutLoading] = React.useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = React.useState(false)
  const [checkoutError, setCheckoutError] = React.useState("")
  const [pagoCliente, setPagoCliente] = React.useState<string>("")
  const [ultimoCierreFondo, setUltimoCierreFondo] = React.useState<number | null>(null)

  // ─── Filtros ───
  const [categoriaActiva, setCategoriaActiva] = React.useState("Todos")
  const [searchTerm, setSearchTerm] = React.useState("")

  React.useEffect(() => { setMounted(true) }, [])

  const loadData = React.useCallback(async () => {
    await fetchInventory()
  }, [fetchInventory])

  const loadCaja = React.useCallback(async () => {
    setCajaLoading(true)
    try {
      const caja = await apiFetch<CajaTurno>("/cajas-turnos/activa")
      setCajaActiva(caja)
      setUltimoCierreFondo(null)
    } catch {
      setCajaActiva(null)
      try {
        const ult = await apiFetch<{fondo_siguiente: number | string}>("/cajas-turnos/ultimo-cierre")
        const parsedVal = Number(ult.fondo_siguiente) || 0
        setUltimoCierreFondo(parsedVal)
        if (parsedVal > 0) {
          setFondoInicial(parsedVal.toString())
        }
      } catch {
        setUltimoCierreFondo(0)
      }
    } finally {
      setCajaLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (mounted) { loadData(); loadCaja() }
  }, [mounted, loadData, loadCaja])

  // ─── Abrir Caja ───
  const handleAbrirCaja = async (e: React.FormEvent) => {
    e.preventDefault()
    const fondoParsed = parseFloat(fondoInicial)
    if (isNaN(fondoParsed) || fondoParsed < 0) {
      toast.error("Por favor ingresa un fondo inicial válido (mayor o igual a 0)")
      return
    }
    setCajaActionLoading(true)
    try {
      const caja = await apiFetch<CajaTurno>("/cajas-turnos/abrir", {
        method: "POST",
        body: JSON.stringify({ fondo_inicial: fondoParsed }),
      })
      setCajaActiva(caja)
      setOpenCajaDialog(false)
      setFondoInicial("")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al abrir caja")
    } finally {
      setCajaActionLoading(false)
    }
  }

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
      toast.error("El monto enviado a bóveda no puede ser mayor al total físico en caja.")
      return
    }

    const fondoSiguiente = efectivoParsed - bovedaParsed

    setCajaActionLoading(true)
    try {
      // 1. Enviar a Bóveda si hay monto
      if (bovedaParsed > 0) {
        await apiFetch(`/movimientos-financieros`, {
          method: "POST",
          body: JSON.stringify({
            tipo_movimiento: "RETIRO_BOVEDA",
            monto: bovedaParsed,
            descripcion: "Traspaso automático a Bóveda al cierre de turno"
          })
        })
      }

      // 2. Cerrar el turno declarando SOLO el fondo restante
      await apiFetch(`/cajas-turnos/${cajaActiva.id}/cerrar`, {
        method: "PATCH",
        body: JSON.stringify({ 
          efectivo_declarado: fondoSiguiente,
          observaciones: observacionesCierre.trim() || undefined
        }),
      })

      // 3. Reabrir automáticamente
      if (autoOpenNext && fondoSiguiente > 0) {
        const nuevaCaja = await apiFetch<CajaTurno>("/cajas-turnos/abrir", {
          method: "POST",
          body: JSON.stringify({ fondo_inicial: fondoSiguiente }),
        })
        setCajaActiva(nuevaCaja)
      } else {
        setCajaActiva(null)
      }

      setCloseCajaDialog(false)
      setEfectivoDeclarado("")
      setMontoBoveda("")
      setObservacionesCierre("")
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar caja")
    } finally {
      setCajaActionLoading(false)
    }
  }

  // ─── PROCESAR PAGO ───
  const handleCheckout = async () => {
    if (items.length === 0 || !cajaActiva) return
    setCheckoutLoading(true)
    setCheckoutError("")

    // Transformar carrito de Zustand al DTO del backend
    const detalles = items.map(item => ({
      presentacion_id: parseInt(item.id.replace("pres-", "")),
      cantidad: item.cantidad,
    }))

    try {
      await apiFetch("/ventas", {
        method: "POST",
        body: JSON.stringify({ detalles }),
      })

      clearCart()
      setPagoCliente("")
      setCheckoutSuccess(true)
      // Recargar datos para actualizar stock
      loadData()
      // Recargar caja para actualizar el efectivo esperado
      loadCaja()
      setTimeout(() => setCheckoutSuccess(false), 3000)
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : "Error al procesar venta")
      setTimeout(() => setCheckoutError(""), 5000)
    } finally {
      setCheckoutLoading(false)
    }
  }

  // ─── Aplanar productos → filas de presentaciones ───
  const allRows: PresentacionRow[] = productos.flatMap(prod => {
    const stock = prod.lotes_inventario.reduce((s, l) => s + l.cantidad_disponible, 0)
    return prod.presentaciones.map(pres => ({
      presentacion_id: pres.id,
      producto_id: prod.id,
      producto_nombre: prod.nombre,
      presentacion_desc: pres.descripcion,
      codigo_barras: pres.codigo_barras,
      factor_conversion: pres.factor_conversion,
      precio_venta: parseFloat(pres.precio_venta),
      categoria: prod.categorias.nombre,
      stock,
    }))
  })

  const categoryNames = ["Todos", ...categorias.map(c => c.nombre)]

  const filteredRows = allRows.filter(row => {
    const matchCategoria = categoriaActiva === "Todos" || row.categoria === categoriaActiva
    const matchSearch = searchTerm === "" ||
      row.producto_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.presentacion_desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.codigo_barras?.includes(searchTerm)
    return matchCategoria && matchSearch
  })

  const handleAddToCart = React.useCallback((row: PresentacionRow) => {
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

  // ─── Lector de Código de Barras Global ───
  const onBarcodeScanned = React.useCallback((barcode: string) => {
    const targetRow = allRows.find(r => r.codigo_barras === barcode)
    if (targetRow) {
      handleAddToCart(targetRow)
    } else {
      toast.warning(`Código no encontrado en el catálogo: ${barcode}`)
    }
  }, [allRows, handleAddToCart])

  useBarcodeScanner({ onScan: onBarcodeScanned, enabled: mounted })

  if (!mounted) return null

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-12 h-screen bg-black overflow-hidden text-slate-200">

      {/* ════════ PANEL IZQUIERDO: CATÁLOGO ════════ */}
      <div className="lg:col-span-8 flex flex-col h-full overflow-hidden border-r border-zinc-900 bg-black">
        <header className="sticky top-0 z-20 bg-black/60 backdrop-blur-xl border-b border-zinc-900 p-4 lg:px-8 lg:py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-1.5 bg-blue-600 rounded-full shadow-[0_0_15px_rgba(37,99,235,0.5)]" />
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white uppercase">Nueva venta</h1>
                <p className="text-[10px] font-bold text-zinc-500 tracking-[0.2em] mt-0.5">TERMINAL 01 • POS</p>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-1 max-w-2xl">
              <div className="relative flex-1 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-600 group-focus-within:text-blue-500 transition-colors" />
                <Input
                  className="pl-12 pr-12 h-14 bg-zinc-950 border-zinc-800 rounded-2xl focus-visible:ring-blue-600 focus-visible:bg-black transition-all text-base font-medium text-white placeholder:text-zinc-700 shadow-inner"
                  placeholder="Buscar producto o código de barras..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl cursor-pointer hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                  <ScanBarcode className="h-5 w-5" />
                </div>
              </div>

              {/* Botón de estado de caja */}
              {cajaLoading ? (
                <div className="h-14 px-5 flex items-center gap-2 text-zinc-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : cajaActiva ? (
                <Button variant="outline" onClick={() => { loadCaja(); setCloseCajaDialog(true); }}
                  className="h-14 px-5 rounded-2xl border-emerald-800/50 bg-emerald-950/30 font-bold gap-3 text-emerald-400 hover:bg-emerald-900/40 hover:text-emerald-300 hidden md:flex transition-all">
                  <Store className="h-5 w-5 text-emerald-500" />
                  Caja Abierta
                  <DoorClosed className="h-4 w-4 opacity-50" />
                </Button>
              ) : (
                <Button onClick={() => { loadCaja(); setOpenCajaDialog(true); }}
                  className="h-14 px-5 rounded-2xl bg-amber-600 hover:bg-amber-500 font-bold gap-3 text-white hidden md:flex transition-all shadow-lg shadow-amber-900/20">
                  <DoorOpen className="h-5 w-5" />
                  Abrir Caja
                </Button>
              )}
            </div>
          </div>

          {/* Banner: caja cerrada */}
          {!cajaLoading && !cajaActiva && (
            <div className="mt-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm p-3 rounded-xl font-medium text-center flex items-center justify-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Debes abrir un turno de caja antes de realizar ventas
            </div>
          )}

          {/* Tabs de categoría */}
          <div className="mt-6">
            <Tabs value={categoriaActiva} onValueChange={setCategoriaActiva} className="w-full">
              <ScrollArea className="w-full whitespace-nowrap pb-2">
                <TabsList className="bg-zinc-950/50 p-1.5 rounded-[20px] h-auto gap-1.5 border border-zinc-900">
                  {categoryNames.map((cat) => (
                    <TabsTrigger key={cat} value={cat}
                      className="px-6 py-2.5 rounded-[16px] font-black text-[11px] uppercase tracking-widest text-zinc-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all duration-300">
                      {cat}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </ScrollArea>
            </Tabs>
          </div>
        </header>

        {/* Tabla de presentaciones */}
        <ScrollArea className="flex-1">
          <div className="min-w-full">
            <div className="sticky top-0 bg-black/95 backdrop-blur z-10 border-b border-zinc-900 px-8 py-3 flex text-[10px] font-black uppercase tracking-widest text-zinc-600">
              <div className="w-24">Código</div>
              <div className="flex-1">Producto / Presentación</div>
              <div className="w-20 text-right">Stock</div>
              <div className="w-32 text-right">Precio</div>
              <div className="w-20 text-center">Vender</div>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-24 gap-3 text-zinc-500">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <span className="font-bold text-sm">Cargando catálogo...</span>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-zinc-400">
                <AlertTriangle className="h-10 w-10 text-red-500/60" />
                <p className="text-sm font-bold text-red-400">{error}</p>
                <Button variant="outline" size="sm" className="rounded-xl border-zinc-800 gap-2" onClick={() => { loadData(); loadCaja() }}>
                  <RefreshCw className="h-4 w-4" /> Reintentar
                </Button>
              </div>
            )}

            {!loading && !error && (
              <div className="pb-24 lg:pb-12">
                {filteredRows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-2">
                    <Search className="h-8 w-8 opacity-30" />
                    <p className="font-bold text-sm">No se encontraron productos</p>
                    <p className="text-[11px] text-zinc-600">Verifica que los productos tengan presentaciones creadas</p>
                  </div>
                ) : (
                  filteredRows.map((row) => (
                    <div key={row.presentacion_id}
                      className="group border-b border-zinc-900/50 hover:bg-zinc-900/40 transition-colors cursor-pointer px-8 py-4 flex items-center"
                      onClick={() => handleAddToCart(row)}>
                      <div className="w-24 text-xs font-mono text-zinc-600 group-hover:text-blue-500 transition-colors truncate pr-2">
                        {row.codigo_barras || `P${String(row.presentacion_id).padStart(4, '0')}`}
                      </div>
                      <div className="flex-1 truncate pr-4">
                        <span className="font-bold text-sm text-zinc-300 group-hover:text-white transition-colors">{row.producto_nombre}</span>
                        {row.factor_conversion !== 1 && (
                          <span className="text-xs text-blue-500/70 ml-2 font-bold">{row.presentacion_desc}</span>
                        )}
                        {row.factor_conversion === 1 && (
                          <span className="text-xs text-zinc-600 ml-2 font-medium">{row.presentacion_desc}</span>
                        )}
                      </div>
                      <div className="w-20 text-right">
                        <span className={`text-xs font-bold ${row.stock > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{row.stock}</span>
                      </div>
                      <div className="w-32 text-right font-black text-white text-lg tracking-tight group-hover:text-blue-400 transition-colors">
                        ${row.precio_venta.toFixed(2)}
                      </div>
                      <div className="w-20 flex justify-end pl-4">
                        <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-inner border border-zinc-800 group-hover:border-blue-500">
                          <Plus className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ════════ PANEL DERECHO: CARRITO + CHECKOUT ════════ */}
      <div className="lg:col-span-4 flex flex-col h-full bg-[#0A0A0A] relative border-l border-zinc-900">
        <div className="p-6 border-b border-zinc-900 flex items-center justify-between bg-black/50 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-2xl border border-blue-500/20">
              <ShoppingCart className="h-5 w-5 text-blue-500" />
            </div>
            <h3 className="text-lg font-black text-white tracking-tight">Ticket de Compra</h3>
          </div>
          <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-red-400 hover:bg-red-400/10 font-bold rounded-xl" onClick={clearCart}>
            Anular Todo
          </Button>
        </div>

        {/* Items */}
        <ScrollArea className="flex-1 px-4 py-4">
          <div className="space-y-2 pb-4">
            {items.length === 0 ? (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-20">
                <div className="h-24 w-24 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                  <ShoppingCart className="h-10 w-10 text-white" />
                </div>
                <div>
                  <p className="text-lg font-black text-white uppercase tracking-widest">TICKET VACÍO</p>
                  <p className="text-sm font-bold mt-1 text-zinc-500">Escanea códigos para iniciar venta</p>
                </div>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="p-4 border border-zinc-900 bg-zinc-950/50 shadow-sm hover:border-zinc-800 hover:bg-zinc-900 transition-all rounded-2xl group flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <h4 className="text-sm font-black text-white leading-tight uppercase tracking-tight">
                        {item.producto_nombre || item.nombre}
                      </h4>
                      <p className="text-[11px] font-bold text-blue-500 uppercase flex items-center gap-1.5">
                        <Store className="h-3 w-3" /> {item.presentacion_nombre || "Unidad"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-600 hover:text-red-400 rounded-md hover:bg-red-400/10 flex-shrink-0" onClick={() => removeItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center bg-black rounded-lg p-0.5 border border-zinc-800">
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-zinc-800 hover:text-white text-zinc-400" onClick={() => updateQuantity(item.id, item.cantidad - 1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <input type="number" className="w-10 bg-transparent text-center text-sm font-black text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" value={item.cantidad} readOnly />
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-zinc-800 text-blue-400 hover:text-blue-300" onClick={() => updateQuantity(item.id, item.cantidad + 1)}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-xs font-medium text-zinc-500">${item.precio.toFixed(2)} c/u</span>
                        <span className="text-lg font-black text-white">${(item.precio * item.cantidad).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* ─── Footer: Total + Procesar Pago ─── */}
        <div className="p-6 bg-black border-t border-zinc-900 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] relative z-10">
          {/* Mensajes de éxito/error */}
          {checkoutSuccess && (
            <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-3 rounded-xl font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="h-5 w-5" /> ¡Venta registrada exitosamente!
            </div>
          )}
          {checkoutError && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl font-bold flex items-center gap-2">
              <XCircle className="h-5 w-5" /> {checkoutError}
            </div>
          )}

          <div className="flex justify-between items-end mb-6">
            <div>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-1">Total a cobrar</p>
              <h2 className="text-5xl font-black text-white tracking-tighter leading-none">${getTotal().toFixed(2)}</h2>
            </div>
            <div className="text-right flex flex-col items-end">
              <p className="text-sm font-bold text-blue-500 mb-2">{items.reduce((acc, i) => acc + i.cantidad, 0)} Artículos</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Paga con: $</span>
                <Input 
                  type="number" 
                  min={0} 
                  step="0.01" 
                  value={pagoCliente}
                  onChange={(e) => setPagoCliente(e.target.value)}
                  className="w-24 h-8 bg-zinc-900 border-zinc-800 text-white text-right font-bold focus-visible:ring-blue-500 px-2"
                  placeholder="0.00"
                />
              </div>
              {parseFloat(pagoCliente) >= getTotal() && getTotal() > 0 && (
                <div className="mt-2 text-sm font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded inline-block">
                  Cambio: ${(parseFloat(pagoCliente) - getTotal()).toFixed(2)}
                </div>
              )}
            </div>
          </div>

          <Button
            className="w-full h-16 rounded-[20px] bg-blue-600 hover:bg-blue-500 text-white text-xl font-black shadow-[0_0_30px_rgba(37,99,235,0.2)] group flex items-center justify-center gap-3 transition-all active:scale-[0.98] border-t border-blue-400/30 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={items.length === 0 || !cajaActiva || checkoutLoading}
            onClick={handleCheckout}
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                PROCESANDO...
              </>
            ) : !cajaActiva ? (
              <>
                <DoorOpen className="h-6 w-6" />
                ABRE LA CAJA PRIMERO
              </>
            ) : (
              <>
                <span>PROCESAR PAGO</span>
                <ChevronRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ════════ DIALOG: ABRIR CAJA ════════ */}
      <Dialog open={openCajaDialog} onOpenChange={setOpenCajaDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200 sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-emerald-500" /> Abrir Turno de Caja
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Ingresa el monto de efectivo con el que inicias el turno.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAbrirCaja} className="space-y-4 mt-2">
            
            {ultimoCierreFondo !== null && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Total dejado en turno anterior:</span>
                  <span className="font-black text-white text-sm">${Number(ultimoCierreFondo).toFixed(2)}</span>
                </div>
                
                {ultimoCierreFondo !== null && fondoInicial !== "" && (
                  (() => {
                    const diff = parseFloat(fondoInicial) - Number(ultimoCierreFondo);
                    if (diff > 0) {
                      return (
                        <div className="bg-blue-500/10 text-blue-400 p-2 rounded-lg mt-2 flex items-start gap-2">
                          <Plus className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>Iniciando con <strong>${Math.abs(diff).toFixed(2)}</strong> extra. Se registrará como inyección de capital.</p>
                        </div>
                      )
                    } else if (diff < 0) {
                      return (
                        <div className="bg-red-500/10 text-red-400 p-2 rounded-lg mt-2 flex items-start gap-2">
                          <Minus className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>Iniciando con <strong>${Math.abs(diff).toFixed(2)}</strong> menos. Se registrará como faltante.</p>
                        </div>
                      )
                    } else {
                      return (
                        <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-lg mt-2 flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                          <p>Iniciando con el mismo monto exacto que se dejó ayer.</p>
                        </div>
                      )
                    }
                  })()
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Fondo Inicial Físico ($)</Label>
              <Input type="number" min={0} step="0.01" value={fondoInicial}
                onChange={(e) => setFondoInicial(e.target.value)}
                className="bg-black/50 border-zinc-800 text-white h-14 rounded-xl text-2xl font-black text-center focus-visible:ring-emerald-500"
                autoFocus />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" onClick={() => setOpenCajaDialog(false)}
                className="bg-zinc-800 text-white hover:bg-zinc-700 rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={cajaActionLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg gap-2">
                {cajaActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
                Abrir Caja
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════ DIALOG: CERRAR CAJA ════════ */}
      <Dialog open={closeCajaDialog} onOpenChange={setCloseCajaDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200 sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
              <DoorClosed className="h-5 w-5 text-amber-500" /> Cerrar Turno de Caja
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Ingresa el total físico y cuánto enviarás a la Bóveda.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCerrarCaja} className="space-y-4 mt-2">
            {cajaActiva && (
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-zinc-500">Efectivo Esperado (Sistema):</span><span className="font-black text-indigo-400 text-sm">${parseFloat(cajaActiva.efectivo_esperado || cajaActiva.fondo_inicial).toFixed(2)}</span></div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Total Físico en Gaveta ($)</Label>
              <Input type="number" min={0} step="0.01" value={efectivoDeclarado}
                onChange={(e) => setEfectivoDeclarado(e.target.value)}
                className="bg-black/50 border-zinc-800 text-white h-12 rounded-xl text-xl font-black text-center focus-visible:ring-amber-500"
                autoFocus />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Trasladar a Bóveda ($)</Label>
              <Input type="number" min={0} step="0.01" value={montoBoveda}
                onChange={(e) => setMontoBoveda(e.target.value)}
                placeholder="0.00"
                className="bg-emerald-950/20 border-emerald-900/50 text-emerald-400 h-12 rounded-xl text-xl font-black text-center focus-visible:ring-emerald-500" />
            </div>

            <div className="bg-black/40 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Fondo Siguiente Turno</Label>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="autoOpen" checked={autoOpenNext} onChange={e => setAutoOpenNext(e.target.checked)} className="rounded border-zinc-800 bg-black text-amber-500 focus:ring-amber-500" />
                  <Label htmlFor="autoOpen" className="text-xs text-zinc-400 cursor-pointer">Reabrir automáticamente</Label>
                </div>
              </div>
              <span className="text-xl font-black text-white">
                ${Math.max(0, (parseFloat(efectivoDeclarado) || 0) - (parseFloat(montoBoveda) || 0)).toFixed(2)}
              </span>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Observaciones (Opcional)</Label>
              <Input type="text" value={observacionesCierre}
                onChange={(e) => setObservacionesCierre(e.target.value)}
                placeholder="Razón de descuadre o nota..."
                className="bg-black/50 border-zinc-800 text-white h-10 rounded-xl focus-visible:ring-amber-500" />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" onClick={() => setCloseCajaDialog(false)}
                className="bg-zinc-800 text-white hover:bg-zinc-700 rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={cajaActionLoading}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg gap-2">
                {cajaActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
                Confirmar Cierre
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
