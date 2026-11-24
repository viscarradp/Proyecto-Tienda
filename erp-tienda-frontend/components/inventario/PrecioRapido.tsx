'use client'

import * as React from "react"
import { Loader2, Check, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MoneyValue } from "@/components/money-value"
import { apiFetch } from "@/lib/api"
import { formatMoney, montoACentavos } from "@/lib/format"
import { errorPrecio, MensajeCampo } from "./validacionPresentacion"

interface PrecioRapidoProps {
  presentacionId: number
  /** Nombre para el aviso: «Arroz» o «Arroz (Fardo de 12)». */
  nombre: string
  precio: number | string
  /** Solo la dueña cambia precios; la cajera lo ve sin poder tocarlo. */
  editable: boolean
  onGuardado: () => void
}

/**
 * Precio de una presentación que se cambia en el lugar: tocar el precio →
 * campo → Enter o «Guardar». Usa PATCH /presentaciones/:id (deja historial).
 */
export function PrecioRapido({ presentacionId, nombre, precio, editable, onGuardado }: PrecioRapidoProps) {
  const [editando, setEditando] = React.useState(false)
  const [valor, setValor] = React.useState("")
  const [guardando, setGuardando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!editable) return <MoneyValue value={precio} className="font-semibold" />

  const abrir = () => {
    setValor(String(Number(precio)))
    setError(null)
    setEditando(true)
  }

  const guardar = async () => {
    const problema = errorPrecio(valor)
    if (problema) {
      setError(problema)
      return
    }
    if (montoACentavos(valor) === montoACentavos(precio)) {
      setEditando(false)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await apiFetch(`/presentaciones/${presentacionId}`, {
        method: "PATCH",
        body: JSON.stringify({ precio_venta: Number(valor) }),
      })
      toast.success(`Precio de «${nombre}» cambiado de ${formatMoney(precio)} a ${formatMoney(valor)}`)
      setEditando(false)
      onGuardado()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el precio")
    } finally {
      setGuardando(false)
    }
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); abrir() }}
        title="Tocar para cambiar el precio"
        className="rounded-sm border border-dashed border-border px-2 py-1 font-mono text-sm font-semibold tabular-nums hover:border-primary hover:bg-primary/5"
      >
        {formatMoney(precio)}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          value={valor}
          disabled={guardando}
          onChange={(e) => { setValor(e.target.value); setError(null) }}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); guardar() }
            if (e.key === "Escape") { e.preventDefault(); setEditando(false) }
          }}
          aria-label={`Nuevo precio de ${nombre}`}
          className="h-10 w-28 font-mono text-base"
        />
        <Button type="button" size="sm" className="h-10 gap-1" disabled={guardando} onClick={guardar}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Guardar
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-10 w-10" disabled={guardando}
          onClick={() => setEditando(false)} aria-label="Cancelar">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <MensajeCampo error={error} />
    </div>
  )
}
