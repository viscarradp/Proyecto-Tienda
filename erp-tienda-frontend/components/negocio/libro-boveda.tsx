"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/components/money-value"
import { StatePill } from "@/components/state-pill"
import { apiFetch } from "@/lib/api"
import { formatFecha } from "@/lib/format"
import { BOVEDA, mensajeError } from "@/lib/glosario"
import { rotuloMovimiento } from "@/lib/rotulo-movimiento"

interface MovimientoLibro {
  id: number
  tipo_movimiento: string
  monto: string
  fecha: string | null
  usuario_id: number | null
  cuenta_origen: string | null
  cuenta_destino: string | null
  anulado?: boolean
}

const PASO = 10

/**
 * "Ver movimientos de la bóveda" (DUE-24): el libro de `GET /caja-general` (solo la dueña),
 * plegado y cargado al abrirlo. `refreshKey` cambia cuando la página recarga: si está abierto, se actualiza.
 */
export function LibroBoveda({ refreshKey }: { refreshKey: number }) {
  const [abierto, setAbierto] = useState(false)
  const [movs, setMovs] = useState<MovimientoLibro[] | null>(null)
  const [autores, setAutores] = useState<Record<number, string>>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibles, setVisibles] = useState(PASO)
  const idContenido = useId()
  const cargaRef = useRef(0)

  useEffect(() => {
    if (!abierto) return
    const carga = ++cargaRef.current
    setCargando(true)
    setError(null)
    ;(async () => {
      try {
        const [libro, usuarios] = await Promise.all([
          apiFetch<MovimientoLibro[]>("/caja-general"),
          // Solo para mostrar el nombre del autor; si falla se muestra sin nombre.
          apiFetch<{ id: number; nombre: string }[]>("/usuarios").catch(() => []),
        ])
        if (carga !== cargaRef.current) return
        setMovs(libro)
        setAutores(Object.fromEntries(usuarios.map((u) => [u.id, u.nombre])))
      } catch (err) {
        if (carga !== cargaRef.current) return
        setError(
          mensajeError(`cargar los movimientos de la ${BOVEDA.toLowerCase()}`, err, "Intenta de nuevo en un momento."),
        )
      } finally {
        if (carga === cargaRef.current) setCargando(false)
      }
    })()
  }, [abierto, refreshKey])

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <Button
        variant="outline"
        size="sm"
        aria-expanded={abierto}
        aria-controls={idContenido}
        onClick={() => setAbierto((v) => !v)}
        className="gap-1.5"
      >
        {abierto
          ? `Ocultar movimientos de la ${BOVEDA.toLowerCase()}`
          : `Ver movimientos de la ${BOVEDA.toLowerCase()}`}
        <ChevronDown aria-hidden="true" className={cn("transition-transform", abierto && "rotate-180")} />
      </Button>
      <div id={idContenido} hidden={!abierto} aria-busy={cargando} className="mt-3">
        {abierto && (
          <>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {cargando && !movs && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Cargando…
              </p>
            )}
            {movs && movs.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay movimientos en la {BOVEDA.toLowerCase()}.</p>
            )}
            {movs && movs.length > 0 && (
              <div className={cn("transition-opacity duration-200", cargando && "opacity-50")}>
                <ul className="flex flex-col">
                  {movs.slice(0, visibles).map((m) => {
                    const entra = m.cuenta_destino === "BOVEDA"
                    const sale = m.cuenta_origen === "BOVEDA"
                    const signo = entra ? "+ " : sale ? "− " : ""
                    const autor = m.usuario_id != null ? autores[m.usuario_id] : undefined
                    return (
                      <li
                        key={m.id}
                        className="flex items-start justify-between gap-3 border-b border-border/60 py-2.5 text-sm last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">
                            {rotuloMovimiento(m)}
                            {m.anulado && (
                              <StatePill tone="muted" className="ml-2">
                                anulado
                              </StatePill>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFecha(m.fecha, "con hora")}
                            {autor ? ` · ${autor}` : ""}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-sm font-medium tabular-nums",
                            m.anulado
                              ? "text-muted-foreground line-through"
                              : entra
                                ? "text-success"
                                : "text-foreground",
                          )}
                        >
                          {signo}
                          <MoneyValue value={m.monto} className="text-inherit" />
                        </span>
                      </li>
                    )
                  })}
                </ul>
                {movs.length > visibles && (
                  <Button variant="ghost" size="sm" onClick={() => setVisibles((v) => v + PASO)} className="mt-1">
                    Ver más ({movs.length - visibles} restantes)
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
