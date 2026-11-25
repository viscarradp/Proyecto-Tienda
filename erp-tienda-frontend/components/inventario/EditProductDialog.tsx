import * as React from "react"
import { Loader2, History, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatMoney, aNumero, montoACentavos } from "@/lib/format"
import { format } from "date-fns"
import { es } from "date-fns/locale"

import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { errorFactor, errorPrecio, avisoPrecio, MensajeCampo } from "./validacionPresentacion"

interface EditProductDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  producto: Producto | null
}

interface HistorialPrecio {
  id: number
  precio_anterior: string
  precio_nuevo: string
  fecha: string
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
  const [intentado, setIntentado] = React.useState(false)
  // NEG-17: aviso (no bloqueo) al cambiar el múltiplo de una presentación con
  // ventas. `factorAvisado` guarda qué cambio ya se avisó; con el mismo cambio,
  // el segundo «Guardar» sigue adelante.
  const [avisoFactor, setAvisoFactor] = React.useState("")
  const [factorAvisado, setFactorAvisado] = React.useState("")
  // Lo último que se sabe guardado en el servidor. Se actualiza a medida que
  // cada cambio se guarda, para no reenviar lo ya guardado si algo falla.
  const [base, setBase] = React.useState<{ nombre: string; categoriaId: string; pres: Presentacion[] }>({
    nombre: "",
    categoriaId: "",
    pres: [],
  })

  // Historial de precios (Bloque 3.C): por presentación, bajo demanda.
  const [histFor, setHistFor] = React.useState<number | null>(null)
  const [histData, setHistData] = React.useState<Record<number, HistorialPrecio[]>>({})
  const [histLoading, setHistLoading] = React.useState(false)

  React.useEffect(() => {
    if (open && producto) {
      setNombre(producto.nombre)
      setCategoriaId(producto.categoria_id.toString())
      // El campo del factor se edita como texto: "1.000" → "1".
      const pres = producto.presentaciones.map((p) => ({
        ...p,
        factor_conversion: String(aNumero(p.factor_conversion)),
      }))
      setPresentaciones(pres)
      setBase({ nombre: producto.nombre, categoriaId: producto.categoria_id.toString(), pres })
      setError("")
      setIntentado(false)
      setAvisoFactor("")
      setFactorAvisado("")
    }
  }, [open, producto])

  if (!producto) return null

  const handleUpdatePresentacion = (idx: number, field: keyof Presentacion, value: string | number) => {
    const newPres = [...presentaciones]
    newPres[idx] = { ...newPres[idx], [field]: value }
    setPresentaciones(newPres)
  }

