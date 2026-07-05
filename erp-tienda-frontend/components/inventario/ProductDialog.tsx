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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Nuevo producto</DialogTitle>
          <DialogDescription>Agrega un producto al catálogo con sus presentaciones de venta.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {error && (
            <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          {/* Nombre del producto */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">Nombre del producto</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Arroz Blanco Precocido"
              required
              className="h-11"
            />
          </div>

          {/* Categoría */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Categoría</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-primary hover:text-primary"
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
                className="h-11"
              />
            ) : (
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Presentaciones */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Presentaciones de venta</Label>
              <Button type="button" variant="outline" size="sm" onClick={addPresentacion} className="h-7 gap-1 text-xs">
                <Plus className="h-3 w-3" /> Agregar
              </Button>
            </div>

            {presentaciones.length === 0 && (
              <p className="text-xs italic text-muted-foreground">Puedes agregar presentaciones ahora o después.</p>
            )}

            {presentaciones.map((pres) => (
              <div key={pres.key} className="relative flex flex-col gap-3 rounded-sm border border-border bg-muted/30 p-4">
                <Button type="button" variant="ghost" size="icon"
                  className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => removePresentacion(pres.key)}>
                  <X className="h-3.5 w-3.5" />
                </Button>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="mb-1 block text-xs font-medium text-muted-foreground">Descripción</Label>
                    <Input value={pres.descripcion} onChange={(e) => updatePresentacion(pres.key, "descripcion", e.target.value)}
                      placeholder='Ej: "Unidad", "Fardo de 12"' className="h-9 text-sm" />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs font-medium text-muted-foreground">Código de barras</Label>
                    <Input value={pres.codigo_barras} onChange={(e) => updatePresentacion(pres.key, "codigo_barras", e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                      placeholder="Opcional" className="h-9 font-mono text-sm" />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs font-medium text-muted-foreground">Factor conversión</Label>
                    <Input type="number" min={1} value={pres.factor_conversion}
                      onChange={(e) => updatePresentacion(pres.key, "factor_conversion", e.target.value)}
                      className="h-9 font-mono text-sm" />
                  </div>
                  <div className="col-span-2">
                    <Label className="mb-1 block text-xs font-medium text-muted-foreground">Precio de venta ($)</Label>
                    <Input type="number" min={0} step="0.01" value={pres.precio_venta}
                      onChange={(e) => updatePresentacion(pres.key, "precio_venta", e.target.value)}
                      className="h-9 font-mono text-sm" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : "Crear producto"}
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
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Nueva presentación</DialogTitle>
          <DialogDescription>
            Agregar presentación a <span className="font-medium text-foreground">{productoNombre}</span>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">{error}</div>
          )}

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">Descripción</Label>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required
              placeholder='Ej: "Unidad", "Fardo de 12"' className="h-11" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Código de barras</Label>
              <Input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                placeholder="Opcional" className="h-9 font-mono text-sm" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Factor conversión</Label>
              <Input type="number" min={1} value={factorConversion}
                onChange={(e) => setFactorConversion(e.target.value)}
                className="h-9 font-mono text-sm" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">Precio de venta ($)</Label>
            <Input type="number" min={0} step="0.01" value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="h-11 font-mono" />
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando…</> : "Agregar presentación"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
