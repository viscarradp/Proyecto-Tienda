import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Tarjeta de métrica sobria (sin glows). Reutilizada en Movimientos, Gastos y
 * Estadísticas. El contenido (valor/cifra) se pasa como children para permitir
 * MoneyValue, StatePill, etc.
 */
export function StatCard({
  label,
  icon: Icon,
  children,
  footer,
  className,
}: {
  label: string
  icon?: LucideIcon
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col rounded-sm border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </div>
      <div className="mt-2">{children}</div>
      {footer && <div className="mt-1 text-xs text-muted-foreground">{footer}</div>}
    </div>
  )
}
