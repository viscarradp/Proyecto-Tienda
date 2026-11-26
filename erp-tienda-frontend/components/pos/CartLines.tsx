"use client"

import * as React from "react"
import { Minus, Plus, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/components/money-value"
import { centavosAMonto, formatCantidad, parseDecimal } from "@/lib/format"
import { esPresentacionDePeso } from "@/components/pos/pos-utils"
import { totalItemCentavos, type CartItem } from "@/src/store/cartStore"

const ATAJOS: { valor: number; etiqueta: string }[] = [
  { valor: 0.5, etiqueta: "½" },
  { valor: 1, etiqueta: "1" },
  { valor: 1.5, etiqueta: "1½" },
]

const MONTO_MAX = 999999.99
/** Límite de cantidad del servidor. */
const CANTIDAD_MAX = 99999
const CANTIDAD_MAX_CARACTERES = 7

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
  max,
  maxCaracteres,
}: {
  valor: string
  decimales: number
  onCommit: (n: number) => void
  ariaLabel: string
  className?: string
  /** Valores mayores no se aceptan al escribir (red de seguridad ante escaneos). */
  max?: number
  maxCaracteres?: number
}) {
  const [borrador, setBorrador] = React.useState<string | null>(null)
  const patron = React.useMemo(() => new RegExp(`^\\d*[.,]?\\d{0,${decimales}}$`), [decimales])

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      data-escaner="desviar"
      value={borrador ?? valor}
      onFocus={(e) => {
        setBorrador(valor)
        e.currentTarget.select()
      }}
      onBlur={() => setBorrador(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
      }}
      onChange={(e) => {
        const texto = e.target.value
        if (!patron.test(texto)) return
        if (maxCaracteres !== undefined && texto.length > maxCaracteres) return
        const n = parseDecimal(texto)
        if (max !== undefined && n !== null && n > max) return
        setBorrador(texto)
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
        // Atajos y "vender por monto" solo tienen sentido en peso o medida.
        const conOpciones = porMonto || esPresentacionDePeso(item.presentacion_nombre)
        return (
          <li key={item.id} className="flex flex-col gap-1 py-2">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-tight text-foreground">
                  {item.producto_nombre || item.nombre}
                </p>
                {item.presentacion_nombre && (
                  <p className="truncate text-xs text-muted-foreground">{item.presentacion_nombre}</p>
                )}
              </div>
              {porMonto ? (
                <div className="flex shrink-0 items-center rounded-sm border border-primary/40 focus-within:ring-3 focus-within:ring-ring/50">
                  <span className="pl-2 font-mono text-sm text-muted-foreground">$</span>
                  <CampoNumero
                    ariaLabel="Monto en dólares"
                    valor={(item.monto ?? 0).toFixed(2)}
                    decimales={2}
                    onCommit={(n) => setMonto(item.id, Math.min(n, MONTO_MAX))}
                    className="w-16 text-left"
                    max={MONTO_MAX}
                    maxCaracteres={10}
                  />
                </div>
              ) : (
                <div className="flex shrink-0 items-center rounded-sm border border-border focus-within:ring-3 focus-within:ring-ring/50">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none"
                    aria-label="Restar uno"
                    disabled={item.cantidad <= 1}
                    onClick={() => updateQuantity(item.id, Math.max(1, item.cantidad - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <CampoNumero
                    ariaLabel="Cantidad"
                    valor={formatCantidad(item.cantidad)}
                    decimales={3}
                    onCommit={(n) => updateQuantity(item.id, n)}
                    className="w-11"
                    max={CANTIDAD_MAX}
                    maxCaracteres={CANTIDAD_MAX_CARACTERES}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-none text-primary"
                    aria-label="Sumar uno"
                    onClick={() => updateQuantity(item.id, item.cantidad + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex w-14 shrink-0 flex-col items-end leading-tight">
                <MoneyValue value={totalLinea} className="text-sm font-semibold" />
                {porMonto && (
                  <span className="text-xs text-muted-foreground">
                    ≈ {formatCantidad(item.cantidad)} {unidad || "unidades"}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                aria-label={`Quitar ${item.producto_nombre || item.nombre} del ticket`}
                className="flex size-10 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:size-8"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {conOpciones && (
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
                          "h-11 md:h-9 min-w-11 md:min-w-10 rounded-sm border px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
                    className="h-11 md:h-9 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Vender por cantidad
                  </button>
                ) : item.precio > 0 ? (
                  <button
                    type="button"
                    onClick={() => setMonto(item.id, Math.min(Math.max(totalLinea, 0.01), MONTO_MAX))}
                    className="h-11 md:h-9 rounded-sm px-2 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Vender por monto
                  </button>
                ) : null}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
