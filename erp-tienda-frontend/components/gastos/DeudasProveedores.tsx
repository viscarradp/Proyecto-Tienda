'use client'

import * as React from "react"
import { Loader2, HandCoins, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MoneyValue } from "@/components/money-value"
import { apiFetch } from "@/lib/api"

interface Abono {
  id: number
  monto: string
  fecha: string
  nota: string | null
}

interface Deuda {
  id: number
  acreedor: string
  fecha_compra: string
  monto_deuda: string
  saldo_pendiente: string
  abonos: Abono[]
}

interface AbonoRespuesta {
  avisos?: string[]
}

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" })

/**
 * Sección "Deudas con proveedores" (L8, D-05): compras al crédito pendientes de
 * pago, con abonos desde la gaveta o la bóveda. Solo la dueña (ADMIN) puede ver
 * estos endpoints; si el servidor lo niega, la sección no se muestra.
 */
export function DeudasProveedores({ onPagado }: { onPagado?: () => void }) {
  const [deudas, setDeudas] = React.useState<Deuda[] | null>(null)
  const [cargando, setCargando] = React.useState(true)
  const [oculta, setOculta] = React.useState(false)
  const [abierta, setAbierta] = React.useState<number | null>(null)

  const [objetivo, setObjetivo] = React.useState<Deuda | null>(null)
  const [monto, setMonto] = React.useState("")
  const [origen, setOrigen] = React.useState("GAVETA")
  const [nota, setNota] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)
  const [errorPago, setErrorPago] = React.useState("")

  const cargar = React.useCallback(async () => {
    setCargando(true)
    try {
      // "todas" para poder mostrar el historial de abonos de lo ya saldado no
      // hace falta: la lista son las pendientes.
      const res = await apiFetch<Deuda[]>("/cuentas-por-pagar?estado=pendientes")
      setDeudas(Array.isArray(res) ? res : [])
    } catch {
      setOculta(true)
    } finally {
      setCargando(false)
    }
  }, [])

  React.useEffect(() => {
    cargar()
  }, [cargar])

  if (oculta) return null

  const totalAdeudado = (deudas ?? []).reduce((s, d) => s + (parseFloat(d.saldo_pendiente) || 0), 0)

  const abrirPago = (d: Deuda) => {
    setObjetivo(d)
    setMonto(parseFloat(d.saldo_pendiente).toFixed(2))
    setOrigen("GAVETA")
    setNota("")
    setErrorPago("")
  }

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!objetivo) return
    const valor = parseFloat(monto)
    const saldo = parseFloat(objetivo.saldo_pendiente)
    if (isNaN(valor) || valor <= 0) {
      setErrorPago("El abono debe ser mayor a 0.")
      return
    }
    if (valor > saldo + 0.001) {
      setErrorPago(`No puedes abonar más de lo que se debe ($${saldo.toFixed(2)}).`)
      return
    }
    setEnviando(true)
    setErrorPago("")
    try {
      const res = await apiFetch<AbonoRespuesta>(`/cuentas-por-pagar/${objetivo.id}/abonos`, {
        method: "POST",
        body: JSON.stringify({ monto: valor, origen, nota: nota.trim() || undefined }),
      })
      toast.success("Abono registrado")
      for (const aviso of res.avisos ?? []) {
        toast.warning(aviso, { duration: 12000 })
      }
      setObjetivo(null)
      await cargar()
      onPagado?.()
    } catch (err: unknown) {
      setErrorPago(err instanceof Error ? err.message : "No se pudo registrar el abono")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="rounded-sm border border-border bg-card p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HandCoins className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">Deudas con proveedores</h2>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total adeudado</p>
          <MoneyValue value={totalAdeudado} className="text-xl font-bold tracking-tight" />
        </div>
      </div>

      {cargando && deudas === null ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (deudas ?? []).length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4" /> No debes nada a tus proveedores.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(deudas ?? []).map(d => {
            const isOpen = abierta === d.id
            return (
              <div key={d.id} className="rounded-sm border border-border">
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.acreedor}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Compra del {fechaCorta(d.fecha_compra)} · Deuda{" "}
                      <MoneyValue value={d.monto_deuda} className="text-xs" />
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <MoneyValue value={d.saldo_pendiente} className="text-lg font-semibold text-destructive" />
                    </div>
                    <Button type="button" onClick={() => abrirPago(d)} className="h-11 shrink-0">
                      Pagar / abonar
                    </Button>
                  </div>
                </div>

                {d.abonos.length > 0 && (
                  <div className="border-t border-border">
                    <button
                      type="button"
                      onClick={() => setAbierta(isOpen ? null : d.id)}
                      className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50"
                    >
                      <span>Abonos hechos ({d.abonos.length})</span>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {isOpen && (
                      <div className="flex flex-col gap-1 px-4 pb-3">
                        {d.abonos.map(a => (
                          <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="min-w-0 truncate text-muted-foreground">
                              {fechaCorta(a.fecha)}
                              {a.nota ? ` · ${a.nota}` : ""}
                            </span>
                            <MoneyValue value={a.monto} className="shrink-0 font-mono text-sm" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={objetivo !== null} onOpenChange={(open) => { if (!open) setObjetivo(null) }}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-primary" /> Pagar a {objetivo?.acreedor}
            </DialogTitle>
            <DialogDescription>
              {objetivo && (
                <>Se debe <MoneyValue value={objetivo.saldo_pendiente} className="text-sm font-semibold" />. Puedes pagar todo o abonar una parte.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={pagar} className="flex flex-col gap-4">
            {errorPago && (
              <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                {errorPago}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Monto ($)</Label>
              <Input type="number" min={0.01} step="0.01" inputMode="decimal" required value={monto}
                onChange={e => setMonto(e.target.value)}
                className="h-14 font-mono text-2xl font-bold" />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">¿De dónde sale el dinero?</Label>
              <Select value={origen} onValueChange={setOrigen}>
                <SelectTrigger className="h-12 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GAVETA">Caja del día (requiere turno abierto)</SelectItem>
                  <SelectItem value="BOVEDA">Bóveda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Nota (opcional)</Label>
              <Input value={nota} maxLength={255} onChange={e => setNota(e.target.value)}
                placeholder="Ej. Factura 123" className="h-12" />
            </div>
            <div className={cn("flex justify-end gap-3 pt-2")}>
              <Button type="button" variant="secondary" onClick={() => setObjetivo(null)}>Cancelar</Button>
              <Button type="submit" disabled={enviando} className="gap-2">
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                Registrar pago
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
