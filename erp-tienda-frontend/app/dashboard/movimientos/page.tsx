'use client'

import * as React from "react"
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  DoorClosed,
  DoorOpen,
  Filter,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { MoneyValue } from "@/components/money-value"
import { formatMoney } from "@/lib/format"
import { StatePill } from "@/components/state-pill"
import { StatCard } from "@/components/stat-card"
import { apiFetch } from "@/lib/api"
import { format, differenceInDays } from "date-fns"
import { es } from "date-fns/locale"

// ─── Tipos ───
interface Presentacion {
  id: number
  descripcion: string
  producto_id: number
}

interface DetalleVenta {
  id: number
  venta_id: number
  presentacion_id: number
  cantidad: number
  subtotal: string
  presentaciones: Presentacion
}

interface Venta {
  id: number
  caja_turno_id: number
  fecha: string
  total: string
  estado: string
  justificacion_nula: string | null
  detalle_ventas: DetalleVenta[]
}

interface CajaTurno {
  id: number
  fondo_inicial: string
  estado: string
  fecha_apertura: string
  fecha_cierre: string | null
  efectivo_esperado: string | null
  efectivo_declarado: string | null
  diferencia: string | null
}

export default function MovimientosPage() {
  const [mounted, setMounted] = React.useState(false)
  const [turnos, setTurnos] = React.useState<CajaTurno[]>([])
  const [ventas, setVentas] = React.useState<Venta[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  const [expandedTurno, setExpandedTurno] = React.useState<number | null>(null)
  const [expandedVenta, setExpandedVenta] = React.useState<number | null>(null)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [periodFilter, setPeriodFilter] = React.useState("ultimos_7")

  // Modal Anulacion State
  const [isAnulando, setIsAnulando] = React.useState(false)
  const [ventaAAnular, setVentaAAnular] = React.useState<number | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = React.useState("")
  const [anularLoading, setAnularLoading] = React.useState(false)

  React.useEffect(() => { setMounted(true) }, [])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [turnosData, ventasData] = await Promise.all([
        apiFetch<CajaTurno[]>("/cajas-turnos"),
        apiFetch<Venta[]>("/ventas"),
      ])
      setTurnos(turnosData)
      setVentas(ventasData)

      // Expand primary active turno if any
      const activo = turnosData.find(t => t.estado === 'ABIERTA')
      if (activo) setExpandedTurno(activo.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar movimientos")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (mounted) loadData()
  }, [mounted, loadData])

  // Filtrado de turnos
  const filteredTurnos = React.useMemo(() => {
    let base = [...turnos].sort((a, b) => new Date(b.fecha_apertura).getTime() - new Date(a.fecha_apertura).getTime())
    const now = new Date()

    if (periodFilter === "ultimos_7") {
      base = base.slice(0, 7)
    } else if (periodFilter === "ultima_semana") {
      base = base.filter(t => differenceInDays(now, new Date(t.fecha_apertura)) <= 7)
    } else if (periodFilter === "ultimos_15") {
      base = base.filter(t => differenceInDays(now, new Date(t.fecha_apertura)) <= 15)
    } else if (periodFilter === "ultimo_mes") {
      base = base.filter(t => differenceInDays(now, new Date(t.fecha_apertura)) <= 30)
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      base = base.filter(turno => {
        const matchId = String(turno.id).includes(searchLower)
        const matchDate = format(new Date(turno.fecha_apertura), "dd/MMM/yyyy HH:mm", { locale: es }).toLowerCase().includes(searchLower)
        const matchEstado = turno.estado.toLowerCase().includes(searchLower)
        return matchId || matchDate || matchEstado
      })
    }

    return base
  }, [turnos, periodFilter, searchTerm])

  const ventasFiltradas = ventas.filter(v => filteredTurnos.some(t => t.id === v.caja_turno_id))
  // Solo sumamos ingresos de ventas que no esten anuladas
  const ingresosPeriodo = ventasFiltradas
    .filter(v => v.estado === 'COMPLETADA')
    .reduce((acc, v) => acc + parseFloat(v.total), 0)

  const turnosCerradosPeriodo = filteredTurnos.filter(t => t.estado === 'CERRADA')
  const descuadreTotal = turnosCerradosPeriodo.reduce((acc, t) => acc + parseFloat(t.diferencia || "0"), 0)
  const cajaActiva = turnos.find(t => t.estado === 'ABIERTA')

  // Helper para obtener las ventas de un turno
  const getVentasDelTurno = (turnoId: number) => {
    return ventas.filter(v => v.caja_turno_id === turnoId)
  }

  const handleAnularVenta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ventaAAnular || !motivoAnulacion.trim()) return

    setAnularLoading(true)
    setError("")
    try {
      await apiFetch(`/ventas/${ventaAAnular}/anular`, {
        method: "PATCH",
        body: JSON.stringify({ justificacion_nula: motivoAnulacion.trim() })
      })
      await loadData() // recarga todo (ventas y saldos de caja)
      setIsAnulando(false)
      setMotivoAnulacion("")
      setVentaAAnular(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al anular la venta")
      setIsAnulando(false)
    } finally {
      setAnularLoading(false)
    }
  }

  // Tono semántico para el descuadre
  const getDiferenciaTone = (diferencia: string | null): "success" | "destructive" | "muted" => {
    if (!diferencia) return "muted"
    const val = parseFloat(diferencia)
    if (val > 0) return "success"
    if (val < 0) return "destructive"
    return "muted"
  }

  if (!mounted) return null

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8 lg:py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Ventas y turnos</h1>
            <p className="text-xs text-muted-foreground">Historial de cajas, ventas y cuadres</p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="h-11 w-40 shrink-0">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ultimos_7">Últimos 7 turnos</SelectItem>
                <SelectItem value="ultima_semana">Última semana</SelectItem>
                <SelectItem value="ultimos_15">Últimos 15 días</SelectItem>
                <SelectItem value="ultimo_mes">Último mes</SelectItem>
                <SelectItem value="todos">Todos los turnos</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar ID, fecha, estado…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-11 pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={loadData} disabled={loading} className="h-11 w-11 shrink-0">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">

          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <StatCard
              label="Estado de caja (hoy)"
              icon={cajaActiva ? DoorOpen : DoorClosed}
              footer={cajaActiva ? <>Fondo inicial: <MoneyValue value={cajaActiva.fondo_inicial} tone="muted" className="text-xs" /></> : undefined}
              className={cajaActiva ? "border-success/30" : undefined}
            >
              <div className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", cajaActiva ? "bg-success" : "bg-destructive")} />
                <p className={cn("text-lg font-semibold", cajaActiva ? "text-success" : "text-muted-foreground")}>
                  {cajaActiva ? "En operación" : "Cerrada"}
                </p>
              </div>
            </StatCard>

            <StatCard label="Ingresos del período" className="md:col-span-2" footer={`en ${ventasFiltradas.length} ventas`}>
              <MoneyValue value={ingresosPeriodo} className="text-3xl font-bold tracking-tight" />
            </StatCard>

            <StatCard label="Turnos visibles">
              <div className="flex items-baseline gap-2">
                <p className="font-mono text-2xl font-bold tabular-nums">{filteredTurnos.length}</p>
                <p className="text-xs text-muted-foreground">turnos</p>
              </div>
              <p className={cn("mt-1 text-xs font-medium", descuadreTotal >= 0 ? "text-success" : "text-destructive")}>
                Desc.: {descuadreTotal >= 0 ? '+' : ''}{descuadreTotal.toFixed(2)}
              </p>
            </StatCard>
          </div>

          {/* Lista de Turnos */}
          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-destructive/20 bg-destructive/10 p-6 text-center text-destructive">
              <XCircle className="h-9 w-9 text-destructive/70" />
              <p className="font-medium">{error}</p>
            </div>
          ) : loading && turnos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Cargando historial…</p>
            </div>
          ) : filteredTurnos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-sm border border-dashed border-border py-24 text-muted-foreground">
              <Filter className="h-10 w-10 opacity-20" />
              <p className="text-sm font-medium text-foreground">No se encontraron turnos de caja</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredTurnos.map(turno => {
                const isExpanded = expandedTurno === turno.id
                const ventasDelTurno = getVentasDelTurno(turno.id)
                const isAbierta = turno.estado === 'ABIERTA'

                return (
                  <div key={turno.id} className={cn("overflow-hidden rounded-sm border bg-card transition-colors", isExpanded ? "border-primary/40" : "border-border")}>
                    {/* Header del Turno */}
                    <button
                      type="button"
                      className="flex w-full flex-col gap-4 p-4 text-left transition-colors hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
                      onClick={() => setExpandedTurno(isExpanded ? null : turno.id)}
                    >
                      <div className="flex min-w-0 items-center gap-3 md:w-72">
                        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border", isAbierta ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground")}>
                          {isAbierta ? <DoorOpen className="h-5 w-5" /> : <DoorClosed className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Turno #{turno.id}</h3>
                            <StatePill tone={isAbierta ? "success" : "muted"}>{turno.estado}</StatePill>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(turno.fecha_apertura), "dd MMM yyyy", { locale: es })}
                            <Clock className="ml-1 h-3.5 w-3.5" />
                            {format(new Date(turno.fecha_apertura), "HH:mm")}
                            {turno.fecha_cierre && <>→ {format(new Date(turno.fecha_cierre), "HH:mm")}</>}
                          </div>
                        </div>
                      </div>

                      {/* Resumen de totales */}
                      <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
                        <div>
                          <p className="text-xs text-muted-foreground">Fondo inicial</p>
                          <MoneyValue value={turno.fondo_inicial} className="text-sm" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Ventas</p>
                          <p className="font-mono text-sm font-medium text-success tabular-nums">{ventasDelTurno.length} op.</p>
                        </div>
                        {turno.estado === 'CERRADA' ? (
                          <>
                            <div>
                              <p className="text-xs text-muted-foreground">Cierre declarado</p>
                              <MoneyValue value={turno.efectivo_declarado || "0"} tone="warning" className="text-sm" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Descuadre</p>
                              <div className={cn("flex items-center gap-1 font-mono text-sm font-semibold tabular-nums",
                                getDiferenciaTone(turno.diferencia) === "success" ? "text-success" : getDiferenciaTone(turno.diferencia) === "destructive" ? "text-destructive" : "text-muted-foreground")}>
                                {parseFloat(turno.diferencia || "0") > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : parseFloat(turno.diferencia || "0") < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                                {formatMoney(Math.abs(parseFloat(turno.diferencia || "0")))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 flex items-center text-sm text-muted-foreground md:justify-end">
                            Turno en curso
                          </div>
                        )}
                      </div>

                      <div className="hidden shrink-0 md:block">
                        {isExpanded ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Ventas Expanded */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/20">
                        {/* Cabecera de la tabla de ventas (desktop) */}
                        <div className="hidden items-center border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
                          <div className="w-6" />
                          <div className="w-24">Venta ID</div>
                          <div className="w-28">Hora</div>
                          <div className="w-24 text-right">Artículos</div>
                          <div className="flex-1 text-right">Total</div>
                        </div>

                        {ventasDelTurno.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                            <ShoppingCart className="h-6 w-6 opacity-30" />
                            <p className="text-sm">No se registraron ventas en este turno.</p>
                          </div>
                        ) : (
                          <div>
                            {ventasDelTurno.map(venta => {
                              const isVentaExpanded = expandedVenta === venta.id
                              const totalArticulos = venta.detalle_ventas.reduce((acc, d) => acc + d.cantidad, 0)
                              const anulada = venta.estado === 'ANULADA'

                              return (
                                <div key={venta.id} className="border-b border-border last:border-0">
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                                    onClick={() => setExpandedVenta(isVentaExpanded ? null : venta.id)}
                                  >
                                    <div className="w-6 shrink-0">
                                      {isVentaExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                    </div>
                                    <div className="w-24 font-mono text-sm text-muted-foreground">#{String(venta.id).padStart(5, '0')}</div>
                                    <div className="hidden w-28 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                                      <Clock className="h-3.5 w-3.5 opacity-60" />
                                      {format(new Date(venta.fecha), "HH:mm:ss")}
                                    </div>
                                    <div className="hidden w-24 text-right sm:block">
                                      <StatePill tone="muted">{totalArticulos} uds</StatePill>
                                    </div>
                                    <div className="flex flex-1 items-center justify-end gap-2">
                                      {anulada && <StatePill tone="destructive">Anulada</StatePill>}
                                      <MoneyValue value={venta.total} tone={anulada ? "muted" : "success"} className={cn("text-sm font-semibold", anulada && "line-through")} />
                                    </div>
                                  </button>

                                  {/* Detalle de Artículos */}
                                  {isVentaExpanded && (
                                    <div className="border-l-2 border-primary/30 bg-background/40 px-4 py-3 sm:ml-6">
                                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Desglose de artículos</p>
                                      <div className="flex flex-col gap-2">
                                        {venta.detalle_ventas.map(detalle => (
                                          <div key={detalle.id} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-3 text-sm">
                                            <div className="flex items-center gap-3">
                                              <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-muted text-muted-foreground">
                                                <Package className="h-4 w-4" />
                                              </div>
                                              <div>
                                                <p className="font-medium">{detalle.presentaciones?.descripcion || `Producto ID #${detalle.presentacion_id}`}</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {detalle.cantidad} uds · <MoneyValue value={parseFloat(detalle.subtotal) / detalle.cantidad} tone="muted" className="text-xs" /> c/u
                                                </p>
                                              </div>
                                            </div>
                                            <MoneyValue value={detalle.subtotal} className="font-semibold" />
                                          </div>
                                        ))}
                                      </div>

                                      {/* Anular */}
                                      {venta.estado === 'COMPLETADA' && (
                                        <div className="mt-3 flex justify-end border-t border-border pt-3">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => { setVentaAAnular(venta.id); setIsAnulando(true) }}
                                          >
                                            <XCircle className="h-4 w-4" /> Anular venta
                                          </Button>
                                        </div>
                                      )}
                                      {venta.estado === 'ANULADA' && venta.justificacion_nula && (
                                        <div className="mt-3 border-t border-border pt-3">
                                          <div className="rounded-sm border border-destructive/20 bg-destructive/5 p-3 text-xs">
                                            <p className="mb-1 font-medium text-destructive">Motivo de anulación:</p>
                                            <p className="text-muted-foreground">{venta.justificacion_nula}</p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ════════ DIALOG: ANULAR VENTA ════════ */}
      <Dialog open={isAnulando} onOpenChange={setIsAnulando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> Anular venta #{ventaAAnular}
            </DialogTitle>
            <DialogDescription>
              Esta acción devolverá el stock al inventario y restará el dinero del balance de la caja. Es <strong className="text-foreground">irreversible</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAnularVenta} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Motivo de la anulación</Label>
              <Input required value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                placeholder="Ej. El cliente devolvió el producto empacado"
                className="h-12"
                autoFocus />
            </div>
            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setIsAnulando(false)} disabled={anularLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={anularLoading || !motivoAnulacion.trim()} className="gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {anularLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Confirmar anulación
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
