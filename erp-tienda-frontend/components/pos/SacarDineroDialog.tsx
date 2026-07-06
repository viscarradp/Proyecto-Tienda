"use client"

import * as React from "react"
import { Vault, Receipt, HandCoins, Loader2, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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

interface CategoriaGasto {
  id: number
  nombre: string
}

type Modo = "boveda" | "gasto" | "retiro"

const OPCIONES: { modo: Modo; label: string; desc: string; icon: LucideIcon }[] = [
  {
    modo: "boveda",
    label: "Guardar en bóveda",
    desc: "Trasladar efectivo de la gaveta a la bóveda",
    icon: Vault,
  },
  {
    modo: "gasto",
    label: "Pagar algo",
    desc: "Registrar un gasto pagado desde la gaveta",
    icon: Receipt,
  },
  {
    modo: "retiro",
    label: "Retiro personal",
    desc: "Dinero que toma la dueña (no es gasto del negocio)",
    icon: HandCoins,
  },
]

/**
 * "Sacar dinero" de la gaveta (Bloque 1.D §5.4). Un solo botón con tres
 * opciones que traducen la intención a los asientos correctos por detrás:
 * bóveda (RETIRO_BOVEDA), gasto (EGRESO_OPERATIVO) o retiro personal
 * (RETIRO_PERSONAL). Todas requieren un turno abierto (salen de la gaveta).
 */
export function SacarDineroDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: () => void
}) {
  const [modo, setModo] = React.useState<Modo | null>(null)
  const [monto, setMonto] = React.useState("")
  const [descripcion, setDescripcion] = React.useState("")
  const [categoriaId, setCategoriaId] = React.useState("")
  const [categorias, setCategorias] = React.useState<CategoriaGasto[]>([])
  const [loading, setLoading] = React.useState(false)

  const reset = () => {
    setModo(null)
    setMonto("")
    setDescripcion("")
    setCategoriaId("")
  }

  // Carga las categorías solo cuando hacen falta (opción "Pagar algo").
  React.useEffect(() => {
    if (open && modo === "gasto" && categorias.length === 0) {
      apiFetch<CategoriaGasto[]>("/categorias-gastos")
        .then(setCategorias)
        .catch(() => {})
    }
  }, [open, modo, categorias.length])

  const handleOpenChange = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const m = parseFloat(monto)
    if (isNaN(m) || m <= 0) {
      toast.error("Ingresa un monto válido")
      return
    }
    if (modo === "gasto" && !categoriaId) {
      toast.error("Selecciona una categoría de gasto")
      return
    }

    const body =
      modo === "boveda"
        ? {
            tipo_movimiento: "RETIRO_BOVEDA",
            monto: m,
            descripcion: descripcion.trim() || "Traslado a bóveda",
          }
        : modo === "retiro"
          ? {
              tipo_movimiento: "RETIRO_PERSONAL",
              monto: m,
              descripcion: descripcion.trim() || "Retiro personal de la dueña",
            }
          : {
              tipo_movimiento: "EGRESO_OPERATIVO",
              monto: m,
              descripcion: descripcion.trim() || "Gasto",
              categoria_gasto_id: parseInt(categoriaId),
              origen_fondos: "GAVETA",
            }

    setLoading(true)
    try {
      await apiFetch("/movimientos-financieros", {
        method: "POST",
        body: JSON.stringify(body),
      })
      toast.success("Movimiento registrado")
      reset()
      onOpenChange(false)
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al registrar el movimiento")
    } finally {
      setLoading(false)
    }
  }

  const opcion = OPCIONES.find((o) => o.modo === modo)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{opcion ? opcion.label : "Sacar dinero"}</DialogTitle>
          {!modo && (
            <DialogDescription>¿Qué querés hacer con el efectivo de la gaveta?</DialogDescription>
          )}
        </DialogHeader>

        {!modo ? (
          <div className="flex flex-col gap-2">
            {OPCIONES.map((o) => (
              <button
                key={o.modo}
                type="button"
                onClick={() => setModo(o.modo)}
                className="flex items-center gap-3 rounded-sm border border-border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
                  <o.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Monto ($)</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0.00"
                autoFocus
                className="h-12 text-center font-mono text-xl font-bold tabular-nums"
              />
            </div>

            {modo === "gasto" && (
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Categoría</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId} required>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Selecciona una categoría…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Descripción {modo === "retiro" ? "(opcional)" : ""}
              </Label>
              <Input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder={modo === "gasto" ? "Ej. Pago de agua" : "Nota opcional"}
                className="h-11"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setModo(null)}>
                Atrás
              </Button>
              <Button type="submit" disabled={loading} className="gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
