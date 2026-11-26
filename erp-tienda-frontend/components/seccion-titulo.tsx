import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Título de sección (VIS-10). Siempre un `h2` en `text-sm font-semibold
 * text-foreground`; la ayuda va debajo en `text-xs` gris. Úsalo en lugar de
 * los títulos sueltos (h3, grises, `font-semibold` a secas).
 */
export function SeccionTitulo({
  children,
  icono: Icono,
  ayuda,
  className,
}: {
  children: React.ReactNode
  icono?: LucideIcon
  ayuda?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {Icono && <Icono aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />}
        {children}
      </h2>
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  )
}
