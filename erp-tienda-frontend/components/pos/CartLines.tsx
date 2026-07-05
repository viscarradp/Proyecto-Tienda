"use client"

import { Minus, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/components/money-value"
import type { CartItem } from "@/src/store/cartStore"

/**
 * Líneas del ticket con control de cantidad. Presentacional: recibe los items y
 * los handlers del cartStore. Se reutiliza en el panel de escritorio y en el
 * bottom-sheet del carrito en móvil.
 */
export function CartLines({
  items,
  updateQuantity,
  removeItem,
  className,
}: {
  items: CartItem[]
  updateQuantity: (id: string, cantidad: number) => void
  removeItem: (id: string) => void
  className?: string
}) {
  return (
    <ul className={cn("flex flex-col divide-y divide-border", className)}>
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-2 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {item.producto_nombre || item.nombre}
              </p>
              {item.presentacion_nombre && (
                <p className="truncate text-xs text-muted-foreground">{item.presentacion_nombre}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              aria-label="Quitar del ticket"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center rounded-sm border border-border">
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-none"
                aria-label="Restar uno"
                onClick={() => updateQuantity(item.id, item.cantidad - 1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-10 text-center font-mono text-sm font-semibold tabular-nums text-foreground">
                {item.cantidad}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-none text-primary"
                aria-label="Sumar uno"
                onClick={() => updateQuantity(item.id, item.cantidad + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-col items-end leading-tight">
              <MoneyValue value={item.precio * item.cantidad} className="text-sm font-semibold" />
              <span className="text-xs text-muted-foreground">
                <MoneyValue value={item.precio} className="text-xs text-muted-foreground" /> c/u
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
