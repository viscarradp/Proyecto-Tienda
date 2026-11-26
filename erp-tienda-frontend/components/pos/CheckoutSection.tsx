"use client"

import * as React from "react"
import { DoorOpen, Loader2, XCircle, Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/components/money-value"
import { centavosAMonto, formatMoney, montoACentavos } from "@/lib/format"
import { TERMINOS } from "@/lib/glosario"

const BILLETES = [1, 5, 10, 20]

/**
 * Pie de cobro: error, total con Falta/Cambio, "Paga con" con billetes y el
 * botón "Cobrar $X". Presentacional: la lógica vive en la página POS.
 * En celular va fijo al pie de la hoja del ticket, así siempre se ve.
 */
export function CheckoutSection({
  total,
  itemCount,
  pagoCliente,
  setPagoCliente,
  onCheckout,
  checkoutLoading,
  hasCaja,
  checkoutError,
  faltaFecha,
  ultimaVenta,
}: {
  total: number
  itemCount: number
  pagoCliente: string
  setPagoCliente: (v: string) => void
  onCheckout: () => void
  checkoutLoading: boolean
  hasCaja: boolean
  checkoutError: string
  /** Modo apagón encendido sin fecha: no se puede cobrar. */
  faltaFecha: boolean
  ultimaVenta: { total: number; pago: number | null; cambio: number | null } | null
}) {
  const pago = parseFloat(pagoCliente)
  // Cambio en centavos enteros para evitar errores de coma flotante.
  const cambioCentavos = montoACentavos(pago) - montoACentavos(total)
  const cambio = pago >= 0 && cambioCentavos >= 0 && total > 0 ? centavosAMonto(cambioCentavos) : null
  // Pagó de menos: se avisa cuánto falta (no se bloquea el cobro).
  const falta = pago >= 0 && total > 0 && cambioCentavos < 0 ? centavosAMonto(-cambioCentavos) : null
  const disabled = itemCount === 0 || !hasCaja || checkoutLoading || faltaFecha

  return (
    <div className="flex flex-col gap-3">
      {ultimaVenta && itemCount === 0 && (
        <div role="status" className="rounded-sm border border-success/30 bg-success/10 p-3 text-success">
          <p className="text-xs font-medium uppercase tracking-wide">Venta registrada · {formatMoney(ultimaVenta.total)}</p>
          {ultimaVenta.cambio !== null ? (
            <p className="mt-1 text-3xl font-bold tabular-nums">Cambio: {formatMoney(ultimaVenta.cambio)}</p>
          ) : (
            <p className="mt-1 text-sm font-medium">Cobrada sin dato de pago</p>
          )}
        </div>
      )}

      {checkoutError && (
        <div role="alert" className="flex items-center gap-2 rounded-sm border border-destructive/30 bg-destructive/10 p-2.5 text-sm font-medium text-destructive">
          <XCircle className="h-4 w-4 shrink-0" /> {checkoutError}
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
          <MoneyValue value={total} className="text-3xl font-bold leading-none tracking-tight" />
        </div>
        {falta !== null ? (
          <div className="flex items-baseline gap-2 text-warning-text">
            <span className="text-sm font-semibold">Falta</span>
            <MoneyValue value={falta} tone="warning" className="text-2xl font-bold leading-none" />
          </div>
        ) : cambio !== null ? (
          <div className="flex items-baseline gap-2 text-success">
            <span className="text-sm font-semibold">Cambio</span>
            <MoneyValue value={cambio} tone="success" className="text-2xl font-bold leading-none" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <label htmlFor="pago-cliente" className="shrink-0 text-sm font-medium text-muted-foreground">
            Paga con
          </label>
          <span className="font-mono text-sm text-muted-foreground">$</span>
          <Input
            id="pago-cliente"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            data-escaner="desviar"
            value={pagoCliente}
            onChange={(e) => {
              const v = e.target.value
              // Red de seguridad: como mucho 6 dígitos enteros.
              if (v.split(".")[0].length > 6) return
              setPagoCliente(v)
            }}
            placeholder="0.00"
            size="lg"
            className="flex-1 text-right font-mono tabular-nums"
          />
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          <Button
            type="button"
            variant="outline"
            disabled={total <= 0}
            onClick={() => setPagoCliente(total.toFixed(2))}
            className="px-1 text-xs font-semibold"
          >
            Exacto
          </Button>
          {BILLETES.map((b) => (
            <Button
              key={b}
              type="button"
              variant="outline"
              onClick={() => setPagoCliente(String(b))}
              className="px-1 font-mono text-sm font-semibold"
            >
              ${b}
            </Button>
          ))}
        </div>
      </div>

      <Button
        size="lg"
        className="w-full justify-center gap-2 font-semibold"
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
        ) : faltaFecha ? (
          `Pon la fecha de la ${TERMINOS.ventaCuaderno.toLowerCase()}`
        ) : itemCount === 0 ? (
          "Agrega un producto para cobrar"
        ) : (
          <>Cobrar {formatMoney(total)}</>
        )}
      </Button>
    </div>
  )
}

/**
 * Modo apagón (ventas del cuaderno). Apagado: solo un enlace chico. Encendido
 * (o al tocar el enlace): interruptor y fecha. Su estado persistente vive en la página.
 */
export function ModoApagon({
  contingencia,
  setContingencia,
  fechaContingencia,
  setFechaContingencia,
  fechaPorAjustar,
  setFechaPorAjustar,
}: {
  contingencia: boolean
  setContingencia: (v: boolean) => void
  fechaContingencia: string
  setFechaContingencia: (v: string) => void
  fechaPorAjustar: boolean
  setFechaPorAjustar: (v: boolean) => void
}) {
  const [abierto, setAbierto] = React.useState(false)
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

  if (!abierto && !contingencia) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-2 flex h-11 items-center gap-1.5 self-start rounded-sm px-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline md:h-9"
      >
        <Clock className="h-3.5 w-3.5" /> ¿{TERMINOS.ventaCuaderno}?
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-sm border border-border bg-muted/30 p-3">
      <button
        type="button"
        onClick={() => {
          if (!contingencia && !fechaContingencia) {
            setFechaContingencia(
              new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
            )
          }
          setFechaPorAjustar(false)
          setContingencia(!contingencia)
        }}
        className="flex w-full items-center justify-between gap-2 text-left"
        role="switch"
        aria-checked={contingencia}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Clock className="h-4 w-4" /> {TERMINOS.ventaCuaderno}
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
            onChange={(e) => { setFechaContingencia(e.target.value); setFechaPorAjustar(false) }}
            className={cn(fechaPorAjustar && "border-warning ring-2 ring-warning/50")}
          />
          {fechaPorAjustar && (
            <p className="text-xs font-semibold text-warning-text">
              Ajusta la fecha y hora para la siguiente venta del cuaderno.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            La venta del cuaderno sigue encendida hasta que la apagues. Cada venta se guarda con esta hora; el efectivo entra a la gaveta actual.
          </p>
        </div>
      )}
    </div>
  )
}
