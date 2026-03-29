'use client'

import * as React from "react"
import {
  Banknote,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  DoorClosed,
  DoorOpen,
  Filter,
  Package,
  PiggyBank,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  TerminalSquare,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
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

  // Helper de colores financieros
  const getDiferenciaColor = (diferencia: string | null) => {
    if (!diferencia) return "text-zinc-500"
    const val = parseFloat(diferencia)
    if (val > 0) return "text-emerald-400"
    if (val < 0) return "text-red-400"
    return "text-zinc-200"
  }

  if (!mounted) return null

  return (
    <div className="flex flex-col h-full bg-black text-slate-200">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-black/60 backdrop-blur-xl border-b border-zinc-900 px-6 py-5 lg:px-8 lg:py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-1.5 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white uppercase flex items-center gap-3">
                <Store className="h-7 w-7 text-indigo-400" />
                Ventas y Turnos
              </h1>
              <p className="text-xs font-bold text-zinc-500 tracking-[0.1em] mt-1">
                HISTORIAL DE CAJAS, VENTAS Y CUADRES
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-40 h-11 bg-zinc-950/50 border-zinc-800 text-sm font-bold text-zinc-300 rounded-xl focus:ring-indigo-500">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800">
                <SelectItem value="ultimos_7" className="text-zinc-200 focus:bg-zinc-800 font-medium">Últimos 7 turnos</SelectItem>
                <SelectItem value="ultima_semana" className="text-zinc-200 focus:bg-zinc-800 font-medium">Última semana</SelectItem>
                <SelectItem value="ultimos_15" className="text-zinc-200 focus:bg-zinc-800 font-medium">Últimos 15 días</SelectItem>
                <SelectItem value="ultimo_mes" className="text-zinc-200 focus:bg-zinc-800 font-medium">Último mes</SelectItem>
                <SelectItem value="todos" className="text-zinc-200 focus:bg-zinc-800 font-medium">Todos los turnos</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Buscar ID, fecha, estado..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 h-11 bg-zinc-950/50 border-zinc-800 focus-visible:ring-indigo-500 rounded-xl"
              />
            </div>
            <Button variant="outline" size="icon" onClick={loadData} disabled={loading}
              className="h-11 w-11 shrink-0 rounded-xl border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1 px-4 py-6 md:px-8">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Dashboard Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className={`border rounded-2xl p-5 relative overflow-hidden group transition-colors ${cajaActiva ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-950/40 border-zinc-900'}`}>
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                {cajaActiva ? <DoorOpen className="h-20 w-20 text-emerald-500" /> : <DoorClosed className="h-20 w-20 text-zinc-500" />}
              </div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Estado de Caja (Hoy)</p>
              <div className="flex items-center gap-2 mt-1">
                <div className={`h-2 w-2 rounded-full ${cajaActiva ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <p className={`text-xl font-black ${cajaActiva ? 'text-emerald-400' : 'text-zinc-400'}`}>
                  {cajaActiva ? "EN OPERACIÓN" : "CERRADA"}
                </p>
              </div>
              {cajaActiva && (
                <p className="text-xs font-medium text-emerald-500/70 mt-1">
                  Fondo Inicial: ${parseFloat(cajaActiva.fondo_inicial).toFixed(2)}
                </p>
              )}
            </div>
            
            <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-5 relative overflow-hidden group col-span-1 md:col-span-2">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <Banknote className="h-24 w-24 text-indigo-500" />
              </div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Ingresos del Período</p>
              <div className="flex items-end gap-3">
                <p className="text-4xl font-black text-white tracking-tight">
                  ${ingresosPeriodo.toFixed(2)}
                </p>
                <p className="text-xs font-bold text-zinc-500 mb-1">en {ventasFiltradas.length} ventas</p>
              </div>
            </div>

            <div className="bg-zinc-950/40 border border-zinc-900 rounded-2xl p-5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TerminalSquare className="h-24 w-24 text-amber-500" />
              </div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Turnos Visibles</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-black text-white">{filteredTurnos.length}</p>
                <p className="text-xs text-zinc-500 font-bold">turnos</p>
              </div>
              <div className="mt-1 flex items-center gap-1.5 object-contain">
                <p className={`text-[10px] font-bold uppercase tracking-widest ${descuadreTotal >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                  Dev. $: {descuadreTotal >= 0 ? '+' : ''}{descuadreTotal.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Lista de Turnos */}
          {error ? (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-2xl flex flex-col items-center justify-center text-center gap-3">
              <XCircle className="h-10 w-10 text-red-500/60" />
              <p className="font-bold">{error}</p>
            </div>
          ) : loading && turnos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-4">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="font-bold text-sm tracking-widest uppercase">Cargando historial...</p>
            </div>
          ) : filteredTurnos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-4 border border-dashed border-zinc-800 rounded-3xl">
              <Filter className="h-10 w-10 opacity-20" />
              <p className="font-bold">No se encontraron turnos de caja</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTurnos.map(turno => {
                const isExpanded = expandedTurno === turno.id
                const ventasDelTurno = getVentasDelTurno(turno.id)
                const isAbierta = turno.estado === 'ABIERTA'

                return (
                  <div key={turno.id} className={`bg-zinc-950/60 border rounded-2xl overflow-hidden transition-all duration-300 ${isExpanded ? 'border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.1)]' : 'border-zinc-900 hover:border-zinc-800'}`}>
                    
                    {/* Header del Turno */}
                    <div 
                      className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-zinc-900/40 transition-colors ${isExpanded ? 'bg-zinc-900/30' : ''}`}
                      onClick={() => setExpandedTurno(isExpanded ? null : turno.id)}
                    >
                      <div className="flex items-center gap-4 min-w-[300px]">
                        <div className={`h-12 w-12 rounded-xl flex items-center justify-center border shadow-inner ${isAbierta ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
                          {isAbierta ? <DoorOpen className="h-6 w-6" /> : <DoorClosed className="h-6 w-6" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="font-black text-white text-lg tracking-tight">Turno #{turno.id}</h3>
                            <Badge variant="outline" className={`text-[10px] font-bold uppercase tracking-widest py-0.5 ${isAbierta ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-zinc-900 text-zinc-400 border-zinc-700'}`}>
                              {turno.estado}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs font-medium text-zinc-500 mt-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(turno.fecha_apertura), "dd MMM yyyy", { locale: es })}
                            <span className="text-zinc-700">•</span>
                            <Clock className="h-3.5 w-3.5" />
                            {format(new Date(turno.fecha_apertura), "HH:mm")}
                            {turno.fecha_cierre && (
                              <>
                                <span className="text-zinc-700">→</span>
                                {format(new Date(turno.fecha_cierre), "HH:mm")}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Resumen de totales (Desktop) */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 flex-1">
                        <div>
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Fondo Inicial</p>
                          <p className="font-mono text-sm text-zinc-300">${parseFloat(turno.fondo_inicial).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Ventas</p>
                          <p className="font-mono text-sm text-emerald-400 font-bold">{ventasDelTurno.length} op.</p>
                        </div>
                        {turno.estado === 'CERRADA' ? (
                          <>
                            <div>
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Cierre Declarado</p>
                              <p className="font-mono text-sm text-amber-400">${parseFloat(turno.efectivo_declarado || "0").toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Descuadre</p>
                              <div className={`font-mono font-black text-sm flex items-center gap-1 ${getDiferenciaColor(turno.diferencia)}`}>
                                {parseFloat(turno.diferencia || "0") > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : parseFloat(turno.diferencia || "0") < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                                ${Math.abs(parseFloat(turno.diferencia || "0")).toFixed(2)}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 flex items-center justify-end pr-2 text-zinc-600">
                            (Turno en curso)
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 pl-2">
                        {isExpanded ? <ChevronDown className="h-5 w-5 text-indigo-500" /> : <ChevronRight className="h-5 w-5 text-zinc-600" />}
                      </div>
                    </div>

                    {/* Ventas Expanded */}
                    <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden bg-black/40">
                        {/* Cabecera de la tabla de ventas */}
                        <div className="border-t border-b border-zinc-900 bg-zinc-950/80 px-8 py-3 flex text-[10px] font-black uppercase tracking-widest text-zinc-600">
                          <div className="w-8" />
                          <div className="w-24">Venta ID</div>
                          <div className="w-32">Hora</div>
                          <div className="w-24 text-right">Artículos</div>
                          <div className="flex-1 text-right">Total Cobrado</div>
                        </div>

                        {ventasDelTurno.length === 0 ? (
                          <div className="px-8 py-10 flex flex-col items-center justify-center text-zinc-600 gap-2">
                            <ShoppingCart className="h-6 w-6 opacity-30" />
                            <p className="text-sm font-medium">No se registraron ventas en este turno.</p>
                          </div>
                        ) : (
                          <div className="pb-2">
                            {ventasDelTurno.map(venta => {
                              const isVentaExpanded = expandedVenta === venta.id
                              const totalArticulos = venta.detalle_ventas.reduce((acc, d) => acc + d.cantidad, 0)
                              
                              return (
                                <div key={venta.id} className="border-b border-zinc-900/50 last:border-0">
                                  <div 
                                    className="px-8 py-3.5 flex items-center hover:bg-zinc-900/50 cursor-pointer transition-colors"
                                    onClick={() => setExpandedVenta(isVentaExpanded ? null : venta.id)}
                                  >
                                    <div className="w-8 shrink-0">
                                      {isVentaExpanded ? <ChevronDown className="h-4 w-4 text-indigo-400" /> : <ChevronRight className="h-4 w-4 text-zinc-600" />}
                                    </div>
                                    <div className="w-24 text-sm font-mono text-zinc-400 group-hover:text-indigo-400">
                                      #{String(venta.id).padStart(5, '0')}
                                    </div>
                                    <div className="w-32 text-xs font-medium text-zinc-500 flex items-center gap-2">
                                      <Clock className="h-3.5 w-3.5 opacity-50" />
                                      {format(new Date(venta.fecha), "HH:mm:ss")}
                                    </div>
                                    <div className="w-24 text-right">
                                      <Badge variant="outline" className="text-[10px] border-zinc-800 text-zinc-400">{totalArticulos} uds</Badge>
                                    </div>
                                    <div className="flex-1 text-right text-sm font-black text-emerald-400 tracking-tight flex items-center justify-end gap-2">
                                      {venta.estado === 'ANULADA' && (
                                        <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-500 border-red-500/20">ANULADA</Badge>
                                      )}
                                      <span className={venta.estado === 'ANULADA' ? 'line-through text-zinc-500' : ''}>
                                        ${parseFloat(venta.total).toFixed(2)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Detalle de Artículos de la Venta */}
                                  {isVentaExpanded && (
                                    <div className="bg-zinc-950 px-8 py-4 ml-8 border-l-2 border-indigo-500/30">
                                      <div className="space-y-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500/60 mb-2">Desglose de Artículos</p>
                                        {venta.detalle_ventas.map(detalle => (
                                          <div key={detalle.id} className="flex items-center justify-between bg-black border border-zinc-900 rounded-xl p-3 text-sm">
                                            <div className="flex items-center gap-3">
                                              <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center border border-zinc-800">
                                                <Package className="h-4 w-4 text-zinc-500" />
                                              </div>
                                              <div>
                                                <p className="font-bold text-zinc-200">
                                                  {detalle.presentaciones?.descripcion || `Producto ID #${detalle.presentacion_id}`}
                                                </p>
                                                <p className="text-xs text-zinc-500">
                                                  {detalle.cantidad} unidades • ${(parseFloat(detalle.subtotal) / detalle.cantidad).toFixed(2)} c/u
                                                </p>
                                              </div>
                                            </div>
                                            <div className="text-base font-black text-white">
                                              ${parseFloat(detalle.subtotal).toFixed(2)}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      
                                      {/* Anular Action */}
                                      {venta.estado === 'COMPLETADA' && (
                                        <div className="mt-4 pt-4 border-t border-zinc-900 flex justify-end">
                                          <Button 
                                            variant="outline" 
                                            size="sm"
                                            className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/20"
                                            onClick={() => {
                                              setVentaAAnular(venta.id)
                                              setIsAnulando(true)
                                            }}
                                          >
                                            <XCircle className="h-4 w-4 mr-2" /> Anular Venta
                                          </Button>
                                        </div>
                                      )}
                                      {venta.estado === 'ANULADA' && venta.justificacion_nula && (
                                        <div className="mt-4 pt-4 border-t border-zinc-900">
                                          <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 text-xs">
                                            <p className="font-bold text-red-400 mb-1">Motivo de anulación:</p>
                                            <p className="text-zinc-400">{venta.justificacion_nula}</p>
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
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ════════ DIALOG: ANULAR VENTA ════════ */}
      <Dialog open={isAnulando} onOpenChange={setIsAnulando}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-rose-500 uppercase tracking-tight flex items-center gap-2">
              <XCircle className="h-5 w-5" /> Anular Venta #{ventaAAnular}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Esta acción devolverá el stock al inventario y restará el dinero del balance de la caja. Esta acción es <strong className="text-zinc-300">irreversible</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAnularVenta} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Motivo de la anulación</Label>
              <Input required value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                placeholder="Ej. El cliente devolvió el producto empacado"
                className="bg-black/50 border-zinc-800 text-white h-12 rounded-xl focus-visible:ring-rose-500"
                autoFocus />
            </div>
            {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
            <DialogFooter className="pt-2">
              <Button type="button" onClick={() => setIsAnulando(false)}
                className="bg-zinc-800 text-white hover:bg-zinc-700 rounded-xl" disabled={anularLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={anularLoading || !motivoAnulacion.trim()}
                className="bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg">
                {anularLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                Confirmar Anulación
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
