"use client"

import * as React from "react"
import { ChevronRight, DoorOpen, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
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
  contingencia,
  setContingencia,
  fechaContingencia,
  setFechaContingencia,
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
  contingencia: boolean
  setContingencia: (v: boolean) => void
  fechaContingencia: string
  setFechaContingencia: (v: string) => void
}) {
  const pago = parseFloat(pagoCliente)
  const cambio = pago >= total && total > 0 ? pago - total : null
  // En contingencia con fecha vacía no se puede procesar (faltaría la hora real).
  const faltaFecha = contingencia && !fechaContingencia
  const disabled = itemCount === 0 || !hasCaja || checkoutLoading || faltaFecha
  // max del datetime-local = ahora (no se permiten ventas futuras). Se calcula
  // tras el montaje: Date.now() es impuro y no puede llamarse durante el render.
  const [ahoraLocal, setAhoraLocal] = React.useState("")
  React.useEffect(() => {
    setAhoraLocal(
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    )
  }, [])

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

      {/* Modo contingencia (3.D): registrar una venta de apagón con su hora real */}
      <div className="rounded-sm border border-border bg-muted/30 p-3">
        <button
          type="button"
          onClick={() => setContingencia(!contingencia)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4" /> Venta durante un apagón
          </span>
          <span
            className={cn(
              "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
              contingencia ? "bg-primary" : "bg-border",
            )}
          >
            <span
              className={cn(
                "h-4 w-4 rounded-full bg-background transition-transform",
                contingencia && "translate-x-4",
              )}
            />
          </span>
        </button>
        {contingencia && (
          <div className="mt-3 flex flex-col gap-1.5">
            <label htmlFor="fecha-contingencia" className="text-xs text-muted-foreground">
              Fecha y hora real de la venta
            </label>
            <Input
              id="fecha-contingencia"
              type="datetime-local"
              max={ahoraLocal}
              value={fechaContingencia}
              onChange={(e) => setFechaContingencia(e.target.value)}
              className="h-11"
            />
            <p className="text-[11px] text-muted-foreground">
              La venta se registra con esta hora; el efectivo entra a la caja actual.
            </p>
          </div>
        )}
      </div>

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
