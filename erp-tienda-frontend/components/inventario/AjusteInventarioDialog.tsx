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
      <DialogContent className="sm:max-w-md bg-black border-zinc-800 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-black text-xl flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Registrar Merma / Ajuste
          </DialogTitle>
          <DialogDescription className="text-zinc-400 font-medium">
            Descontar unidades de forma permanente del inventario debido a pérdidas, daños o vencimientos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="font-bold">{error}</p>
            </div>
          )}

          <div className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800/50">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Producto Afectado</p>
            <p className="font-black text-white">{productoNombre}</p>
            <div className="flex gap-4 mt-2 text-xs font-mono text-zinc-400">
              <span>Lote ID: #{lote.id}</span>
              <span>•</span>
              <span>Stock Actual Lote: {lote.cantidad_disponible} uds</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                Cantidad a Descontar
              </Label>
              <Input
                type="number"
                min="1"
                max={lote.cantidad_disponible}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                required
                className="bg-black/50 border-zinc-800 text-white font-mono text-lg h-12 rounded-xl focus-visible:ring-amber-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                Motivo / Concepto
              </Label>
              <Select value={tipoAjuste} onValueChange={setTipoAjuste}>
                <SelectTrigger className="bg-black/50 border-zinc-800 text-white h-12 rounded-xl focus:ring-amber-500 font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white font-bold">
                  <SelectItem value="QUEBRADO">Quebrado / Roto</SelectItem>
                  <SelectItem value="VENCIDO">Vencido</SelectItem>
                  <SelectItem value="ROBO">Robo / Pérdida</SelectItem>
                  <SelectItem value="CONTEO">Ajuste de Conteo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Justificación Adicional (Opcional)
            </Label>
            <Input
              value={justificacion}
              onChange={(e) => setJustificacion(e.target.value)}
              placeholder="Ej: Se cayó de la estantería..."
              className="bg-black/50 border-zinc-800 text-white h-12 rounded-xl focus-visible:ring-amber-500 placeholder:text-zinc-600"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button
              type="button"
              className="bg-zinc-800 text-white hover:bg-zinc-700 rounded-xl h-11 px-6 font-bold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl h-11 px-6 shadow-lg shadow-amber-900/20"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin mx-8" /> : "Confirmar e Inhabilitar Stock"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
