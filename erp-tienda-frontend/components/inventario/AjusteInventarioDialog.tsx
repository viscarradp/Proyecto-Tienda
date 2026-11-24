import * as React from "react"
import { Loader2, AlertTriangle, AlertCircle, Minus, Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
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
import { aNumero, formatCantidad } from "@/lib/format"
import { LoteStock } from "@/src/store/inventoryStore"

interface AjusteInventarioDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  productoId: number
  productoNombre: string
  /** Lotes con existencias del producto (para elegir de cuál se quita). */
  lotes: LoteStock[]
  /** Lote preseleccionado (si se abrió desde un lote). */
  loteInicialId?: number | null
  /** La cajera solo registra mermas, con motivo; los conteos son de la dueña. */
  esCajero: boolean
  /** Con qué dirección abre (la dueña puede cambiarla). */
  inicio?: Direccion
}

type Direccion = "quitar" | "agregar"

export function AjusteInventarioDialog({
  open,
  onClose,
  onSuccess,
  productoId,
  productoNombre,
  lotes,
  loteInicialId = null,
  esCajero,
  inicio = "quitar",
}: AjusteInventarioDialogProps) {
  const [direccion, setDireccion] = React.useState<Direccion>("quitar")
  const [loteId, setLoteId] = React.useState("")
  const [cantidad, setCantidad] = React.useState("1")
  const [tipoAjuste, setTipoAjuste] = React.useState("QUEBRADO")
  const [justificacion, setJustificacion] = React.useState("")

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setDireccion(esCajero ? "quitar" : inicio)
      setLoteId(String(loteInicialId ?? lotes[0]?.id ?? ""))
      setCantidad("1")
      setTipoAjuste("QUEBRADO")
      setJustificacion("")
      setError("")
    }
    // Solo al abrir: no pisar lo que la usuaria ya escribió si se recarga el catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const esAgregar = direccion === "agregar" && !esCajero
  const lote = lotes.find((l) => String(l.id) === loteId) ?? null
  const disponible = aNumero(lote?.cantidad_disponible)
  const sinExistencias = !esAgregar && lotes.length === 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cantNum = parseFloat(cantidad)

    if (isNaN(cantNum) || cantNum <= 0) {
      setError("Ingresa una cantidad mayor a 0.")
      return
    }
    if (!esAgregar && !lote) {
      setError("Elige el lote del que se quita.")
      return
    }
    if (!esAgregar && cantNum > disponible) {
      setError(`Solo quedan ${formatCantidad(disponible)} en ese lote.`)
      return
    }
    if (esCajero && !justificacion.trim()) {
      setError("Escribe qué pasó con el producto (el motivo).")
      return
    }

    setLoading(true)
    setError("")

    try {
      // Sumar: al lote más reciente del producto aunque esté en 0. Quitar: del lote elegido.
      const destino = esAgregar ? { producto_id: productoId } : { lote_id: lote?.id }
      await apiFetch("/ajustes-inventario", {
        method: "POST",
        body: JSON.stringify({
          ...destino,
          cantidad_ajustada: cantNum,
          tipo_ajuste: esAgregar ? "CONTEO_SOBRANTE" : tipoAjuste,
          justificacion: justificacion.trim() || undefined,
        }),
      })
      toast.success(
        esAgregar
          ? `Se sumaron ${formatCantidad(cantNum)} a «${productoNombre}»`
          : `Merma de ${formatCantidad(cantNum)} registrada en «${productoNombre}»`,
      )
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar el ajuste")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            {esCajero ? "Registrar merma" : esAgregar ? "Encontré producto" : "Ajuste de inventario"}
          </DialogTitle>
          <DialogDescription>
            {esAgregar
              ? "Suma unidades que están en el estante pero el sistema no tiene. Se agregan al lote más reciente del producto."
              : "Descuenta unidades que se perdieron, quebraron o vencieron. Queda anotado quién lo registró."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-2">
          {error && (
            <div className="flex items-center gap-3 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {/* Dirección del ajuste (solo la dueña: los conteos son suyos) */}
          {!esCajero && (
            <div className="grid grid-cols-2 gap-1 rounded-sm border border-border p-1">
              <button type="button" onClick={() => setDireccion("quitar")}
                className={cn("flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                  !esAgregar ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground")}>
                <Minus className="h-4 w-4" /> Quitar (merma)
              </button>
              <button type="button" onClick={() => setDireccion("agregar")}
                className={cn("flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                  esAgregar ? "bg-success/10 text-success" : "text-muted-foreground hover:text-foreground")}>
                <Plus className="h-4 w-4" /> Encontré (conteo)
              </button>
            </div>
          )}

          <div className="rounded-sm border border-border bg-muted/40 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Producto afectado</p>
            <p className="font-semibold text-foreground">{productoNombre}</p>
          </div>

          {sinExistencias ? (
            <p className="rounded-sm border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Este producto no tiene existencias registradas, no hay nada que quitar.
            </p>
          ) : (
            <>
              {!esAgregar && lotes.length > 1 && (
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">¿De qué lote? (el más viejo sale primero)</Label>
                  <Select value={loteId} onValueChange={setLoteId}>
                    <SelectTrigger className="h-12 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {lotes.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          Lote #{l.id} · quedan {formatCantidad(l.cantidad_disponible)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {!esAgregar && lotes.length === 1 && (
                <p className="font-mono text-xs text-muted-foreground">
                  Quedan {formatCantidad(disponible)} uds en el lote #{lote?.id}
                </p>
              )}

              <div className={esAgregar ? "" : "grid grid-cols-2 gap-4"}>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    {esAgregar ? "Cantidad que encontré" : "Cantidad a descontar"}
                  </Label>
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    max={esAgregar ? undefined : disponible}
                    inputMode="decimal"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    required
                    className="h-12 font-mono text-lg"
                  />
                </div>
                {!esAgregar && (
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs font-medium text-muted-foreground">¿Qué pasó?</Label>
                    <Select value={tipoAjuste} onValueChange={setTipoAjuste}>
                      <SelectTrigger className="h-12 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="QUEBRADO">Quebrado / roto</SelectItem>
                        <SelectItem value="VENCIDO">Vencido</SelectItem>
                        <SelectItem value="ROBO">Robo / pérdida</SelectItem>
                        {!esCajero && <SelectItem value="CONTEO">Ajuste de conteo</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-muted-foreground">
                  {esCajero ? "Motivo (obligatorio)" : "Motivo (opcional)"}
                </Label>
                <Input
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  required={esCajero}
                  placeholder={esAgregar ? "Ej: Estaba en la bodega" : "Ej: Se cayó de la estantería…"}
                  className="h-12"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || sinExistencias}
              className={cn("gap-2", esAgregar
                ? "bg-success text-success-foreground hover:bg-success/90"
                : "bg-warning text-warning-foreground hover:bg-warning/90")}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : esAgregar ? "Sumar al inventario" : "Registrar merma"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
