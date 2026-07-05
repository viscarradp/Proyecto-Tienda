'use client'

import * as React from "react"
import {
  Search,
  ScanBarcode,
  Plus,
  Minus,
  ShoppingCart,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
  DoorOpen,
  DoorClosed,
  CheckCircle2,
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
import { CheckoutSection } from "@/components/pos/CheckoutSection"
import { useShallow } from "zustand/react/shallow"
import { useCartStore } from "@/src/store/cartStore"
import { useInventoryStore } from "../../../src/store/inventoryStore"
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
      setCartOpen(false)
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

  const total = getTotal()
  const itemCount = items.reduce((acc, i) => acc + i.cantidad, 0)

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
        {/* Encabezado (pegajoso) */}
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-6">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Nueva venta</h1>
              <p className="text-xs text-muted-foreground">Terminal 01 · POS</p>
            </div>

            {cajaLoading ? (
              <div className="flex h-10 items-center px-3 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : cajaActiva ? (
              <Button
                variant="outline"
                onClick={() => { loadCaja(); setCloseCajaDialog(true) }}
                className="h-10 gap-2 border-success/40 text-success hover:bg-success/10 hover:text-success"
              >
                <DoorClosed className="h-4 w-4" />
                <span className="hidden sm:inline">Caja abierta</span>
                <span className="sm:hidden">Caja</span>
              </Button>
            ) : (
              <Button
                onClick={() => { loadCaja(); setOpenCajaDialog(true) }}
                className="h-10 gap-2 bg-warning text-warning-foreground hover:bg-warning/90"
              >
                <DoorOpen className="h-4 w-4" /> Abrir caja
              </Button>
            )}
          </div>

          {/* Búsqueda + escaneo */}
          <div className="px-4 pb-3 lg:px-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-12 pl-10 pr-10 text-base"
                placeholder="Buscar producto o código…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
                className={cn(
                  "shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
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
          {!cajaLoading && !cajaActiva && (
            <div className="flex items-center justify-center gap-2 border-t border-warning/20 bg-warning/10 px-4 py-2 text-xs font-medium text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Debes abrir un turno de caja antes de vender
            </div>
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
                <p className="text-xs">Verifica que los productos tengan presentaciones creadas</p>
              </div>
            ) : (
              <ul className="divide-y divide-border pb-36 lg:pb-6">
                {filteredRows.map((row) => (
                  <li key={row.presentacion_id}>
                    <button
                      type="button"
                      onClick={() => handleAddToCart(row)}
                      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 lg:px-6"
                    >
                      <div className="hidden w-24 shrink-0 truncate font-mono text-xs text-muted-foreground sm:block">
                        {row.codigo_barras || `P${String(row.presentacion_id).padStart(4, '0')}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{row.producto_nombre}</p>
                        <p className="truncate text-xs text-muted-foreground">{row.presentacion_desc}</p>
                      </div>
                      <div className="w-14 shrink-0 text-right">
                        <span className={cn(
                          "font-mono text-sm font-medium tabular-nums",
                          row.stock > 0 ? "text-success" : "text-destructive",
                        )}>
                          {row.stock}
                        </span>
                        <p className="text-[10px] text-muted-foreground">stock</p>
                      </div>
                      <div className="w-20 shrink-0 text-right">
                        <MoneyValue value={row.precio_venta} className="text-base font-semibold" />
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <Plus className="h-4 w-4" />
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
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={clearCart}>
              Anular
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          {items.length === 0 ? emptyTicket : (
            <CartLines items={items} updateQuantity={updateQuantity} removeItem={removeItem} />
          )}
        </div>
        <div className="border-t border-border p-4">
          <CheckoutSection
            total={total}
            itemCount={itemCount}
            pagoCliente={pagoCliente}
            setPagoCliente={setPagoCliente}
            onCheckout={handleCheckout}
            checkoutLoading={checkoutLoading}
            hasCaja={!!cajaActiva}
            checkoutSuccess={checkoutSuccess}
            checkoutError={checkoutError}
          />
        </div>
      </aside>

      {/* ════════ BARRA DE CARRITO (móvil) ════════ */}
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        aria-label="Ver ticket"
        className="fixed inset-x-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 text-left lg:hidden"
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
      >
        <span className="flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10 text-primary">
            <ShoppingCart className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {itemCount}
              </span>
            )}
          </span>
          <span className="text-sm font-medium">
            {itemCount > 0 ? `${itemCount} ${itemCount === 1 ? "artículo" : "artículos"}` : "Ticket vacío"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <MoneyValue value={total} className="text-base font-semibold" />
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </span>
      </button>

      {/* ════════ BOTTOM SHEET: TICKET (móvil) ════════ */}
      <BottomSheet open={cartOpen} onOpenChange={setCartOpen}>
        <BottomSheetContent className="lg:hidden">
          <BottomSheetHeader className="flex-row items-center justify-between p-0 pb-1">
            <BottomSheetTitle>Ticket de compra</BottomSheetTitle>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" className="mr-8 text-muted-foreground hover:text-destructive" onClick={clearCart}>
                Anular todo
              </Button>
            )}
          </BottomSheetHeader>
          {items.length === 0 ? emptyTicket : (
            <div className="flex flex-col gap-4">
              <CartLines items={items} updateQuantity={updateQuantity} removeItem={removeItem} />
              <CheckoutSection
                total={total}
                itemCount={itemCount}
                pagoCliente={pagoCliente}
                setPagoCliente={setPagoCliente}
                onCheckout={handleCheckout}
                checkoutLoading={checkoutLoading}
                hasCaja={!!cajaActiva}
                checkoutSuccess={checkoutSuccess}
                checkoutError={checkoutError}
              />
            </div>
          )}
        </BottomSheetContent>
      </BottomSheet>

      {/* ════════ DIALOG: ABRIR CAJA ════════ */}
      <Dialog open={openCajaDialog} onOpenChange={setOpenCajaDialog}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-success" /> Abrir turno de caja
            </DialogTitle>
            <DialogDescription>
              Ingresa el monto de efectivo con el que inicias el turno.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAbrirCaja} className="flex flex-col gap-4">
            {ultimoCierreFondo !== null && (
              <div className="flex flex-col gap-2 rounded-sm border border-border bg-muted/50 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total dejado en turno anterior</span>
                  <MoneyValue value={ultimoCierreFondo} className="text-sm font-semibold" />
                </div>

                {fondoInicial !== "" && (() => {
                  const diff = parseFloat(fondoInicial) - Number(ultimoCierreFondo)
                  if (diff > 0) {
                    return (
                      <div className="flex items-start gap-2 rounded-sm bg-primary/10 p-2 text-primary">
                        <Plus className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>Iniciando con <strong><MoneyValue value={Math.abs(diff)} tone="default" className="text-primary" /></strong> extra. Se registrará como inyección de capital.</p>
                      </div>
                    )
                  } else if (diff < 0) {
                    return (
                      <div className="flex items-start gap-2 rounded-sm bg-destructive/10 p-2 text-destructive">
                        <Minus className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>Iniciando con <strong><MoneyValue value={Math.abs(diff)} tone="destructive" /></strong> menos. Se registrará como faltante.</p>
                      </div>
                    )
                  }
                  return (
                    <div className="flex items-start gap-2 rounded-sm bg-success/10 p-2 text-success">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <p>Iniciando con el mismo monto exacto que se dejó ayer.</p>
                    </div>
                  )
                })()}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Fondo inicial físico ($)</Label>
              <Input
                type="number" min={0} step="0.01" inputMode="decimal" value={fondoInicial}
                onChange={(e) => setFondoInicial(e.target.value)}
                className="h-14 text-center font-mono text-2xl font-bold tabular-nums"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpenCajaDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={cajaActionLoading} className="gap-2 bg-success text-success-foreground hover:bg-success/90">
                {cajaActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
                Abrir caja
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════ DIALOG: CERRAR CAJA ════════ */}
      <Dialog open={closeCajaDialog} onOpenChange={setCloseCajaDialog}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DoorClosed className="h-5 w-5 text-warning" /> Cerrar turno de caja
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
              <Label className="text-xs font-medium text-muted-foreground">Total físico en gaveta ($)</Label>
              <Input
                type="number" min={0} step="0.01" inputMode="decimal" value={efectivoDeclarado}
                onChange={(e) => setEfectivoDeclarado(e.target.value)}
                className="h-12 text-center font-mono text-xl font-bold tabular-nums"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-success">Trasladar a bóveda ($)</Label>
              <Input
                type="number" min={0} step="0.01" inputMode="decimal" value={montoBoveda}
                onChange={(e) => setMontoBoveda(e.target.value)}
                placeholder="0.00"
                className="h-12 text-center font-mono text-xl font-bold tabular-nums"
              />
            </div>

            <div className="flex items-center justify-between rounded-sm border border-border p-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-muted-foreground">Fondo siguiente turno</Label>
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
              <Label className="text-xs font-medium text-muted-foreground">Observaciones (opcional)</Label>
              <Input
                type="text" value={observacionesCierre}
                onChange={(e) => setObservacionesCierre(e.target.value)}
                placeholder="Razón de descuadre o nota…"
                className="h-10"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCloseCajaDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={cajaActionLoading} className="gap-2 bg-warning text-warning-foreground hover:bg-warning/90">
                {cajaActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
                Confirmar cierre
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
