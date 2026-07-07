import * as React from "react"
import { Loader2, AlertTriangle, AlertCircle, Minus, Plus } from "lucide-react"

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
import { LoteStock } from "@/src/store/inventoryStore"

interface AjusteInventarioDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  lote: LoteStock | null
  productoNombre: string
}

type Direccion = "quitar" | "agregar"

export function AjusteInventarioDialog({
  open,
  onClose,
  onSuccess,
  lote,
  productoNombre
}: AjusteInventarioDialogProps) {
  const [direccion, setDireccion] = React.useState<Direccion>("quitar")
  const [cantidad, setCantidad] = React.useState("1")
  const [tipoAjuste, setTipoAjuste] = React.useState("QUEBRADO")
  const [justificacion, setJustificacion] = React.useState("")

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setDireccion("quitar")
      setCantidad("1")
      setTipoAjuste("QUEBRADO")
      setJustificacion("")
      setError("")
    }
  }, [open])

  if (!lote) return null

  const esAgregar = direccion === "agregar"
  const disponible = Number(lote.cantidad_disponible)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cantNum = parseFloat(cantidad)

    if (isNaN(cantNum) || cantNum <= 0) {
      setError("Ingresa una cantidad mayor a 0.")
      return
    }
    if (!esAgregar && cantNum > disponible) {
      setError("La cantidad no puede ser mayor al stock disponible de este lote.")
      return
    }

    setLoading(true)
    setError("")

    try {
      await apiFetch("/ajustes-inventario", {
        method: "POST",
        body: JSON.stringify({
          lote_id: lote.id,
          cantidad_ajustada: cantNum,
          tipo_ajuste: esAgregar ? "CONTEO_SOBRANTE" : tipoAjuste,
          justificacion: justificacion || undefined
        })
      })
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
            Ajuste de inventario
          </DialogTitle>
          <DialogDescription>
            {esAgregar
              ? "Agregar unidades por conteo físico (stock encontrado o corrección hacia arriba)."
              : "Descontar unidades de forma permanente por pérdidas, daños o vencimientos."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-2">
          {error && (
            <div className="flex items-center gap-3 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          {/* Dirección del ajuste */}
          <div className="grid grid-cols-2 gap-1 rounded-sm border border-border p-1">
            <button type="button" onClick={() => setDireccion("quitar")}
              className={cn("flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                !esAgregar ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground")}>
              <Minus className="h-4 w-4" /> Quitar (merma)
            </button>
            <button type="button" onClick={() => setDireccion("agregar")}
              className={cn("flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                esAgregar ? "bg-success/10 text-success" : "text-muted-foreground hover:text-foreground")}>
              <Plus className="h-4 w-4" /> Agregar (conteo)
            </button>
          </div>

          <div className="rounded-sm border border-border bg-muted/40 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Producto afectado</p>
            <p className="font-semibold text-foreground">{productoNombre}</p>
            <div className="mt-2 flex gap-4 font-mono text-xs text-muted-foreground">
              <span>Lote ID: #{lote.id}</span>
              <span>·</span>
              <span>Stock actual lote: {disponible} uds</span>
            </div>
          </div>

          <div className={esAgregar ? "" : "grid grid-cols-2 gap-4"}>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                {esAgregar ? "Cantidad a agregar" : "Cantidad a descontar"}
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
                <Label className="text-xs font-medium text-muted-foreground">Motivo / concepto</Label>
                <Select value={tipoAjuste} onValueChange={setTipoAjuste}>
                  <SelectTrigger className="h-12 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUEBRADO">Quebrado / roto</SelectItem>
                    <SelectItem value="VENCIDO">Vencido</SelectItem>
                    <SelectItem value="ROBO">Robo / pérdida</SelectItem>
                    <SelectItem value="CONTEO">Ajuste de conteo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">Justificación adicional (opcional)</Label>
            <Input
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              placeholder={esAgregar ? "Ej: Conteo físico de inventario" : "Ej: Se cayó de la estantería…"}
              className="h-12"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}
              className={cn("gap-2", esAgregar
                ? "bg-success text-success-foreground hover:bg-success/90"
                : "bg-warning text-warning-foreground hover:bg-warning/90")}>
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : esAgregar ? "Agregar stock" : "Confirmar merma"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
