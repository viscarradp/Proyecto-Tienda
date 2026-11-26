"use client"

import * as React from "react"
import { useId, useState } from "react"
import type { LucideIcon } from "lucide-react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { SeccionTitulo } from "@/components/seccion-titulo"

/**
 * Bloque con título y un botón que muestra u oculta el detalle (cerrado por defecto).
 * El botón usa `aria-expanded`/`aria-controls`; mide 44 px en el celular (Button).
 */
export function Plegable({
  titulo,
  icono,
  ayuda,
  verTexto = "Ver el detalle",
  ocultarTexto = "Ocultar el detalle",
  children,
}: {
  titulo: React.ReactNode
  icono?: LucideIcon
  ayuda?: React.ReactNode
  verTexto?: string
  ocultarTexto?: string
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const idContenido = useId()
  return (
    <section className="rounded-sm border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SeccionTitulo icono={icono} ayuda={ayuda}>
          {titulo}
        </SeccionTitulo>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={abierto}
          aria-controls={idContenido}
          onClick={() => setAbierto((v) => !v)}
          className="shrink-0 gap-1.5 self-start"
        >
          {abierto ? ocultarTexto : verTexto}
          <ChevronDown aria-hidden="true" className={cn("transition-transform", abierto && "rotate-180")} />
        </Button>
      </div>
      <div id={idContenido} hidden={!abierto} className="mt-4">
        {abierto && children}
      </div>
    </section>
  )
}
