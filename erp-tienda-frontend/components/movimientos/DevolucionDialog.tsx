"use client"

import * as React from "react"
import { RefreshCw, Undo2, PackageCheck, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyValue } from "@/components/money-value"
import { formatMoney } from "@/lib/format"
import { apiFetch } from "@/lib/api"

interface DetalleVenta {
  id: number
  cantidad: number
  subtotal: string
  presentaciones?: { descripcion: string }
  presentacion_id: number
}
interface Venta {
  id: number
  detalle_ventas: DetalleVenta[]
}

type Destino = "REINGRESO" | "MERMA"
interface LineaEstado {
  cantidad: string
  destino: Destino
}

/**
 * Diálogo de devolución de cliente (Bloque 3.B, ítem 13). Ligada a la venta
 * original: por cada línea se elige cuánto devolver y su destino (reingresar al
 * stock / merma). El reembolso sale de la caja actual. Backend valida el tope.
 */
export function DevolucionDialog({
  venta,
  open,
  onOpenChange,
  onDone,
}: {
  venta: Venta | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const [lineas, setLineas] = React.useState<Record<number, LineaEstado>>({})
  const [justif, setJustif] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (venta) {
      const init: Record<number, LineaEstado> = {}
      venta.detalle_ventas.forEach((d) => {
        init[d.id] = { cantidad: "", destino: "REINGRESO" }
      })
      setLineas(init)
      setJustif("")
      setError("")
    }
  }, [venta])

  if (!venta) return null

  const setLinea = (id: number, patch: Partial<LineaEstado>) =>
    setLineas((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const precioUnit = (d: DetalleVenta) => parseFloat(d.subtotal) / d.cantidad

  const totalReembolso = venta.detalle_ventas.reduce((acc, d) => {
    const c = parseFloat(lineas[d.id]?.cantidad || "0")
    return c > 0 ? acc + precioUnit(d) * c : acc
  }, 0)

  const hayAlgo = venta.detalle_ventas.some(
    (d) => parseFloat(lineas[d.id]?.cantidad || "0") > 0,
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const detalles = venta.detalle_ventas
      .filter((d) => parseFloat(lineas[d.id]?.cantidad || "0") > 0)
      .map((d) => ({
        detalle_venta_id: d.id,
        cantidad: parseFloat(lineas[d.id].cantidad),
        destino: lineas[d.id].destino,
      }))
    if (detalles.length === 0) return

    setLoading(true)
    setError("")
    try {
      await apiFetch(`/ventas/${venta.id}/devolucion`, {
        method: "POST",
        body: JSON.stringify({
          detalles,
          justificacion: justif.trim() || undefined,
        }),
      })
      onDone()
      onOpenChange(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la devolución")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Undo2 className="h-5 w-5" /> Devolver venta #{venta.id}
          </DialogTitle>
          <DialogDescription>
            Elige cuánto devolver de cada artículo y su destino. El reembolso sale de la{" "}
            <strong className="text-foreground">caja abierta actual</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
            {venta.detalle_ventas.map((d) => {
              const linea = lineas[d.id] ?? { cantidad: "", destino: "REINGRESO" as Destino }
              return (
                <div key={d.id} className="rounded-sm border border-border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {d.presentaciones?.descripcion || `Presentación #${d.presentacion_id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vendidas {d.cantidad} ·{" "}
                        <MoneyValue value={precioUnit(d)} tone="muted" className="text-xs" /> c/u
                      </p>
                    </div>
                    <div className="w-24 shrink-0">
                      <Label className="sr-only">Cantidad a devolver</Label>
                      <Input
                        type="number"
                        min={0}
                        max={d.cantidad}
                        step="0.001"
                        inputMode="decimal"
                        placeholder="0"
                        value={linea.cantidad}
                        onChange={(e) => setLinea(d.id, { cantidad: e.target.value })}
                        className="h-10 text-center font-mono tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1 rounded-sm border border-border bg-muted/40 p-1">
                    {(
                      [
                        { key: "REINGRESO" as Destino, label: "Reingresar", icon: PackageCheck },
                        { key: "MERMA" as Destino, label: "Merma", icon: Trash2 },
                      ]
                    ).map(({ key, label, icon: Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setLinea(d.id, { destino: key })}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium transition-colors",
                          linea.destino === key
                            ? key === "MERMA"
                              ? "bg-destructive text-destructive-foreground"
                              : "bg-success text-success-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Justificación (opcional)
            </Label>
            <Input
              value={justif}
              onChange={(e) => setJustif(e.target.value)}
              placeholder="Ej. Producto vencido / cliente cambió de opinión"
              className="h-11"
            />
          </div>

          <div className="flex items-center justify-between rounded-sm border border-primary/30 bg-primary/5 px-3 py-2">
            <span className="text-sm text-muted-foreground">Total a reembolsar</span>
            <span className="font-mono text-lg font-bold tabular-nums text-primary">
              {formatMoney(totalReembolso)}
            </span>
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !hayAlgo} className="gap-2">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Confirmar devolución
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
