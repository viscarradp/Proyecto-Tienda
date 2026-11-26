import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type StatTone = "default" | "success" | "warning" | "destructive" | "primary" | "muted"

const toneText: Record<StatTone, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning-text",
  destructive: "text-destructive",
  primary: "text-primary",
  muted: "text-muted-foreground",
}

/**
 * Tarjeta de cifra única (VIS-11). Sustituye a StatCard/KPICard/BalanceItem.
 *
 * - `size="lg"`: tarjeta con `p-4`, cifra `text-xl` (equivale a KPICard).
 * - `size="md"`: tarjeta compacta `p-3`, cifra `text-base` (equivale a BalanceItem).
 * - `tone`: color del icono y de la cifra cuando se usa `value`. Sigue la regla
 *   de color de globals.css (por defecto, un dato normal no lleva color).
 * - `value`: la cifra como texto. Si necesitas MoneyValue, StatePill, etc.,
 *   pásalos como children (así se usaba antes).
 * - `hint`: línea de ayuda gris bajo la cifra (`footer` es un alias).
 * La etiqueta va sin mayúsculas forzadas. Sin `size` ni `value`, funciona como antes.
 */
export function StatCard({
  label,
  icon: Icon,
  children,
  value,
  hint,
  footer,
  size = "lg",
  tone = "default",
  className,
}: {
  label: string
  icon?: LucideIcon
  children?: React.ReactNode
  value?: React.ReactNode
  hint?: React.ReactNode
  footer?: React.ReactNode
  size?: "md" | "lg"
  tone?: StatTone
  className?: string
}) {
  const ayuda = hint ?? footer
  return (
    <div
      className={cn(
        "flex flex-col rounded-sm border border-border bg-card",
        size === "lg" ? "p-4" : "p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn(
              "shrink-0",
              size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5",
              toneText[tone === "default" ? "muted" : tone],
            )}
          />
        )}
      </div>
      {value !== undefined && (
        <p
          className={cn(
            "mt-2 font-mono font-bold tracking-tight tabular-nums",
            size === "lg" ? "text-xl" : "text-base",
            toneText[tone],
          )}
        >
          {value}
        </p>
      )}
      {children !== undefined && <div className="mt-2">{children}</div>}
      {ayuda && <div className="mt-1 text-xs text-muted-foreground">{ayuda}</div>}
    </div>
  )
}