  const cambioPresentacion = (pres: Presentacion) => {
    const original = base.pres.find((p) => p.id === pres.id)
    if (!original) return false
    return (
      original.descripcion !== pres.descripcion ||
      (original.codigo_barras ?? "") !== (pres.codigo_barras ?? "") ||
      aNumero(original.factor_conversion) !== aNumero(pres.factor_conversion) ||
      montoACentavos(original.precio_venta) !== montoACentavos(pres.precio_venta)
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIntentado(true)
    if (!nombre.trim() || !categoriaId) {
      setError("El nombre y la categoría son obligatorios")
      return
    }
    // Nada se corrige en silencio: solo se valida lo que se cambió.
    const cambiadas = presentaciones.filter(cambioPresentacion)
    if (cambiadas.some((p) => !p.descripcion.trim() || errorFactor(String(p.factor_conversion)) || errorPrecio(p.precio_venta))) {
      setError("Revisa los campos marcados en rojo")
      return
    }

    setLoading(true)
    setError("")

    // Aviso de múltiplo con ventas (no bloquea: puede ser una corrección legítima).
    const factorCambiado = cambiadas.filter(
      (p) => aNumero(base.pres.find((b) => b.id === p.id)?.factor_conversion) !== aNumero(p.factor_conversion),
    )
    if (factorCambiado.length > 0) {
      const firma = factorCambiado.map((p) => `${p.id}:${aNumero(p.factor_conversion)}`).join("|")
      if (firma !== factorAvisado) {
        const usos = await Promise.all(
          factorCambiado.map((p) =>
            apiFetch<{ ventas: number }>(`/presentaciones/${p.id}/uso`).catch(() => ({ ventas: 0 })),
          ),
        )
        if (usos.some((u) => u.ventas > 0)) {
          setFactorAvisado(firma)
          setAvisoFactor(
            "Esta presentación ya tiene ventas: cambiar el múltiplo cambia cómo se cuentan las unidades vendidas antes. " +
              "Si es una corrección, toca «Guardar de todos modos».",
          )
          setLoading(false)
          return
        }
      }
    }
    setAvisoFactor("")

    const guardado: string[] = []
    const nuevaBase = { ...base, pres: [...base.pres] }
    let paso = ""

    try {
      // 1. Producto (solo si cambió nombre o categoría)
      if (nombre.trim() !== base.nombre || categoriaId !== base.categoriaId) {
        paso = "el nombre y la categoría"
        await apiFetch(`/productos/${producto.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nombre: nombre.trim(),
            categoria_id: parseInt(categoriaId, 10),
          })
        })
        nuevaBase.nombre = nombre.trim()
        nuevaBase.categoriaId = categoriaId
        guardado.push("el nombre y la categoría")
      }

      // 2. Presentaciones que cambiaron, una por una
      for (const pres of cambiadas) {
        paso = `la presentación «${pres.descripcion.trim() || "sin nombre"}»`
        await apiFetch(`/presentaciones/${pres.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            descripcion: pres.descripcion.trim(),
            codigo_barras: pres.codigo_barras?.trim() || undefined,
            factor_conversion: aNumero(pres.factor_conversion),
            precio_venta: aNumero(pres.precio_venta),
          })
        })
        nuevaBase.pres = nuevaBase.pres.map((p) => (p.id === pres.id ? { ...pres } : p))
        guardado.push(paso)
      }

      onSuccess()
      onClose()
    } catch (err: unknown) {
      const motivo = (err instanceof Error ? err.message : "Error desconocido").replace(/[.\s]+$/, "")
      if (guardado.length > 0) {
        setBase(nuevaBase)
        setError(
          `Se guardó: ${guardado.join(", ")}. No se pudo guardar ${paso}: ${motivo}. Corrígelo y vuelve a guardar; lo ya guardado no se repite.`,
        )
        onSuccess() // recarga el inventario para que la pantalla refleje lo guardado
      } else {
        setError(`No se pudo guardar ${paso || "el producto"}: ${motivo}.`)
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleHistorial = async (presId: number) => {
    if (histFor === presId) {
      setHistFor(null)
      return
    }
    setHistFor(presId)
    if (!histData[presId]) {
      setHistLoading(true)
      try {
        const rows = await apiFetch<HistorialPrecio[]>(`/presentaciones/${presId}/historial-precios`)
        setHistData((prev) => ({ ...prev, [presId]: rows }))
      } catch {
        setHistData((prev) => ({ ...prev, [presId]: [] }))
      } finally {
        setHistLoading(false)
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="flex w-[95vw] flex-col overflow-hidden p-0 sm:max-w-3xl" showCloseButton>
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Edición de producto</DialogTitle>
          <DialogDescription>
            Modifica nombres, categorías, códigos de barras y precios de venta. El stock sigue bloqueado por seguridad.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
          {error && (
            <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          {avisoFactor && (
            <div className="rounded-sm border border-warning/30 bg-warning/10 p-3 text-sm font-medium text-warning-text">
              {avisoFactor}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Datos generales</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
              <div className="flex flex-col gap-2">
                <Label htmlFor="editproductdialog-nombre-del-producto" className="text-xs font-medium text-muted-foreground">Nombre del producto</Label>
                <Input id="editproductdialog-nombre-del-producto"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="h-11 md:h-11"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="editproductdialog-categoria" className="text-xs font-medium text-muted-foreground">Categoría</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger id="editproductdialog-categoria" className="h-11 md:h-11 w-full">
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
                <div key={pres.id} className="rounded-sm border border-border bg-muted/30 p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`ep-desc-${pres.id}`} className="text-xs font-medium text-muted-foreground">Descripción</Label>
                      <Input id={`ep-desc-${pres.id}`}
                        value={pres.descripcion}
                        onChange={(e) => handleUpdatePresentacion(idx, "descripcion", e.target.value)}
                        className="h-11 md:h-8 text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`ep-cod-${pres.id}`} className="text-xs font-medium text-muted-foreground">Cód. barras</Label>
                      <Input id={`ep-cod-${pres.id}`}
                        value={pres.codigo_barras || ""}
                        onChange={(e) => handleUpdatePresentacion(idx, "codigo_barras", e.target.value)}
                        placeholder="Sin código"
                        className="h-11 md:h-8 font-mono text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`ep-mult-${pres.id}`} className="text-xs font-medium text-muted-foreground">Múltiplo</Label>
                      <Input
                        id={`ep-mult-${pres.id}`}
                        type="number"
                        min="0.001"
                        step="any"
                        value={pres.factor_conversion}
                        onChange={(e) => handleUpdatePresentacion(idx, "factor_conversion", e.target.value)}
                        className="h-11 md:h-8 font-mono text-xs"
                      />
                      {intentado && cambioPresentacion(pres) && <MensajeCampo error={errorFactor(String(pres.factor_conversion))} />}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`ep-precio-${pres.id}`} className="text-xs font-medium text-muted-foreground">Precio ($)</Label>
                        <button
                          type="button"
                          onClick={() => toggleHistorial(pres.id)}
                          className={cn(
                            "flex size-11 md:size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                            histFor === pres.id && "bg-muted text-foreground",
                          )}
                          title="Historial de precios"
                          aria-label={`Historial de precios de ${pres.descripcion || "la presentación"}`}
                          aria-pressed={histFor === pres.id}
                        >
                          <History className="h-3 w-3" />
                        </button>
                      </div>
                      <Input
                        id={`ep-precio-${pres.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={pres.precio_venta}
                        onChange={(e) => handleUpdatePresentacion(idx, "precio_venta", e.target.value)}
                        className="h-11 md:h-8 font-mono text-xs font-semibold text-success"
                      />
                      <MensajeCampo
                        error={intentado && cambioPresentacion(pres) ? errorPrecio(pres.precio_venta) : null}
                        aviso={avisoPrecio(pres.precio_venta)}
                      />
                    </div>
                  </div>

                  {histFor === pres.id && (
                    <div className="mt-3 border-t border-border pt-3">
                      {histLoading && !histData[pres.id] ? (
                        <p className="text-xs text-muted-foreground">Cargando historial…</p>
                      ) : (histData[pres.id]?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin cambios de precio registrados.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Historial de precios
                          </p>
                          {histData[pres.id].map((h) => (
                            <div key={h.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-muted-foreground">
                                {format(new Date(h.fecha), "dd MMM yyyy HH:mm", { locale: es })}
                              </span>
                              <span className="font-mono text-muted-foreground">{formatMoney(h.precio_anterior)}</span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="font-mono font-semibold text-success">{formatMoney(h.precio_nuevo)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : avisoFactor ? "Guardar de todos modos" : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
