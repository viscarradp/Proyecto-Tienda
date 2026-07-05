import * as React from "react"

import { cn } from "@/lib/utils"

type PillTone = "success" | "warning" | "destructive" | "muted" | "primary"

const toneClass: Record<PillTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
}

/**
 * Píldora de estado (stock, caja, pago…). Es de los pocos lugares donde
 * `rounded-full` está permitido por la regla de radios (§5.2 specs).
 */
export function StatePill({
  tone = "muted",
  className,
  children,
}: {
  tone?: PillTone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
