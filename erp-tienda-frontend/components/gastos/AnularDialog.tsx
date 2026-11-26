'use client'

import * as React from "react"
import { Loader2, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api"
import { mensajeError } from "@/lib/glosario"
import { CampoError } from "@/components/campo-error"

/** Qué se va a anular y qué va a pasar (lo muestra la confirmación). */
export interface AnularObjetivo {
  /** Ruta del PATCH, p. ej. `/compras/12/anular`. */
  endpoint: string
  titulo: string
  /** Efecto en palabras de tienda: "Se devolverán $5.00 a la gaveta y el gasto dejará de contar". */
  efecto: string
}

/**
 * Confirmación para anular un registro (L12, ADR 0012): anular marca, nunca
 * borra. Pide el motivo (obligatorio), dice qué va a pasar y llama al PATCH.
 * Solo la dueña ve el botón que la abre; el backend lo vuelve a exigir.
 */
export function AnularDialog({
  objetivo,
  onClose,
  onHecho,
}: {
  objetivo: AnularObjetivo | null
  onClose: () => void
  onHecho: () => void
}) {
  const [motivo, setMotivo] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)
  const [error, setError] = React.useState("")

  // Cada vez que se abre para otro registro, el formulario arranca limpio.
  React.useEffect(() => {
    if (objetivo) {
      setMotivo("")
      setError("")
    }
  }, [objetivo])

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!objetivo) return
    const texto = motivo.trim()
    if (!texto) {
      setError("Escribe el motivo de la anulación.")
      return
    }
    setEnviando(true)
    setError("")
    try {
      const resp = await apiFetch<{ avisos?: string[] }>(objetivo.endpoint, {
        method: "PATCH",
        body: JSON.stringify({ motivo: texto }),
      })
      toast.success("Anulado. El registro queda marcado, no se borra.")
      for (const aviso of resp.avisos ?? []) {
        toast.warning(aviso, { duration: 12000 })
      }
      onHecho()
      onClose()
    } catch (err: unknown) {
      setError(mensajeError("anular", err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={objetivo !== null} onOpenChange={(abierto) => { if (!abierto && !enviando) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Undo2 className="h-5 w-5" /> {objetivo?.titulo}
          </DialogTitle>
          <DialogDescription>{objetivo?.efecto}</DialogDescription>
        </DialogHeader>
        <form onSubmit={confirmar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="anulardialog-motivo-obligatorio" className="text-xs font-medium text-muted-foreground">Motivo (obligatorio)</Label>
            <Input id="anulardialog-motivo-obligatorio"
              required
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              placeholder="Ej. Me equivoqué en el monto"
              aria-invalid={!!error}
              aria-describedby={error ? "anulardialog-motivo-error" : undefined}
              autoFocus
            />
            {error && <CampoError id="anulardialog-motivo-error">{error}</CampoError>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" variant="destructive-solid" disabled={enviando || !motivo.trim()} className="gap-2">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              {motivo.trim() ? "Anular" : "Escribe el motivo para anular"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Anulado: motivo — quién" (se muestra bajo el registro tachado). */
export function AnuladoNota({
  motivo,
  quien,
}: {
  motivo?: string | null
  quien?: string | null
}) {
  return (
    <p className="mt-0.5 text-xs font-medium text-destructive">
      Anulado{motivo ? `: ${motivo}` : ""}{quien ? ` — ${quien}` : ""}
    </p>
  )
}
