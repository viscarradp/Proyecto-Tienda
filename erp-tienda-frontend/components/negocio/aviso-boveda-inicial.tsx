"use client"

import { useEffect, useState } from "react"
import { Check, Loader2, Vault } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CampoError } from "@/components/campo-error"
import { SeccionTitulo } from "@/components/seccion-titulo"
import { formatMoney } from "@/lib/format"
import { apiFetch } from "@/lib/api"
import { BOVEDA } from "@/lib/glosario"

const CLAVE_OCULTO = "negocio.avisoBovedaInicialOculto"

/**
 * Asistente de bóveda inicial (NEG-12): crea el INGRESO_CAPITAL de arranque con el mismo
 * endpoint de inyección. La página solo lo monta mientras la bóveda no tiene movimientos.
 * "Ahora no" lo oculta y lo recuerda en localStorage (DUE-29).
 */
export function AvisoBovedaInicial({ onGuardada }: { onGuardada: () => Promise<void> | void }) {
  // null = todavía no se sabe (evita parpadear antes de leer localStorage)
  const [oculto, setOculto] = useState<boolean | null>(null)
  const [monto, setMonto] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let guardado = false
    try {
      guardado = window.localStorage.getItem(CLAVE_OCULTO) === "1"
    } catch {
      // sin localStorage: el aviso se muestra y se oculta solo en esta visita
    }
    setOculto(guardado)
  }, [])

  const ocultar = () => {
    try {
      window.localStorage.setItem(CLAVE_OCULTO, "1")
    } catch {
      // sin localStorage: se oculta solo en esta visita
    }
    setOculto(true)
  }

  const guardar = async () => {
    const valor = parseFloat(monto)
    if (isNaN(valor) || valor <= 0) {
      setError("Escribe un monto mayor a $0")
      return
    }
    setError(null)
    setCargando(true)
    try {
      await apiFetch("/caja-general/inyeccion", {
        method: "POST",
        body: JSON.stringify({
          monto: valor,
          descripcion: "Efectivo guardado al empezar a usar el sistema",
        }),
      })
      toast.success(`Listo: la ${BOVEDA.toLowerCase()} empieza con ${formatMoney(valor)}`)
      setMonto("")
      await onGuardada()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo.")
    } finally {
      setCargando(false)
    }
  }

  if (oculto !== false) return null

  return (
    <div className="rounded-sm border border-primary/30 bg-primary/5 p-4">
      <SeccionTitulo
        icono={Vault}
        ayuda={
          <>
            Así la {BOVEDA.toLowerCase()} empieza con lo que de verdad tienes y los pagos desde ella cuadran. Si no
            tienes nada guardado, toca «Ahora no».
          </>
        }
      >
        ¿Cuánto efectivo tienes guardado fuera de la gaveta hoy?
      </SeccionTitulo>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={0.01}
          step="0.01"
          inputMode="decimal"
          value={monto}
          onChange={(e) => {
            setMonto(e.target.value)
            setError(null)
          }}
          placeholder="0.00"
          aria-label="Efectivo guardado"
          className="w-40 font-mono"
          aria-invalid={!!error}
          aria-describedby={error ? "boveda-inicial-error" : undefined}
        />
        <Button onClick={guardar} disabled={cargando || !monto} className="gap-2">
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {monto ? "Guardar" : "Escribe cuánto"}
        </Button>
        <Button variant="outline" onClick={ocultar} disabled={cargando}>
          Ahora no
        </Button>
      </div>
      {error && (
        <CampoError id="boveda-inicial-error" className="mt-2">
          {error}
        </CampoError>
      )}
    </div>
  )
}
