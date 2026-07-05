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
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MoneyValue } from "@/components/money-value"
import { StatePill } from "@/components/state-pill"
import { apiFetch } from "@/lib/api"
import { useShallow } from "zustand/react/shallow"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { ProductDialog, AddPresentacionDialog } from "@/components/inventario/ProductDialog"
import { CompraForm } from "@/components/inventario/CompraForm"
import { AjusteInventarioDialog } from "@/components/inventario/AjusteInventarioDialog"
import { EditProductDialog } from "@/components/inventario/EditProductDialog"
import { useInventoryStore, type Producto, type LoteStock } from "../../../src/store/inventoryStore"

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
  const { user } = useCurrentUser()
  const esCajero = user?.rol === "CAJERO"

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

  React.useEffect(() => { setMounted(true) }, [])

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
    <div className="flex min-h-full flex-col bg-background text-foreground">
      {/* Encabezado */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8 lg:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Inventario</h1>
            <p className="text-xs text-muted-foreground">Catálogo · Categorías · Compras</p>
          </div>
          {!esCajero && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setCompraDialogOpen(true)} className="h-11 gap-2">
                <Truck className="h-4 w-4" />
                <span className="hidden sm:inline">Nueva compra</span>
              </Button>
              <Button onClick={() => setProductDialogOpen(true)} className="h-11 gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nuevo producto</span>
                <span className="sm:hidden">Producto</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Contenido con pestañas */}
      <div className="flex-1 p-4 lg:px-8 lg:py-6">
        <Tabs defaultValue="catalogo" className="w-full">
          <TabsList className="mb-5 h-auto flex-wrap gap-1">
            <TabsTrigger value="catalogo" className="gap-1.5 px-4 py-2">
              <Package className="h-4 w-4" /> Catálogo
            </TabsTrigger>
            {!esCajero && (
              <TabsTrigger value="categorias" className="gap-1.5 px-4 py-2">
                <Tags className="h-4 w-4" /> Categorías
              </TabsTrigger>
            )}
            <TabsTrigger value="historial" className="gap-1.5 px-4 py-2">
              <History className="h-4 w-4" /> Historial
            </TabsTrigger>
          </TabsList>

          {/* Loading / Error */}
          {loading || invLoading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
              <Loader2 className="h-9 w-9 animate-spin text-primary" />
              <p className="text-sm">Cargando inventario…</p>
            </div>
          ) : globalError ? (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <AlertTriangle className="h-9 w-9 text-destructive/70" />
              <p className="text-sm font-medium text-destructive">{globalError}</p>
              <Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" /> Reintentar
              </Button>
            </div>
          ) : null}

          {!loading && !invLoading && !globalError && (
            <>
              {/* ──────── TAB 1: CATÁLOGO ──────── */}
              <TabsContent value="catalogo">
                {productos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
                    <Package className="h-10 w-10 opacity-20" />
                    <p className="text-sm font-medium text-foreground">No hay productos en el catálogo</p>
                    {!esCajero && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setProductDialogOpen(true)}>
                        <Plus className="h-4 w-4" /> Crear primer producto
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-sm border border-border">
                    {/* Encabezado de tabla (solo desktop) */}
                    <div className="hidden items-center gap-3 border-b border-border bg-muted/50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
                      <div className="w-6" />
                      <div className="w-14 font-mono">ID</div>
                      <div className="flex-1">Producto</div>
                      <div className="w-32 text-right">Categoría</div>
                      <div className="w-24 text-right">Stock</div>
                      <div className="w-24 text-right">Present.</div>
                    </div>

                    {productos.map(prod => {
                      const stock = getStock(prod)
                      const isOpen = expandedProduct === prod.id
                      return (
                        <div key={prod.id} className="border-b border-border last:border-b-0">
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                            onClick={() => setExpandedProduct(isOpen ? null : prod.id)}
                          >
                            <div className="w-6 shrink-0">
                              {isOpen
                                ? <ChevronDown className="h-4 w-4 text-primary" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="hidden w-14 shrink-0 font-mono text-xs text-muted-foreground sm:block">
                              {String(prod.id).padStart(4, '0')}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">{prod.nombre}</p>
                              <p className="truncate text-xs text-muted-foreground sm:hidden">
                                {prod.categorias.nombre} · {prod.presentaciones.length} pres.
                              </p>
                            </div>
                            <div className="hidden w-32 text-right sm:block">
                              <Badge variant="outline" className="text-xs font-normal">{prod.categorias.nombre}</Badge>
                            </div>
                            <div className="w-auto shrink-0 text-right sm:w-24">
                              <StatePill tone={stock > 0 ? "success" : "destructive"} className="font-mono tabular-nums">
                                {stock} uds
                              </StatePill>
                            </div>
                            <div className="hidden w-24 text-right text-xs text-muted-foreground sm:block">
                              {prod.presentaciones.length} pres.
                            </div>
                          </button>

                          {/* Detalle expandido */}
                          {isOpen && (
                            <div className="border-t border-border bg-muted/20 px-4 py-4 sm:pl-13">
                              <div className="flex flex-col gap-4">
                                {/* Presentaciones */}
                                <div>
                                  <div className="mb-2 flex items-center justify-between">
                                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Presentaciones</p>
                                    {!esCajero && (
                                      <div className="flex items-center gap-2">
                                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1"
                                          onClick={(e) => { e.stopPropagation(); setEditProductTarget(prod); setEditProductDialogOpen(true) }}>
                                          <Pencil className="h-3.5 w-3.5" /> Editar
                                        </Button>
                                        <Button type="button" variant="outline" size="sm" className="h-8 gap-1"
                                          onClick={(e) => { e.stopPropagation(); openPresDialog(prod) }}>
                                          <Plus className="h-3.5 w-3.5" /> Agregar
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  {prod.presentaciones.length === 0 ? (
                                    <p className="text-xs italic text-muted-foreground">Sin presentaciones definidas. Agrega una para poder vender este producto.</p>
                                  ) : (
                                    <div className="flex flex-col gap-1.5">
                                      {prod.presentaciones.map(pres => (
                                        <div key={pres.id} className="flex items-center gap-3 rounded-sm border border-border bg-card px-3 py-2 text-sm">
                                          <span className="flex-1 truncate font-medium">{pres.descripcion}</span>
                                          {pres.codigo_barras && (
                                            <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{pres.codigo_barras}</span>
                                          )}
                                          <span className="font-mono text-xs text-muted-foreground">×{pres.factor_conversion}</span>
                                          <MoneyValue value={pres.precio_venta} className="font-semibold" />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Lotes */}
                                <div>
                                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Lotes de inventario activos</p>
                                  {(() => {
                                    const activeLotes = prod.lotes_inventario.filter(l => l.cantidad_disponible > 0)
                                    if (activeLotes.length === 0) {
                                      return <p className="text-xs italic text-muted-foreground">No hay existencias almacenadas para ningún lote.</p>
                                    }
                                    return (
                                      <div className="flex flex-col gap-1.5">
                                        {activeLotes.map((lote, idx) => (
                                          <div key={`lote-${lote.id}-${idx}`} className="group flex items-center gap-3 rounded-sm border border-border bg-card px-3 py-2 text-sm">
                                            <span className="w-12 font-mono text-xs text-muted-foreground">#{lote.id}</span>
                                            <span className="w-16 text-right font-mono text-xs font-medium tabular-nums text-success">{lote.cantidad_disponible} uds</span>
                                            <span className="flex-1 font-mono text-xs text-muted-foreground">@<MoneyValue value={lote.costo_unitario_adquisicion} tone="muted" className="text-xs" /></span>
                                            {lote.fecha_vencimiento && (
                                              <span className="text-xs text-warning">
                                                Vence: {new Date(lote.fecha_vencimiento).toLocaleDateString('es-SV')}
                                              </span>
                                            )}
                                            {!esCajero && (
                                              <Button variant="outline" size="sm"
                                                className="h-7 gap-1 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setAjusteTarget({ lote, nombre: prod.nombre })
                                                  setAjusteDialogOpen(true)
                                                }}
                                              >
                                                <AlertTriangle className="h-3.5 w-3.5" /> Merma
                                              </Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  })()}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ──────── TAB 2: CATEGORÍAS ──────── */}
              <TabsContent value="categorias">
                <div className="flex max-w-2xl flex-col gap-6">
                  {/* Crear categoría */}
                  <div className="flex flex-col gap-4 rounded-sm border border-border bg-card p-5">
                    <h3 className="text-sm font-semibold">Crear nueva categoría</h3>

                    {catError && (
                      <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{catError}</div>
                    )}
                    {catSuccess && (
                      <div className="rounded-sm border border-success/20 bg-success/10 p-3 text-sm text-success">{catSuccess}</div>
                    )}

                    <form onSubmit={handleCreateCategory} className="flex items-end gap-3">
                      <div className="flex flex-1 flex-col gap-2">
                        <Label className="text-xs font-medium text-muted-foreground">Nombre</Label>
                        <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                          placeholder="Ej: Lácteos, Limpieza, Bebidas…" required className="h-11" />
                      </div>
                      <Button type="submit" disabled={catLoading} className="h-11 gap-2">
                        {catLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Crear
                      </Button>
                    </form>
                  </div>

                  {/* Lista de categorías */}
                  <div className="flex flex-col gap-2">
                    <h3 className="px-1 text-sm font-semibold">Categorías existentes ({categorias.length})</h3>
                    {categorias.length === 0 ? (
                      <div className="rounded-sm border border-dashed border-border p-10 text-center">
                        <p className="text-sm text-muted-foreground">No hay categorías creadas.</p>
                      </div>
                    ) : (
                      categorias.map(cat => {
                        const productCount = productos.filter(p => p.categoria_id === cat.id).length
                        return (
                          <div key={cat.id} className="group flex items-center justify-between rounded-sm border border-border bg-card px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary/10 text-primary">
                                <Tags className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{cat.nombre}</p>
                                <p className="text-xs text-muted-foreground">{productCount} producto{productCount !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon"
                              className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
                {compras.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-muted-foreground">
                    <History className="h-10 w-10 opacity-20" />
                    <p className="text-sm font-medium text-foreground">No hay compras registradas</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-sm border border-border">
                    <div className="hidden items-center gap-3 border-b border-border bg-muted/50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
                      <div className="w-6" />
                      <div className="w-14 font-mono">ID</div>
                      <div className="flex-1">Proveedor</div>
                      <div className="w-28 text-right">Monto</div>
                      <div className="w-24 text-right">Estado</div>
                      <div className="w-28 text-right">Fecha</div>
                    </div>

                    {compras.map(compra => {
                      const isOpen = expandedCompra === compra.id
                      return (
                        <div key={compra.id} className="border-b border-border last:border-b-0">
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                            onClick={() => setExpandedCompra(isOpen ? null : compra.id)}
                          >
                            <div className="w-6 shrink-0">
                              {isOpen
                                ? <ChevronDown className="h-4 w-4 text-primary" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="hidden w-14 shrink-0 font-mono text-xs text-muted-foreground sm:block">#{compra.id}</div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{compra.proveedor}</p>
                              <p className="text-xs text-muted-foreground sm:hidden">{new Date(compra.fecha).toLocaleDateString('es-SV')}</p>
                            </div>
                            <div className="w-auto text-right sm:w-28">
                              <MoneyValue value={compra.monto_total} className="text-sm font-semibold" />
                            </div>
                            <div className="hidden w-24 text-right sm:block">
                              <StatePill tone={compra.estado_pago === 'PAGADO' ? "success" : "warning"}>
                                {compra.estado_pago === 'PAGADO' ? 'Pagado' : 'Crédito'}
                              </StatePill>
                            </div>
                            <div className="hidden w-28 text-right text-xs text-muted-foreground sm:block">
                              {new Date(compra.fecha).toLocaleDateString('es-SV')}
                            </div>
                          </button>

                          {isOpen && compra.lotes_inventario.length > 0 && (
                            <div className="border-t border-border bg-muted/20 px-4 py-4 sm:pl-13">
                              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Lotes generados</p>
                              <div className="flex flex-col gap-1.5">
                                {compra.lotes_inventario.map((lote, idx) => {
                                  const prod = productos.find(p => p.id === lote.producto_id)
                                  return (
                                    <div key={`compra-lote-${lote.id}-${idx}`} className="flex flex-wrap items-center gap-3 rounded-sm border border-border bg-card px-3 py-2 text-sm">
                                      <span className="flex-1 truncate font-medium">{prod?.nombre || `Producto #${lote.producto_id}`}</span>
                                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{lote.cantidad_disponible}/{lote.cantidad_inicial} uds</span>
                                      <span className="font-mono text-xs text-muted-foreground">@<MoneyValue value={lote.costo_unitario_adquisicion} tone="muted" className="text-xs" /></span>
                                      {lote.fecha_vencimiento && (
                                        <span className="text-xs text-warning">Vence: {new Date(lote.fecha_vencimiento).toLocaleDateString('es-SV')}</span>
                                      )}
                                      {lote.cantidad_disponible > 0 && !esCajero && (
                                        <Button variant="outline" size="sm"
                                          className="ml-auto h-7 gap-1 border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setAjusteTarget({ lote, nombre: prod?.nombre || `Producto #${lote.producto_id}` })
                                            setAjusteDialogOpen(true)
                                          }}
                                        >
                                          <AlertTriangle className="h-3.5 w-3.5" /> Merma
                                        </Button>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {/* Dialogs */}
      <Dialog open={compraDialogOpen} onOpenChange={setCompraDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] overflow-hidden p-0 lg:max-w-5xl" showCloseButton>
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" /> Registro de compra
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto p-6">
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
