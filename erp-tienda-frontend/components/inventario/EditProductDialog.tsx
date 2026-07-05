import * as React from "react"
import { Loader2 } from "lucide-react"

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
  // Selector de un solo campo: no necesita useShallow (una referencia no
  // compuesta ya evita re-renders cuando cambian otros campos del store,
  // ej. productos, cada vez que se refresca el inventario en otra vista).
  const categorias = useInventoryStore((state) => state.categorias)

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
      <DialogContent className="w-[95vw] overflow-hidden p-0 sm:max-w-3xl" showCloseButton>
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Edición de producto</DialogTitle>
          <DialogDescription>
            Modifica nombres, categorías, códigos de barras y precios de venta. El stock sigue bloqueado por seguridad.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-6 overflow-y-auto p-6">
          {error && (
            <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Datos generales</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Nombre del producto</Label>
                <Input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Categoría</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map(cat => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>{cat.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Presentaciones configuradas</h3>

            <div className="flex flex-col gap-3">
              {presentaciones.length === 0 ? (
                <p className="text-xs text-muted-foreground">Este producto aún no tiene presentaciones creadas.</p>
              ) : presentaciones.map((pres, idx) => (
                <div key={pres.id} className="grid grid-cols-2 gap-3 rounded-sm border border-border bg-muted/30 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-medium text-muted-foreground">Descripción</Label>
                    <Input
                      value={pres.descripcion}
                      onChange={(e) => handleUpdatePresentacion(idx, "descripcion", e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-medium text-muted-foreground">Cód. barras</Label>
                    <Input
                      value={pres.codigo_barras || ""}
                      onChange={(e) => handleUpdatePresentacion(idx, "codigo_barras", e.target.value)}
                      placeholder="Sin código"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-medium text-muted-foreground">Múltiplo</Label>
                    <Input
                      type="number"
                      min="1"
                      value={pres.factor_conversion}
                      onChange={(e) => handleUpdatePresentacion(idx, "factor_conversion", parseInt(e.target.value) || 1)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs font-medium text-muted-foreground">Precio ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={pres.precio_venta}
                      onChange={(e) => handleUpdatePresentacion(idx, "precio_venta", e.target.value)}
                      className="h-8 font-mono text-xs font-semibold text-success"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
