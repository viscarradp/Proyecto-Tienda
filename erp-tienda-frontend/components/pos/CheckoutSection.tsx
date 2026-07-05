"use client"

import { ChevronRight, DoorOpen, Loader2, CheckCircle2, XCircle } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/components/money-value"

/**
 * Sección de cobro: total, "paga con", cambio y botón de procesar pago.
 * Presentacional: toda la lógica de checkout vive en la página POS.
 * Reutilizada en el panel de escritorio y el bottom-sheet del carrito.
 */
export function CheckoutSection({
  total,
  itemCount,
  pagoCliente,
  setPagoCliente,
  onCheckout,
  checkoutLoading,
  hasCaja,
  checkoutSuccess,
  checkoutError,
}: {
  total: number
  itemCount: number
  pagoCliente: string
  setPagoCliente: (v: string) => void
  onCheckout: () => void
  checkoutLoading: boolean
  hasCaja: boolean
  checkoutSuccess: boolean
  checkoutError: string
}) {
  const pago = parseFloat(pagoCliente)
  const cambio = pago >= total && total > 0 ? pago - total : null
  const disabled = itemCount === 0 || !hasCaja || checkoutLoading

  return (
    <div className="flex flex-col gap-4">
      {checkoutSuccess && (
        <div className="flex items-center gap-2 rounded-sm border border-success/30 bg-success/10 p-3 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> ¡Venta registrada!
        </div>
      )}
      {checkoutError && (
        <div className="flex items-center gap-2 rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          <XCircle className="h-4 w-4 shrink-0" /> {checkoutError}
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total a cobrar</p>
          <MoneyValue value={total} className="text-4xl font-bold tracking-tight" />
        </div>
        <p className="pb-1 text-sm font-medium text-muted-foreground">
          {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="pago-cliente" className="text-sm font-medium text-muted-foreground">
          Paga con
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">$</span>
          <Input
            id="pago-cliente"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={pagoCliente}
            onChange={(e) => setPagoCliente(e.target.value)}
            placeholder="0.00"
            className="h-11 w-28 text-right font-mono tabular-nums"
          />
        </div>
      </div>

      {cambio !== null && (
        <div className="flex items-center justify-between rounded-sm bg-success/10 px-3 py-2 text-sm font-medium text-success">
          <span>Cambio</span>
          <MoneyValue value={cambio} tone="success" className="font-semibold" />
        </div>
      )}

      <Button
        className="h-14 w-full justify-center gap-2 text-base font-semibold"
        disabled={disabled}
        onClick={onCheckout}
      >
        {checkoutLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> Procesando…
          </>
        ) : !hasCaja ? (
          <>
            <DoorOpen className="h-5 w-5" /> Abre la caja primero
          </>
        ) : (
          <>
            Procesar pago <ChevronRight className="h-5 w-5" />
          </>
        )}
      </Button>
    </div>
  )
}
