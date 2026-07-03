'use client'

import * as React from "react"
import {
  Package,
  Plus,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Truck,
  History,
  Tags,
  Trash2,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api"
import Cookies from "js-cookie"
import { useShallow } from "zustand/react/shallow"
import { ProductDialog, AddPresentacionDialog } from "@/components/inventario/ProductDialog"
import { CompraForm } from "@/components/inventario/CompraForm"
import { AjusteInventarioDialog } from "@/components/inventario/AjusteInventarioDialog"
import { EditProductDialog } from "@/components/inventario/EditProductDialog"
import { useInventoryStore, type Producto, type Categoria, type Presentacion, type LoteStock } from "../../../src/store/inventoryStore"

interface Compra {
  id: number
  proveedor: string
  monto_total: string
  estado_pago: string
  origen_fondos: string
  fecha: string
  lotes_inventario: {
    id: number
    producto_id: number
    costo_unitario_adquisicion: string
    cantidad_inicial: number
    cantidad_disponible: number
    fecha_ingreso: string
    fecha_vencimiento: string | null
  }[]
}

export default function InventarioPage() {
  const [mounted, setMounted] = React.useState(false)
  const { productos, categorias, loading: invLoading, fetchInventory, invalidateCache } = useInventoryStore(
    useShallow((state) => ({
      productos: state.productos,
      categorias: state.categorias,
      loading: state.loading,
      fetchInventory: state.fetchInventory,
      invalidateCache: state.invalidateCache,
    }))
  )
  const [compras, setCompras] = React.useState<Compra[]>([])
  const [loading, setLoading] = React.useState(true)
  const [globalError, setGlobalError] = React.useState("")
  const [productDialogOpen, setProductDialogOpen] = React.useState(false)
  const [compraDialogOpen, setCompraDialogOpen] = React.useState(false)
  const [ajusteDialogOpen, setAjusteDialogOpen] = React.useState(false)
  const [ajusteTarget, setAjusteTarget] = React.useState<{ lote: LoteStock, nombre: string } | null>(null)
  const [editProductDialogOpen, setEditProductDialogOpen] = React.useState(false)
  const [editProductTarget, setEditProductTarget] = React.useState<Producto | null>(null)
  const [expandedProduct, setExpandedProduct] = React.useState<number | null>(null)
  const [expandedCompra, setExpandedCompra] = React.useState<number | null>(null)

  // ─── Add Presentacion dialog state ───
  const [presDialogOpen, setPresDialogOpen] = React.useState(false)
  const [presTarget, setPresTarget] = React.useState<{ id: number; nombre: string } | null>(null)

  // ─── Category management state ───
  const [newCatName, setNewCatName] = React.useState("")
  const [catLoading, setCatLoading] = React.useState(false)
  const [catError, setCatError] = React.useState("")
  const [catSuccess, setCatSuccess] = React.useState("")

  // ─── User Role State ───
  const [user, setUser] = React.useState<{ nombre: string; rol: string } | null>(null)

  React.useEffect(() => { 
    setMounted(true) 
    const isUserCookie = Cookies.get("user")
    if (isUserCookie) {
      try {
        setUser(JSON.parse(isUserCookie))
      } catch (e) {}
    }
  }, [])

  const loadData = React.useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setGlobalError("")
    try {
      if (forceRefresh) {
        invalidateCache()
      }
      await fetchInventory(forceRefresh)

      const resComp = await apiFetch<Compra[]>("/compras")
      setCompras(Array.isArray(resComp) ? resComp : [])
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Error al cargar la base de inventario")
    } finally {
      setLoading(false)
    }
  }, [fetchInventory, invalidateCache])

  const handleRefresh = () => {
    loadData(true)
  }

  React.useEffect(() => {
    if (mounted) loadData()
  }, [mounted, loadData])

  // ─── Stock calculator ───
  const getStock = (prod: Producto): number => {
    return prod.lotes_inventario.reduce((sum, l) => sum + l.cantidad_disponible, 0)
  }

  // ─── Category create handler ───
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setCatLoading(true)
    setCatError("")
    setCatSuccess("")
    try {
      await apiFetch("/categorias", {
        method: "POST",
        body: JSON.stringify({ nombre: newCatName.trim() }),
      })
      setNewCatName("")
      setCatSuccess("Categoría creada exitosamente")
      loadData(true)
      setTimeout(() => setCatSuccess(""), 3000)
    } catch (err: unknown) {
      setCatError(err instanceof Error ? err.message : "Error al crear categoría")
    } finally {
      setCatLoading(false)
    }
  }

  // ─── Category delete handler ───
  const handleDeleteCategory = async (id: number) => {
    setCatError("")
    try {
      await apiFetch(`/categorias/${id}`, { method: "DELETE" })
      loadData(true)
    } catch (err: unknown) {
      setCatError(err instanceof Error ? err.message : "No se puede eliminar (tiene productos asociados)")
    }
  }

  // ─── Open add presentacion dialog ───
  const openPresDialog = (prod: Producto) => {
    setPresTarget({ id: prod.id, nombre: prod.nombre })
    setPresDialogOpen(true)
  }

  if (!mounted) return null

  return (
    <div className="flex flex-col h-full bg-black text-zinc-200">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-black/60 backdrop-blur-xl border-b border-zinc-900 p-4 lg:px-8 lg:py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-10 w-1.5 bg-blue-600 rounded-full shadow-[0_0_15px_rgba(37,99,235,0.5)]" />
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase">Inventario</h1>
              <p className="text-[10px] font-bold text-zinc-500 tracking-[0.2em] mt-0.5">
                CATÁLOGO • CATEGORÍAS • COMPRAS
              </p>
            </div>
          </div>
          {user?.rol !== 'CAJERO' && (
            <div className="flex items-center gap-3">
              <Button onClick={() => setCompraDialogOpen(true)} 
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl h-11 px-5 gap-2 shadow-lg shadow-indigo-900/20">
                <Truck className="h-4 w-4 text-white" />
                Nueva Compra
              </Button>
              <Button onClick={() => setProductDialogOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl h-11 px-5 gap-2 shadow-lg shadow-blue-900/20">
                <Plus className="h-4 w-4" />
                Nuevo Producto
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Content with Tabs */}
      <div className="flex-1 overflow-auto p-4 lg:px-8 lg:py-6">
        <Tabs defaultValue="catalogo" className="w-full">
          <TabsList className="bg-zinc-950/50 p-1.5 rounded-[20px] h-auto gap-1.5 border border-zinc-900 mb-6">
            <TabsTrigger value="catalogo"
              className="px-5 py-2.5 rounded-[16px] font-black text-[11px] uppercase tracking-widest text-zinc-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all duration-300 gap-2">
              <Package className="h-3.5 w-3.5" /> Catálogo
            </TabsTrigger>
            {user?.rol !== 'CAJERO' && (
              <TabsTrigger value="categorias"
                className="px-5 py-2.5 rounded-[16px] font-black text-[11px] uppercase tracking-widest text-zinc-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all duration-300 gap-2">
                <Tags className="h-3.5 w-3.5" /> Categorías
              </TabsTrigger>
            )}
            <TabsTrigger value="historial"
              className="px-5 py-2.5 rounded-[16px] font-black text-[11px] uppercase tracking-widest text-zinc-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all duration-300 gap-2">
              <History className="h-3.5 w-3.5" /> Historial
            </TabsTrigger>
          </TabsList>

          {/* Loading / Error */}
          {loading || invLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-zinc-500">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <p className="text-sm font-medium animate-pulse">Cargando inventario de la nube...</p>
            </div>
          ) : globalError ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-zinc-400">
              <AlertTriangle className="h-10 w-10 text-red-500/60" />
              <p className="text-sm font-bold text-red-400">{globalError}</p>
              <Button variant="outline" size="sm" className="rounded-xl border-zinc-800 gap-2" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" /> Reintentar
              </Button>
            </div>
          ) : null}

          {!loading && !invLoading && !globalError && (
            <>
              {/* ──────── TAB 1: CATÁLOGO ──────── */}
              <TabsContent value="catalogo">
                <ScrollArea className="h-[calc(100vh-260px)]">
                  {/* Header de la tabla */}
                  <div className="sticky top-0 bg-black/95 backdrop-blur z-10 border-b border-zinc-900 px-6 py-3 flex text-[10px] font-black uppercase tracking-widest text-zinc-600">
                    <div className="w-10" />
                    <div className="w-16">ID</div>
                    <div className="flex-1">Producto</div>
                    <div className="w-32 text-right">Categoría</div>
                    <div className="w-24 text-right">Stock</div>
                    <div className="w-28 text-right">Presentaciones</div>
                  </div>

                  {productos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-3">
                      <Package className="h-10 w-10 opacity-20" />
                      <p className="font-bold text-sm">No hay productos en el catálogo</p>
                      {user?.rol !== 'CAJERO' && (
                        <Button variant="outline" size="sm" onClick={() => setProductDialogOpen(true)}
                          className="border-zinc-800 rounded-xl gap-1.5">
                          <Plus className="h-3.5 w-3.5" /> Crear primer producto
                        </Button>
                      )}
                    </div>
                  ) : (
                    productos.map(prod => {
                      const stock = getStock(prod)
                      return (
                        <div key={prod.id}>
                          <div
                            className="group border-b border-zinc-900/50 hover:bg-zinc-900/40 transition-colors cursor-pointer px-6 py-4 flex items-center"
                            onClick={() => setExpandedProduct(expandedProduct === prod.id ? null : prod.id)}
                          >
                            <div className="w-10">
                              {expandedProduct === prod.id
                                ? <ChevronDown className="h-4 w-4 text-blue-500" />
                                : <ChevronRight className="h-4 w-4 text-zinc-600" />}
                            </div>
                            <div className="w-16 text-xs font-mono text-zinc-600 group-hover:text-blue-500">
                              {String(prod.id).padStart(4, '0')}
                            </div>
                            <div className="flex-1 font-bold text-sm text-zinc-300 group-hover:text-white truncate pr-4">
                              {prod.nombre}
                            </div>
                            <div className="w-32 text-right">
                              <Badge variant="outline" className="border-zinc-800 text-zinc-400 font-bold text-[10px] uppercase">
                                {prod.categorias.nombre}
                              </Badge>
                            </div>
                            <div className="w-24 text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                stock > 0
                                  ? 'bg-emerald-500/10 border-emerald-800 text-emerald-400'
                                  : 'bg-red-500/10 border-red-800 text-red-400'
                              }`}>
                                {stock} uds
                              </span>
                            </div>
                            <div className="w-28 text-right text-xs font-bold text-zinc-500">
                              {prod.presentaciones.length} pres.
                            </div>
                          </div>

                          {/* Presentaciones expandidas */}
                          {expandedProduct === prod.id && (
                            <div className="bg-zinc-950/50 border-b border-zinc-900/50 px-6 py-3">
                              <div className="ml-10 space-y-2">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Detalles y Presentaciones</p>
                                  <div className="flex items-center gap-2">
                                    {user?.rol !== 'CAJERO' && (
                                      <>
                                        <Button type="button" variant="outline" size="sm"
                                          className="border-indigo-900/50 text-indigo-400 hover:bg-indigo-900/20 hover:text-indigo-300 rounded-lg gap-1 h-7 text-xs font-bold"
                                          onClick={(e) => { e.stopPropagation(); setEditProductTarget(prod); setEditProductDialogOpen(true) }}>
                                          <Pencil className="h-3 w-3" /> Editar
                                        </Button>
                                        <Button type="button" variant="outline" size="sm"
                                          className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white rounded-lg gap-1 h-7 text-xs font-bold"
                                          onClick={(e) => { e.stopPropagation(); openPresDialog(prod) }}>
                                          <Plus className="h-3 w-3" /> Agregar
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {prod.presentaciones.length === 0 ? (
                                  <p className="text-xs text-zinc-600 italic">Sin presentaciones definidas. Agrega una para poder vender este producto.</p>
                                ) : (
                                  prod.presentaciones.map(pres => (
                                    <div key={pres.id} className="flex items-center gap-4 bg-black/30 border border-zinc-800/30 rounded-xl px-4 py-2.5 text-sm">
                                      <span className="font-bold text-zinc-300 flex-1">{pres.descripcion}</span>
                                      {pres.codigo_barras && (
                                        <span className="text-xs font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded">
                                          {pres.codigo_barras}
                                        </span>
                                      )}
                                      <span className="text-xs text-zinc-500">×{pres.factor_conversion}</span>
                                      <span className="font-black text-white">${parseFloat(pres.precio_venta).toFixed(2)}</span>
                                    </div>
                                  ))
                                )}

                                <div className="mt-6 flex items-center justify-between mb-2">
                                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Lotes de Inventario Activos</p>
                                </div>
                                {(() => {
                                  const activeLotes = prod.lotes_inventario.filter(l => l.cantidad_disponible > 0)
                                  if (activeLotes.length === 0) {
                                    return <p className="text-xs text-zinc-600 italic">No hay existencias almacenadas para ningún lote.</p>
                                  }
                                  return (
                                    <ScrollArea className="max-h-40">
                                      <div className="space-y-1.5 pr-4">
                                        {activeLotes.map((lote, idx) => (
                                          <div key={`lote-${lote.id}-${idx}`} className="flex items-center gap-4 bg-black/50 border border-zinc-800/50 rounded-xl px-4 py-2.5 text-sm group">
                                            <span className="font-mono text-zinc-500 text-xs w-16">#{lote.id}</span>
                                            <span className="font-bold text-emerald-400 w-16 text-right cursor-default">{lote.cantidad_disponible} uds</span>
                                            <span className="text-xs font-mono text-zinc-600 flex-1">@${parseFloat(lote.costo_unitario_adquisicion).toFixed(2)}</span>
                                            
                                            {lote.fecha_vencimiento && (
                                              <span className="text-[10px] text-amber-500/70 mr-4">
                                                Vence: {new Date(lote.fecha_vencimiento).toLocaleDateString('es-SV')}
                                              </span>
                                            )}
                                            
                                            {user?.rol !== 'CAJERO' && (
                                              <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-7 px-2 border-amber-900/50 text-amber-500 hover:bg-amber-950 hover:text-amber-400 text-[10px] uppercase font-bold tracking-widest gap-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setAjusteTarget({ lote, nombre: prod.nombre })
                                                  setAjusteDialogOpen(true)
                                                }}
                                              >
                                                <AlertTriangle className="h-3 w-3" />
                                                Merma
                                              </Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  )
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </ScrollArea>
              </TabsContent>

              {/* ──────── TAB 2: CATEGORÍAS ──────── */}
              <TabsContent value="categorias">
                <div className="max-w-2xl space-y-6">
                  {/* Create new category */}
                  <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-black text-zinc-300 uppercase tracking-wider">Crear Nueva Categoría</h3>

                    {catError && (
                      <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl font-medium">{catError}</div>
                    )}
                    {catSuccess && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-3 rounded-xl font-medium">{catSuccess}</div>
                    )}

                    <form onSubmit={handleCreateCategory} className="flex gap-3 items-end">
                      <div className="flex-1 space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nombre</Label>
                        <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Ej: Lácteos, Limpieza, Bebidas..." required
                          className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl focus-visible:ring-blue-500" />
                      </div>
                      <Button type="submit" disabled={catLoading}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl h-11 px-5 gap-2 shadow-lg shadow-blue-900/20">
                        {catLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Crear
                      </Button>
                    </form>
                  </div>

                  {/* Category list */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-black text-zinc-300 uppercase tracking-wider px-1">
                      Categorías Existentes ({categorias.length})
                    </h3>
                    {categorias.length === 0 ? (
                      <div className="border border-dashed border-zinc-800 rounded-2xl p-10 text-center">
                        <p className="text-zinc-600 text-sm font-medium">No hay categorías creadas.</p>
                      </div>
                    ) : (
                      categorias.map(cat => {
                        const productCount = productos.filter(p => p.categoria_id === cat.id).length
                        return (
                          <div key={cat.id} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-5 py-3.5 group hover:border-zinc-700 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-blue-600/10 border border-blue-600/20 flex items-center justify-center">
                                <Tags className="h-4 w-4 text-blue-500" />
                              </div>
                              <div>
                                <p className="font-bold text-sm text-zinc-200">{cat.nombre}</p>
                                <p className="text-[10px] text-zinc-600 font-medium">{productCount} producto{productCount !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon"
                              className="h-8 w-8 text-zinc-700 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleDeleteCategory(cat.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ──────── TAB 3: HISTORIAL ──────── */}
              <TabsContent value="historial">
                <ScrollArea className="h-[calc(100vh-260px)]">
                  {compras.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-3">
                      <History className="h-10 w-10 opacity-20" />
                      <p className="font-bold text-sm">No hay compras registradas</p>
                    </div>
                  ) : (
                    <div>
                      <div className="sticky top-0 bg-black/95 backdrop-blur z-10 border-b border-zinc-900 px-6 py-3 flex text-[10px] font-black uppercase tracking-widest text-zinc-600">
                        <div className="w-10" />
                        <div className="w-16">ID</div>
                        <div className="flex-1">Proveedor</div>
                        <div className="w-28 text-right">Monto</div>
                        <div className="w-28 text-right">Estado</div>
                        <div className="w-32 text-right">Fecha</div>
                      </div>

                      {compras.map(compra => (
                        <div key={compra.id}>
                          <div
                            className="group border-b border-zinc-900/50 hover:bg-zinc-900/40 transition-colors cursor-pointer px-6 py-4 flex items-center"
                            onClick={() => setExpandedCompra(expandedCompra === compra.id ? null : compra.id)}
                          >
                            <div className="w-10">
                              {expandedCompra === compra.id
                                ? <ChevronDown className="h-4 w-4 text-blue-500" />
                                : <ChevronRight className="h-4 w-4 text-zinc-600" />}
                            </div>
                            <div className="w-16 text-xs font-mono text-zinc-600">#{compra.id}</div>
                            <div className="flex-1 font-bold text-sm text-zinc-300 truncate pr-4">{compra.proveedor}</div>
                            <div className="w-28 text-right font-black text-white">${parseFloat(compra.monto_total).toFixed(2)}</div>
                            <div className="w-28 text-right">
                              <Badge variant="outline" className={`text-[10px] font-bold uppercase ${compra.estado_pago === 'PAGADO' ? 'border-emerald-800 text-emerald-400' : 'border-amber-800 text-amber-400'}`}>
                                {compra.estado_pago === 'PAGADO' ? 'Pagado' : 'Crédito'}
                              </Badge>
                            </div>
                            <div className="w-32 text-right text-xs text-zinc-500">
                              {new Date(compra.fecha).toLocaleDateString('es-SV')}
                            </div>
                          </div>

                          {expandedCompra === compra.id && compra.lotes_inventario.length > 0 && (
                            <div className="bg-zinc-950/50 border-b border-zinc-900/50 px-6 py-3">
                              <div className="ml-10 space-y-2">
                                <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-2">Lotes Generados</p>
                                {compra.lotes_inventario.map((lote, idx) => {
                                  const prod = productos.find(p => p.id === lote.producto_id)
                                  return (
                                    <div key={`compra-lote-${lote.id}-${idx}`} className="flex items-center gap-4 bg-black/30 border border-zinc-800/30 rounded-xl px-4 py-2.5 text-sm">
                                      <span className="font-bold text-zinc-300 flex-1">{prod?.nombre || `Producto #${lote.producto_id}`}</span>
                                      <span className="text-xs text-zinc-500">
                                        {lote.cantidad_disponible}/{lote.cantidad_inicial} uds
                                      </span>
                                      <span className="text-xs font-mono text-zinc-600">
                                        @${parseFloat(lote.costo_unitario_adquisicion).toFixed(4)}
                                      </span>
                                      {lote.fecha_vencimiento && (
                                        <span className="text-[10px] text-amber-500/70">
                                          Vence: {new Date(lote.fecha_vencimiento).toLocaleDateString('es-SV')}
                                        </span>
                                      )}
                                      {lote.cantidad_disponible > 0 && user?.rol !== 'CAJERO' && (
                                        <Button 
                                          variant="outline" 
                                          size="sm" 
                                          className="h-7 px-2 border-amber-900/50 text-amber-500 hover:bg-amber-950 hover:text-amber-400 text-[10px] uppercase font-bold tracking-widest gap-1 rounded-lg ml-auto"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setAjusteTarget({ lote, nombre: prod?.nombre || `Producto #${lote.producto_id}` })
                                            setAjusteDialogOpen(true)
                                          }}
                                        >
                                          <AlertTriangle className="h-3 w-3" />
                                          Merma
                                        </Button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={compraDialogOpen} onOpenChange={setCompraDialogOpen}>
        <DialogContent className="max-w-[95vw] lg:max-w-6xl w-full bg-black border-zinc-900 border text-white p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="px-6 py-4 border-b border-zinc-900 bg-zinc-950">
            <DialogTitle className="font-black text-lg tracking-tight uppercase flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-500" /> Registro de Compra
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 overflow-y-auto max-h-[85vh]">
            <CompraForm
              productos={productos}
              onSuccess={() => {
                setCompraDialogOpen(false)
                loadData(true)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <ProductDialog
        open={productDialogOpen}
        onClose={() => setProductDialogOpen(false)}
        onSuccess={() => loadData(true)}
        categorias={categorias}
        onCategoriaCreated={() => loadData(true)}
      />
      {presTarget && (
        <AddPresentacionDialog
          open={presDialogOpen}
          onClose={() => { setPresDialogOpen(false); setPresTarget(null) }}
          onSuccess={() => loadData(true)}
          productoId={presTarget.id}
          productoNombre={presTarget.nombre}
        />
      )}
      {ajusteTarget && (
        <AjusteInventarioDialog
          open={ajusteDialogOpen}
          onClose={() => { setAjusteDialogOpen(false); setAjusteTarget(null) }}
          onSuccess={() => loadData(true)}
          lote={ajusteTarget.lote}
          productoNombre={ajusteTarget.nombre}
        />
      )}
      <EditProductDialog
        open={editProductDialogOpen}
        onClose={() => { setEditProductDialogOpen(false); setEditProductTarget(null) }}
        onSuccess={() => loadData(true)}
        producto={editProductTarget}
      />
    </div>
  )
}
