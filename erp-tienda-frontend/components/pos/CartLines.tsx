"use client"

import * as React from "react"
import { Minus, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/components/money-value"
import { centavosAMonto, formatCantidad, parseDecimal } from "@/lib/format"
import { totalItemCentavos, type CartItem } from "@/src/store/cartStore"

const ATAJOS: { valor: number; etiqueta: string }[] = [
  { valor: 0.5, etiqueta: "½" },
  { valor: 1, etiqueta: "1" },
  { valor: 1.5, etiqueta: "1½" },
]

const MONTO_MAX = 999999.99

/**
 * Campo de texto numérico con borrador local: deja escribir "0." o "1,5" sin
 * pelear con el valor guardado. Solo confirma valores válidos; al salir del
 * campo vuelve a mostrar el valor real de la línea.
 */
function CampoNumero({
  valor,
  decimales,
  onCommit,
  ariaLabel,
  className,
}: {
  valor: string
  decimales: number
  onCommit: (n: number) => void
  ariaLabel: string
  className?: string
}) {
  const [borrador, setBorrador] = React.useState<string | null>(null)
  const patron = React.useMemo(() => new RegExp(`^\\d*[.,]?\\d{0,${decimales}}$`), [decimales])

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={borrador ?? valor}
      onFocus={(e) => {
        setBorrador(valor)
        e.currentTarget.select()
      }}
      onBlur={() => setBorrador(null)}
      onChange={(e) => {
        const texto = e.target.value
        if (!patron.test(texto)) return
        setBorrador(texto)
        const n = parseDecimal(texto)
        if (n !== null && n > 0) onCommit(n)
      }}
      className={cn(
        "h-11 min-w-0 rounded-none border-0 bg-transparent text-center font-mono text-sm font-semibold tabular-nums text-foreground outline-none focus:bg-muted/50",
        className,
      )}
    />
  )
}

/**
 * Líneas del ticket con control de cantidad. Presentacional: recibe los items y
 * los handlers del cartStore. Se reutiliza en el panel de escritorio y en el
 * bottom-sheet del carrito en móvil.
 */
export function CartLines({
  items,
  updateQuantity,
  setMonto,
  quitarMonto,
  removeItem,
  className,
}: {
  items: CartItem[]
  updateQuantity: (id: string, cantidad: number) => void
  setMonto: (id: string, monto: number) => void
  quitarMonto: (id: string) => void
  removeItem: (id: string) => void
  className?: string
}) {
  return (
    <ul className={cn("flex flex-col divide-y divide-border", className)}>
      {items.map((item) => {
        const porMonto = item.modo === "monto" && item.monto !== undefined
        const totalLinea = centavosAMonto(totalItemCentavos(item))
        const unidad = item.presentacion_nombre?.toLowerCase()
        return (
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
                aria-label={`Quitar ${item.producto_nombre || item.nombre} del ticket`}
                className="flex size-11 md:size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              {porMonto ? (
                <div className="flex items-center rounded-sm border border-primary/40">
                  <span className="pl-3 font-mono text-sm text-muted-foreground">$</span>
                  <CampoNumero
                    ariaLabel="Monto en dólares"
                    valor={(item.monto ?? 0).toFixed(2)}
                    decimales={2}
                    onCommit={(n) => setMonto(item.id, Math.min(n, MONTO_MAX))}
                    className="w-20 text-left"
                  />
                </div>
              ) : (
                <div className="flex items-center rounded-sm border border-border">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-11 rounded-none"
                    aria-label="Restar uno"
                    onClick={() => updateQuantity(item.id, item.cantidad - 1)}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <CampoNumero
                    ariaLabel="Cantidad"
                    valor={formatCantidad(item.cantidad)}
                    decimales={3}
                    onCommit={(n) => updateQuantity(item.id, n)}
                    className="w-16"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 md:size-11 rounded-none text-primary"
                    aria-label="Sumar uno"
                    onClick={() => updateQuantity(item.id, item.cantidad + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex flex-col items-end leading-tight">
                <MoneyValue value={totalLinea} className="text-sm font-semibold" />
                {porMonto ? (
                  <span className="text-xs text-muted-foreground">
                    ≈ {formatCantidad(item.cantidad)} {unidad || "uds"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    <MoneyValue value={item.precio} className="text-xs text-muted-foreground" /> c/u
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              {porMonto ? (
                <span className="text-xs text-muted-foreground">Vendido por monto</span>
              ) : (
                <div className="flex items-center gap-1.5" role="group" aria-label="Cantidades rápidas">
                  {ATAJOS.map((a) => (
                    <button
                      key={a.valor}
                      type="button"
                      onClick={() => updateQuantity(item.id, a.valor)}
                      aria-pressed={item.cantidad === a.valor}
                      className={cn(
                        "h-11 md:h-9 min-w-11 md:min-w-10 rounded-sm border px-2 text-sm font-medium transition-colors",
                        item.cantidad === a.valor
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {a.etiqueta}
                    </button>
                  ))}
                </div>
              )}
              {porMonto ? (
                <button
                  type="button"
                  onClick={() => quitarMonto(item.id)}
                  className="h-11 md:h-9 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  Vender por cantidad
                </button>
              ) : item.precio > 0 ? (
                <button
                  type="button"
                  onClick={() => setMonto(item.id, Math.min(Math.max(totalLinea, 0.01), MONTO_MAX))}
                  className="h-11 md:h-9 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  Vender por monto ($)
                </button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
