import * as React from "react"

import { cn } from "@/lib/utils"
import { formatMoney } from "@/lib/format"

type MoneyTone = "default" | "success" | "destructive" | "muted"

const toneClass: Record<MoneyTone, string> = {
  default: "text-foreground",
  success: "text-success",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
}

/**
 * Muestra un monto en fuente mono con cifras tabulares para lectura/comparación
 * rápida en un POS (§5.3 de las specs). `tone` aplica color semántico.
 */
export function MoneyValue({
  value,
  tone = "default",
  className,
}: {
  value: number | string
  tone?: MoneyTone
  className?: string
}) {
  return (
    <span className={cn("font-mono tabular-nums", toneClass[tone], className)}>
      {formatMoney(value)}
    </span>
  )
}
