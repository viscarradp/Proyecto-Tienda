"use client"

import * as React from "react"
import { DoorOpen, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
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
import { MoneyValue } from "@/components/money-value"
import { apiFetch } from "@/lib/api"
import { centavosAMonto, montoACentavos } from "@/lib/format"

type Origen = "BOVEDA" | "APORTE" | "RETIRO" | "NO_SE"

interface UltimoCierre {
  fondo_siguiente: number | string
  fecha_cierre: string | null
}

/** Turno recién abierto + avisos que devuelve el backend. */
type TurnoAbierto<T> = T & { avisos?: string[] }

/**
 * Abrir turno de caja. Propone como fondo lo que quedó en la gaveta al último
 * cierre (el remanente). Si la cajera escribe otro monto, pregunta de dónde
 * salió (o a dónde fue) la diferencia con opciones de un toque; "No sé" también
 * vale. Nunca bloquea la apertura: la diferencia siempre queda registrada
 * (D-15, ADR 0011).
 */
export function AbrirCajaDialog<T>({
  open,
  onOpenChange,
  onAbierta,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Recibe el turno abierto (sin los avisos, que el diálogo ya muestra). */
  onAbierta: (turno: T) => void
}) {
  const [remanente, setRemanente] = React.useState<number | null>(null)
  const [primerTurno, setPrimerTurno] = React.useState(false)
  const [fondo, setFondo] = React.useState("")
  const [origen, setOrigen] = React.useState<Origen | null>(null)
  const [nota, setNota] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  // Al abrir el diálogo, consulta lo que quedó en la gaveta y lo propone.
  React.useEffect(() => {
    if (!open) return
    let cancelado = false
    setRemanente(null)
    setOrigen(null)
    setNota("")
    setFondo("")
    apiFetch<UltimoCierre>("/cajas-turnos/ultimo-cierre")
      .then((ult) => {
        if (cancelado) return
        const valor = Number(ult.fondo_siguiente) || 0
        setRemanente(valor)
        setPrimerTurno(ult.fecha_cierre === null)
        if (valor > 0) setFondo(valor.toString())
      })
      .catch(() => {
        // Sin remanente conocido no se pregunta nada; el backend igual lo calcula.
        if (!cancelado) setRemanente(null)
      })
    return () => {
      cancelado = true
    }
  }, [open])

  const fondoNum = parseFloat(fondo)
  const fondoValido = !isNaN(fondoNum) && fondoNum >= 0
  const diferenciaCent =
    remanente !== null && fondoValido ? montoACentavos(fondoNum) - montoACentavos(remanente) : 0
  const hayDiferencia = diferenciaCent !== 0
  const sobra = diferenciaCent > 0
  const montoDiferencia = centavosAMonto(Math.abs(diferenciaCent))

  // Al cambiar el sentido de la diferencia, la elección anterior ya no aplica.
  // En el primer turno de la historia se propone "Aporte de la dueña".
  React.useEffect(() => {
    if (!hayDiferencia) {
      setOrigen(null)
    } else if (primerTurno && sobra) {
      setOrigen("APORTE")
    } else {
      setOrigen(null)
    }
  }, [hayDiferencia, sobra, primerTurno])

  const opciones: { valor: Origen; label: string }[] = sobra
    ? [
        { valor: "BOVEDA", label: "Lo saqué de la bóveda" },
        { valor: "APORTE", label: "Dinero que puse yo" },
        { valor: "NO_SE", label: "No sé" },
      ]
    : [
        { valor: "BOVEDA", label: "Lo guardé en la bóveda" },
        { valor: "RETIRO", label: "Lo retiró la dueña" },
        { valor: "NO_SE", label: "No sé" },
      ]

  const handleOpenChange = (v: boolean) => {
    if (loading) return
    onOpenChange(v)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fondoValido) {
      toast.error("Escribe con cuánto empiezas en la gaveta (desde $0)")
      return
    }
    setLoading(true)
    try {
      const turno = await apiFetch<TurnoAbierto<T>>("/cajas-turnos/abrir", {
        method: "POST",
        body: JSON.stringify({
          fondo_inicial: fondoNum,
          ...(hayDiferencia
            ? {
                origen_diferencia: origen ?? "NO_SE",
                nota: nota.trim() || undefined,
              }
            : {}),
        }),
      })
      for (const aviso of turno.avisos ?? []) {
        toast.warning(aviso, { duration: 12000 })
      }
      onAbierta(turno)
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al abrir caja")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DoorOpen className="h-5 w-5 text-success" /> Abrir turno de caja
          </DialogTitle>
          <DialogDescription>
            Cuenta el efectivo que hay en la gaveta y escribe con cuánto empiezas el turno.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {remanente !== null && (
            <div className="flex items-center justify-between rounded-sm border border-border bg-muted/50 p-3 text-xs">
              <span className="text-muted-foreground">
                {primerTurno ? "Aún no hay un turno anterior" : "Lo que quedó en la gaveta al cerrar el turno anterior"}
              </span>
              <MoneyValue value={remanente} className="text-sm font-semibold" />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">Efectivo con el que empiezas en la gaveta ($)</Label>
            <Input
              type="number" min={0} step="0.01" inputMode="decimal" value={fondo}
              onChange={(e) => setFondo(e.target.value)}
              className="h-14 text-center font-mono text-2xl font-bold tabular-nums"
              autoFocus
            />
          </div>

          {hayDiferencia && (
            <div className="flex flex-col gap-3 rounded-sm border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-medium">
                {sobra ? "¿De dónde salió la diferencia de " : "¿A dónde fue la diferencia de "}
                <MoneyValue value={montoDiferencia} className="font-semibold" />?
              </p>
              <div className="flex flex-wrap gap-2">
                {opciones.map((o) => {
                  const activo = (origen ?? "NO_SE") === o.valor
                  return (
                    <Button
                      key={o.valor}
                      type="button"
                      size="sm"
                      variant={activo ? "default" : "outline"}
                      aria-pressed={activo}
                      onClick={() => setOrigen(o.valor)}
                      className={cn("h-9", !activo && "bg-background")}
                    >
                      {o.label}
                    </Button>
                  )
                })}
              </div>
              <Input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={200}
                placeholder="Nota (opcional)"
                className="h-10 bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Puedes abrir de todos modos: la diferencia queda anotada para revisarla después.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-2 bg-success text-success-foreground hover:bg-success/90">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
              Abrir caja
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
