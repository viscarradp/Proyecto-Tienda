import * as React from "react"
import { Loader2, Plus, Trash2, ShieldAlert } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch } from "@/lib/api"
import { useInventoryStore, Producto, Presentacion } from "@/src/store/inventoryStore"

interface EditProductDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  producto: Producto | null
}

export function EditProductDialog({ open, onClose, onSuccess, producto }: EditProductDialogProps) {
  const { categorias } = useInventoryStore()
  
  const [nombre, setNombre] = React.useState("")
  const [categoriaId, setCategoriaId] = React.useState("")
  
  // Local state for presentaciones to allow multiple edits
  const [presentaciones, setPresentaciones] = React.useState<Presentacion[]>([])
  
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (open && producto) {
      setNombre(producto.nombre)
      setCategoriaId(producto.categoria_id.toString())
      setPresentaciones([...producto.presentaciones])
      setError("")
    }
  }, [open, producto])

  if (!producto) return null

  const handleUpdatePresentacion = (idx: number, field: keyof Presentacion, value: string | number) => {
    const newPres = [...presentaciones]
    newPres[idx] = { ...newPres[idx], [field]: value }
    setPresentaciones(newPres)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nombre.trim() || !categoriaId) {
      setError("El nombre y la categoría son obligatorios")
      return
    }

    setLoading(true)
    setError("")

    try {
      // 1. Update Product
      await apiFetch(`/productos/${producto.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nombre: nombre.trim(),
          categoria_id: parseInt(categoriaId, 10),
        })
      })

      // 2. Update all Presentaciones that changed
      for (const pres of presentaciones) {
        const original = producto.presentaciones.find(p => p.id === pres.id)
        if (original && (
          original.descripcion !== pres.descripcion ||
          original.codigo_barras !== pres.codigo_barras ||
          original.factor_conversion !== pres.factor_conversion ||
          original.precio_venta !== pres.precio_venta
        )) {
          await apiFetch(`/presentaciones/${pres.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              descripcion: pres.descripcion.trim(),
              codigo_barras: pres.codigo_barras?.trim() || undefined,
              factor_conversion: pres.factor_conversion,
              precio_venta: parseFloat(pres.precio_venta)
            })
          })
        }
      }

      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al actualizar el producto")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-7xl w-[95vw] bg-zinc-950 border-zinc-900 border text-white p-0 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-zinc-900">
          <DialogTitle className="font-black text-lg flex items-center gap-2">
            Edición de Producto
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Modifica nombres, categorías, códigos de barras y precios de venta. El stock sigue bloqueado por seguridad.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-xl font-bold">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Datos Generales</h3>
            <div className="grid grid-cols-[2fr_1fr] gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-zinc-400">Nombre del Producto</Label>
                <Input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="bg-black/50 border-zinc-800 focus-visible:ring-indigo-500"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-zinc-400">Categoría</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger className="bg-black/50 border-zinc-800">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                    {categorias.map(cat => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>{cat.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500">Presentaciones Configuradas</h3>
            </div>
            
            <div className="space-y-3">
              {presentaciones.length === 0 ? (
                <p className="text-xs text-zinc-600 block">Este producto aún no tiene presentaciones creadas.</p>
              ) : presentaciones.map((pres, idx) => (
                <div key={pres.id} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-zinc-500 uppercase">Descripción</Label>
                    <Input
                      value={pres.descripcion}
                      onChange={(e) => handleUpdatePresentacion(idx, "descripcion", e.target.value)}
                      className="h-8 text-xs bg-black/50 border-zinc-800 focus-visible:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-zinc-500 uppercase">Cód. Barras</Label>
                    <Input
                      value={pres.codigo_barras || ""}
                      onChange={(e) => handleUpdatePresentacion(idx, "codigo_barras", e.target.value)}
                      placeholder="Sin código"
                      className="h-8 text-xs font-mono bg-black/50 border-zinc-800 focus-visible:ring-indigo-500 placeholder:text-zinc-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-zinc-500 uppercase">Múltiplo</Label>
                    <Input
                      type="number"
                      min="1"
                      value={pres.factor_conversion}
                      onChange={(e) => handleUpdatePresentacion(idx, "factor_conversion", parseInt(e.target.value) || 1)}
                      className="h-8 text-xs font-mono bg-black/50 border-zinc-800 focus-visible:ring-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-zinc-500 uppercase">Precio ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pres.precio_venta}
                      onChange={(e) => handleUpdatePresentacion(idx, "precio_venta", e.target.value)}
                      className="h-8 text-xs font-mono font-bold text-emerald-400 bg-black/50 border-zinc-800 focus-visible:ring-emerald-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-zinc-900">
            <Button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="bg-zinc-800 text-white hover:bg-zinc-700 rounded-xl h-11 px-6 font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl h-11 px-6 shadow-lg shadow-indigo-900/20"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Guardar Cambios Seguros"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
