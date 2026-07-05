import * as React from "react"
import { Loader2, AlertTriangle, AlertCircle } from "lucide-react"

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

export function AjusteInventarioDialog({
  open,
  onClose,
  onSuccess,
  lote,
  productoNombre
}: AjusteInventarioDialogProps) {
  const [cantidad, setCantidad] = React.useState("1")
  const [tipoAjuste, setTipoAjuste] = React.useState("QUEBRADO")
  const [justificacion, setJustificacion] = React.useState("")

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setCantidad("1")
      setTipoAjuste("QUEBRADO")
      setJustificacion("")
      setError("")
    }
  }, [open])

  if (!lote) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cantNum = parseInt(cantidad, 10)

    if (isNaN(cantNum) || cantNum < 1 || cantNum > lote.cantidad_disponible) {
      setError("Cantidad inválida. No puede ser mayor al stock disponible de este lote.")
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
          tipo_ajuste: tipoAjuste,
          justificacion: justificacion || undefined
        })
      })
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la merma")
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
            Registrar merma / ajuste
          </DialogTitle>
          <DialogDescription>
            Descontar unidades de forma permanente del inventario debido a pérdidas, daños o vencimientos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-2">
          {error && (
            <div className="flex items-center gap-3 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <div className="rounded-sm border border-border bg-muted/40 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Producto afectado</p>
            <p className="font-semibold text-foreground">{productoNombre}</p>
            <div className="mt-2 flex gap-4 font-mono text-xs text-muted-foreground">
              <span>Lote ID: #{lote.id}</span>
              <span>·</span>
              <span>Stock actual lote: {lote.cantidad_disponible} uds</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Cantidad a descontar</Label>
              <Input
                type="number"
                min="1"
                max={lote.cantidad_disponible}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                required
                className="h-12 font-mono text-lg"
              />
            </div>
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
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">Justificación adicional (opcional)</Label>
            <Input
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              placeholder="Ej: Se cayó de la estantería…"
              className="h-12"
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 bg-warning text-warning-foreground hover:bg-warning/90">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirmar e inhabilitar stock"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
