'use client'

import * as React from "react"
import { Plus, X, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmDialog } from "@/components/confirm-dialog"
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
import { toast } from "sonner"
import { apiFetch } from "@/lib/api"
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner"
import { generarId } from "@/lib/id"
import { errorFactor, errorPrecio, avisoPrecio, MensajeCampo } from "./validacionPresentacion"

// ─── Types ───
interface Categoria {
  id: number
  nombre: string
}

interface PresentacionForm {
  key: string
  /** Solo las presentaciones extra: el código de la primera va arriba del formulario. */
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

const CLAVE_ULTIMA_CATEGORIA = "inventario:ultimaCategoria"

function leerUltimaCategoria(): string {
  try {
    return window.localStorage.getItem(CLAVE_ULTIMA_CATEGORIA) ?? ""
  } catch {
    return ""
  }
}

function guardarUltimaCategoria(id: string) {
  try {
    window.localStorage.setItem(CLAVE_ULTIMA_CATEGORIA, id)
  } catch {
    // Sin almacenamiento: solo se pierde la comodidad.
  }
}

const nuevaPresentacion = (descripcion = ""): PresentacionForm => ({
  key: generarId(),
  codigo_barras: "",
  descripcion,
  factor_conversion: "1",
  precio_venta: "",
})

export function ProductDialog({ open, onClose, onSuccess, categorias, onCategoriaCreated }: ProductDialogProps) {
  const [codigoPrincipal, setCodigoPrincipal] = React.useState("")
  const [nombre, setNombre] = React.useState("")
  const [categoriaId, setCategoriaId] = React.useState("")
  const [newCatName, setNewCatName] = React.useState("")
  const [showNewCat, setShowNewCat] = React.useState(false)
  // La primera presentación arranca como "Unidad", factor 1.
  const [presentaciones, setPresentaciones] = React.useState<PresentacionForm[]>(() => [nuevaPresentacion("Unidad")])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [intentado, setIntentado] = React.useState(false)

  const resetForm = () => {
    setIntentado(false)
    setCodigoPrincipal("")
    setNombre("")
    setCategoriaId(leerUltimaCategoria())
    setNewCatName("")
    setShowNewCat(false)
    setPresentaciones([nuevaPresentacion("Unidad")])
    setError("")
  }

  // Default útil: la última categoría usada (si todavía existe).
  React.useEffect(() => {
    if (!open) return
    const ultima = leerUltimaCategoria()
    if (ultima && categorias.some((c) => String(c.id) === ultima)) {
      setCategoriaId((actual) => actual || ultima)
    }
  }, [open, categorias])

  // Si el lector escanea con el foco fuera de un campo, el código va al campo de código.
  useBarcodeScanner({
    enabled: open,
    onScan: (barcode) => setCodigoPrincipal(barcode),
  })

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const addPresentacion = () => setPresentaciones((prev) => [...prev, nuevaPresentacion()])

  const updatePresentacion = (key: string, field: keyof PresentacionForm, value: string) => {
    setPresentaciones(prev => prev.map(p =>
      p.key === key ? { ...p, [field]: value } : p
    ))
  }

  const removePresentacion = (key: string) => {
    setPresentaciones(prev => prev.filter(p => p.key !== key))
  }
  const [presAQuitar, setPresAQuitar] = React.useState<string | null>(null)
  // Una presentación vacía se quita sin preguntar; si ya tiene datos, se confirma.
  const pedirQuitarPresentacion = (p: PresentacionForm) => {
    const tieneDatos = p.descripcion.trim() !== "" || p.codigo_barras.trim() !== "" || p.precio_venta.trim() !== ""
    if (tieneDatos) setPresAQuitar(p.key)
    else removePresentacion(p.key)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIntentado(true)
    // Nada se corrige en silencio: si algo está mal, se avisa en el campo.
    const hayErrores = presentaciones.some(
      (p) => !p.descripcion.trim() || errorFactor(p.factor_conversion) || errorPrecio(p.precio_venta),
    )
    if (hayErrores) {
      setError("Revisa los campos marcados en rojo")
      return
    }
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
        // Si el producto falla, al reintentar se usa esta categoría y no se crea otra.
        setCategoriaId(String(newCat.id))
        setShowNewCat(false)
        onCategoriaCreated()
      }

      if (!finalCategoriaId || isNaN(finalCategoriaId)) {
        throw new Error("Debes seleccionar o crear una categoría")
      }

      // Una sola llamada: el servidor crea el producto y sus presentaciones
      // juntos; si algo falla no queda nada a medias.
      await apiFetch("/productos", {
        method: "POST",
        body: JSON.stringify({
          nombre: nombre.trim(),
          categoria_id: finalCategoriaId,
          presentaciones: presentaciones.map((p, i) => ({
            codigo_barras: (i === 0 ? codigoPrincipal : p.codigo_barras).trim() || undefined,
            descripcion: p.descripcion.trim(),
            factor_conversion: Number(p.factor_conversion),
            precio_venta: Number(p.precio_venta),
          })),
        }),
      })

      guardarUltimaCategoria(String(finalCategoriaId))
      toast.success(`Producto «${nombre.trim()}» creado`)
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
      <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
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

          {/* Código de barras primero y con el foco: el lector escribe aquí, no en "Nombre". */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="productdialog-codigo-de-barras" className="text-xs font-medium text-muted-foreground">Código de barras</Label>
            <Input id="productdialog-codigo-de-barras"
              autoFocus
              value={codigoPrincipal}
              onChange={(e) => setCodigoPrincipal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
              placeholder="Escanea el código o déjalo vacío"
              className="h-11 md:h-11 font-mono"
            />
          </div>

          {/* Nombre del producto */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="productdialog-nombre-del-producto" className="text-xs font-medium text-muted-foreground">Nombre del producto</Label>
            <Input id="productdialog-nombre-del-producto"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Arroz Blanco Precocido"
              required
              className="h-11 md:h-11"
            />
          </div>

          {/* Categoría */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="producto-categoria" className="text-xs font-medium text-muted-foreground">Categoría</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 md:h-6 px-2 text-xs text-primary hover:text-primary"
                onClick={() => setShowNewCat(!showNewCat)}
              >
                {showNewCat ? "Seleccionar existente" : "+ Crear nueva"}
              </Button>
            </div>
            {showNewCat ? (
              <Input
                id="producto-categoria"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nombre de la nueva categoría"
                className="h-11 md:h-11"
              />
            ) : (
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger id="producto-categoria" className="h-11 md:h-11 w-full">
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
              <p className="text-xs font-medium text-muted-foreground">Presentaciones de venta</p>
              <Button type="button" variant="outline" size="sm" onClick={addPresentacion} className="h-11 md:h-7 gap-1 text-xs">
                <Plus className="h-3 w-3" /> Agregar
              </Button>
            </div>

            {presentaciones.map((pres, idx) => (
              <div key={pres.key} className="relative flex flex-col gap-3 rounded-sm border border-border bg-muted/30 p-4">
                {idx > 0 && (
                  <Button type="button" variant="ghost" size="icon"
                    className="absolute top-2 right-2 size-11 md:size-6 text-muted-foreground hover:text-destructive"
                    aria-label={`Quitar la presentación ${idx + 1}`}
                    onClick={() => pedirQuitarPresentacion(pres)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor={`pres-desc-${pres.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">Descripción</Label>
                    <Input id={`pres-desc-${pres.key}`} value={pres.descripcion} onChange={(e) => updatePresentacion(pres.key, "descripcion", e.target.value)}
                      placeholder='Ej: "Unidad", "Fardo de 12"' className="h-11 md:h-9 text-sm" />
                    {intentado && !pres.descripcion.trim() && <MensajeCampo error="Falta la descripción" />}
                  </div>
                  {idx > 0 && (
                    <div className="col-span-2">
                      <Label htmlFor={`pres-cod-${pres.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">Código de barras</Label>
                      <Input id={`pres-cod-${pres.key}`} value={pres.codigo_barras} onChange={(e) => updatePresentacion(pres.key, "codigo_barras", e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                        placeholder="Opcional" className="h-11 md:h-9 font-mono text-sm" />
                    </div>
                  )}
                  <div>
                    <Label htmlFor={`pres-mult-${pres.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">Múltiplo (unidades que trae)</Label>
                    <Input id={`pres-mult-${pres.key}`} type="number" min={0.001} step="any" value={pres.factor_conversion}
                      onChange={(e) => updatePresentacion(pres.key, "factor_conversion", e.target.value)}
                      className="h-11 md:h-9 font-mono text-sm" />
                    {intentado && <MensajeCampo error={errorFactor(pres.factor_conversion)} />}
                  </div>
                  <div>
                    <Label htmlFor={`pres-precio-${pres.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">Precio de venta ($)</Label>
                    <Input id={`pres-precio-${pres.key}`} type="number" min={0} step="0.01" value={pres.precio_venta}
                      onChange={(e) => updatePresentacion(pres.key, "precio_venta", e.target.value)}
                      className="h-11 md:h-9 font-mono text-sm" />
                    <MensajeCampo
                      error={intentado ? errorPrecio(pres.precio_venta) : null}
                      aviso={avisoPrecio(pres.precio_venta)}
                    />
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
      <ConfirmDialog
        open={presAQuitar !== null}
        onOpenChange={(v) => { if (!v) setPresAQuitar(null) }}
        title="¿Quitar esta presentación?"
        description="Se descartan los datos que escribiste en ella. El producto todavía no se ha guardado, así que no se borra nada del inventario."
        confirmLabel="Quitar presentación"
        onConfirm={() => { if (presAQuitar) removePresentacion(presAQuitar) }}
      />
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
  const [intentado, setIntentado] = React.useState(false)

  const resetForm = () => {
    setIntentado(false)
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
    setIntentado(true)
    if (errorFactor(factorConversion) || errorPrecio(precioVenta)) return
    setLoading(true)
    setError("")
    try {
      await apiFetch("/presentaciones", {
        method: "POST",
        body: JSON.stringify({
          producto_id: productoId,
          codigo_barras: codigoBarras || undefined,
          descripcion,
          factor_conversion: Number(factorConversion),
          precio_venta: Number(precioVenta),
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
            <Label htmlFor="productdialog-descripcion-2" className="text-xs font-medium text-muted-foreground">Descripción</Label>
            <Input id="productdialog-descripcion-2" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required
              placeholder='Ej: "Unidad", "Fardo de 12"' className="h-11 md:h-11" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="productdialog-codigo-de-barras-2" className="text-xs font-medium text-muted-foreground">Código de barras</Label>
              <Input id="productdialog-codigo-de-barras-2" value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
                placeholder="Opcional" className="h-11 md:h-9 font-mono text-sm" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="productdialog-factor-conversion" className="text-xs font-medium text-muted-foreground">Factor conversión</Label>
              <Input id="productdialog-factor-conversion" type="number" min={0.001} step="any" value={factorConversion}
                onChange={(e) => setFactorConversion(e.target.value)}
                className="h-11 md:h-9 font-mono text-sm" />
              {intentado && <MensajeCampo error={errorFactor(factorConversion)} />}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="productdialog-precio-de-venta-2" className="text-xs font-medium text-muted-foreground">Precio de venta ($)</Label>
            <Input id="productdialog-precio-de-venta-2" type="number" min={0} step="0.01" value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              className="h-11 md:h-11 font-mono" />
            <MensajeCampo error={intentado ? errorPrecio(precioVenta) : null} aviso={avisoPrecio(precioVenta)} />
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
