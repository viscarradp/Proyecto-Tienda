'use client'

import * as React from "react"
import { Plus, X, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch } from "@/lib/api"
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner"

// ─── Types ───
interface Categoria {
  id: number
  nombre: string
}

interface PresentacionForm {
  key: string
  codigo_barras: string
  descripcion: string
  factor_conversion: string
  precio_venta: string
}

interface ProductDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  categorias: Categoria[]
  onCategoriaCreated: () => void
}

export function ProductDialog({ open, onClose, onSuccess, categorias, onCategoriaCreated }: ProductDialogProps) {
  const [nombre, setNombre] = React.useState("")
  const [categoriaId, setCategoriaId] = React.useState("")
  const [newCatName, setNewCatName] = React.useState("")
  const [showNewCat, setShowNewCat] = React.useState(false)
  const [presentaciones, setPresentaciones] = React.useState<PresentacionForm[]>([{
    key: crypto.randomUUID(),
    codigo_barras: "",
    descripcion: "",
    factor_conversion: "1",
    precio_venta: "",
  }])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const resetForm = () => {
    setNombre("")
    setCategoriaId("")
    setNewCatName("")
    setShowNewCat(false)
    setPresentaciones([{
      key: crypto.randomUUID(),
      codigo_barras: "",
      descripcion: "",
      factor_conversion: "1",
      precio_venta: "",
    }])
    setError("")
  }

  // Auto-fill barcode when a scanner is used globally while this modal is open
  useBarcodeScanner({
    enabled: open,
    onScan: (barcode) => {
      if (presentaciones.length > 0) {
        updatePresentacion(presentaciones[0].key, "codigo_barras", barcode)
      } else {
        // If no presentation exists yet, create one automatically with the barcode
        setPresentaciones([{
          key: crypto.randomUUID(),
          codigo_barras: barcode,
          descripcion: "",
          factor_conversion: "1",
          precio_venta: "",
        }])
      }
    }
  })

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const addPresentacion = () => {
    setPresentaciones([...presentaciones, {
      key: crypto.randomUUID(),
      codigo_barras: "",
      descripcion: "",
      factor_conversion: "1",
      precio_venta: "",
    }])
  }

  const updatePresentacion = (key: string, field: keyof PresentacionForm, value: string) => {
    setPresentaciones(prev => prev.map(p =>
      p.key === key ? { ...p, [field]: value } : p
    ))
  }

  const removePresentacion = (key: string) => {
    setPresentaciones(prev => prev.filter(p => p.key !== key))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      let finalCategoriaId = parseInt(categoriaId)
      if (showNewCat && newCatName.trim()) {
        const newCat = await apiFetch<Categoria>("/categorias", {
          method: "POST",
          body: JSON.stringify({ nombre: newCatName.trim() }),
        })
        finalCategoriaId = newCat.id
        onCategoriaCreated()
      }

      if (!finalCategoriaId || isNaN(finalCategoriaId)) {
        throw new Error("Debes seleccionar o crear una categoría")
      }

      const producto = await apiFetch<{ id: number }>("/productos", {
        method: "POST",
        body: JSON.stringify({ nombre, categoria_id: finalCategoriaId }),
      })

      for (const pres of presentaciones) {
        if (!pres.descripcion.trim()) continue
        await apiFetch("/presentaciones", {
          method: "POST",
          body: JSON.stringify({
            producto_id: producto.id,
            codigo_barras: pres.codigo_barras || undefined,
            descripcion: pres.descripcion,
            factor_conversion: parseInt(pres.factor_conversion) || 1,
            precio_venta: parseFloat(pres.precio_venta) || 0,
          }),
        })
      }

      handleClose()
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear producto")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200 sm:max-w-2xl max-h-[90vh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-white uppercase tracking-tight">Nuevo Producto</DialogTitle>
          <DialogDescription className="text-zinc-500">Agrega un producto al catálogo con sus presentaciones de venta.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-2">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl text-center font-medium">
              {error}
            </div>
          )}

          {/* Nombre del producto */}
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Nombre del Producto</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Arroz Blanco Precocido"
              required
              className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl focus-visible:ring-blue-500"
            />
          </div>

          {/* Categoría */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Categoría</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-blue-500 hover:text-blue-400 text-xs font-bold h-6 px-2"
                onClick={() => setShowNewCat(!showNewCat)}
              >
                {showNewCat ? "Seleccionar existente" : "+ Crear nueva"}
              </Button>
            </div>
            {showNewCat ? (
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nombre de la nueva categoría"
                className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl focus-visible:ring-blue-500"
              />
            ) : (
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl focus:ring-blue-500">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  {categorias.map(c => (
                    <SelectItem key={c.id} value={String(c.id)} className="text-zinc-200 focus:bg-zinc-800 focus:text-white">
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Presentaciones */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider text-zinc-400">Presentaciones de Venta</Label>
              <Button type="button" variant="outline" size="sm" onClick={addPresentacion}
                className="border-zinc-800 text-white hover:bg-zinc-900 hover:text-white rounded-lg gap-1 h-7 text-xs">
                <Plus className="h-3 w-3" /> Agregar
              </Button>
            </div>

            {presentaciones.length === 0 && (
              <p className="text-xs text-zinc-600 italic">Puedes agregar presentaciones ahora o después.</p>
            )}

            {presentaciones.map((pres) => (
              <div key={pres.key} className="bg-black/40 border border-zinc-800/50 rounded-xl p-4 space-y-3 relative">
                <Button type="button" variant="ghost" size="icon"
                  className="absolute top-2 right-2 h-6 w-6 text-zinc-600 hover:text-red-400"
                  onClick={() => removePresentacion(pres.key)}>
                  <X className="h-3.5 w-3.5" />
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Descripción</Label>
                    <Input value={pres.descripcion} onChange={(e) => updatePresentacion(pres.key, "descripcion", e.target.value)}
                      placeholder='Ej: "Unidad", "Fardo de 12"' className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Código de Barras</Label>
                    <Input value={pres.codigo_barras} onChange={(e) => updatePresentacion(pres.key, "codigo_barras", e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                      placeholder="Opcional" className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
                  </div>
                  <div>
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Factor Conversión</Label>
                    <Input type="number" min={1} value={pres.factor_conversion}
                      onChange={(e) => updatePresentacion(pres.key, "factor_conversion", e.target.value)}
                      className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Precio de Venta ($)</Label>
                    <Input type="number" min={0} step="0.01" value={pres.precio_venta}
                      onChange={(e) => updatePresentacion(pres.key, "precio_venta", e.target.value)}
                      className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer — botones con fondo consistente */}
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800/50">
            <Button type="button" variant="outline" onClick={handleClose}
              className="bg-zinc-800 text-white hover:bg-zinc-700 rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : "Crear Producto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog para agregar presentación a un producto existente ───
interface AddPresentacionDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  productoId: number
  productoNombre: string
}

export function AddPresentacionDialog({ open, onClose, onSuccess, productoId, productoNombre }: AddPresentacionDialogProps) {
  const [descripcion, setDescripcion] = React.useState("")
  const [codigoBarras, setCodigoBarras] = React.useState("")
  const [factorConversion, setFactorConversion] = React.useState<string>("1")
  const [precioVenta, setPrecioVenta] = React.useState<string>("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const resetForm = () => {
    setDescripcion("")
    setCodigoBarras("")
    setFactorConversion("1")
    setPrecioVenta("")
    setError("")
  }

  // Auto-fill barcode
  useBarcodeScanner({
    enabled: open,
    onScan: (barcode) => setCodigoBarras(barcode)
  })

  const handleClose = () => { resetForm(); onClose() }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    try {
      await apiFetch("/presentaciones", {
        method: "POST",
        body: JSON.stringify({
          producto_id: productoId,
          codigo_barras: codigoBarras || undefined,
          descripcion,
          factor_conversion: parseInt(factorConversion) || 1,
          precio_venta: parseFloat(precioVenta) || 0,
        }),
      })
      handleClose()
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear presentación")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200 sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-white uppercase tracking-tight">Nueva Presentación</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Agregar presentación a <span className="text-zinc-300 font-bold">{productoNombre}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl text-center font-medium">{error}</div>
          )}

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required
              placeholder='Ej: "Unidad", "Fardo de 12"' className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl focus-visible:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Código de Barras</Label>
              <Input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                placeholder="Opcional" className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Factor Conversión</Label>
              <Input type="number" min={1} value={factorConversion}
                onChange={(e) => setFactorConversion(e.target.value)}
                className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Precio de Venta ($)</Label>
            <Input type="number" min={0} step="0.01" value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl focus-visible:ring-blue-500" />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800/50">
            <Button type="button" variant="outline" onClick={handleClose}
              className="bg-zinc-800 text-white hover:bg-zinc-700 rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/20 gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</> : "Agregar Presentación"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
