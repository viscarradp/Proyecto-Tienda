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
  Undo2,
  XCircle,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { MoneyValue } from "@/components/money-value"
import { CampoError } from "@/components/campo-error"
import { SeccionTitulo } from "@/components/seccion-titulo"
import { formatMoney, aNumero, formatCantidad, montoACentavos, centavosAMonto, formatFecha, formatNumeroVenta } from "@/lib/format"
import { StatePill } from "@/components/state-pill"
import { StatCard } from "@/components/stat-card"
import { DevolucionDialog } from "@/components/movimientos/DevolucionDialog"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { apiFetch, tipoDeError } from "@/lib/api"
import { GAVETA, BOVEDA, TERMINOS, mensajeError } from "@/lib/glosario"
import { rotuloMovimiento } from "@/lib/rotulo-movimiento"
import { AnularDialog, AnuladoNota, type AnularObjetivo } from "@/components/gastos/AnularDialog"
import { toast } from "sonner"
import { EsqueletoPagina } from "@/components/esqueleto-pagina"

// ─── Tipos ───
interface Presentacion {
  id: number
  descripcion: string
  producto_id: number
  productos?: { nombre: string }
}

interface DetalleVenta {
  id: number
  venta_id: number
  presentacion_id: number
  cantidad: number | string
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
  // Autoría (D-06): solo el nombre; null si el usuario ya no está o no se registró.
  usuarios?: { nombre: string } | null
  anulada_por?: { nombre: string } | null
  detalle_ventas: DetalleVenta[]
  _count?: { devoluciones: number }
  devoluciones?: { total_reembolsado: string }[]
}

/** Movimiento de dinero de un turno (gasto, traslado, retiro, pago…), con quién lo hizo. */
interface MovimientoTurno {
  id: number
  tipo_movimiento: string
  monto: string
  descripcion: string
  fecha: string | null
  cuenta_origen: string | null
  cuenta_destino: string | null
  usuarios?: { nombre: string } | null
  categorias_gastos?: { nombre: string } | null
  anulado?: boolean
  /** Asiento de la diferencia de apertura: no mueve el esperado, no se anula. */
  es_apertura?: boolean
  motivo_anulacion?: string | null
  anulado_por?: { nombre: string } | null
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
  /** Lo que escribió quien cerró (justificación del descuadre o del cierre forzado). */
  observaciones?: string | null
  usuarios?: { nombre: string } | null
  cerrado_por?: { nombre: string } | null
  movimientos_financieros?: MovimientoTurno[]
}

interface PaginaTurnos {
  items: CajaTurno[]
  hay_mas: boolean
}

type BusquedaVenta =
  | { estado: "inactiva" }
  | { estado: "cargando" }
  | { estado: "ok"; venta: Venta; turno: CajaTurno }
  | { estado: "no_existe"; numero: string }
  | { estado: "error"; mensaje: string }

// Una caja cerrada a la fuerza también cuenta como cerrada y entra a lo que faltó o sobró
const estaCerrado = (estado: string) => estado === 'CERRADA' || estado === 'CERRADA_FORZADA'
const etiquetaEstado = (estado: string) =>
  estado === 'ABIERTA' ? 'Abierta' : estado === 'CERRADA_FORZADA' ? 'Cerrada a la fuerza' : estado === 'CERRADA' ? 'Cerrada' : estado

const ZONA_NEGOCIO = "America/El_Salvador"
const HORAS_TURNO_VIEJO = 14

/** Día calendario (AAAA-MM-DD) de una fecha en la zona del negocio. */
const diaEnZonaNegocio = (fecha: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha)

/** Un turno abierto es "viejo" si se abrió antes de hoy (hora de la tienda) o lleva más de 14 h abierto. */
function esTurnoViejo(fechaApertura: string | Date, ahora: Date = new Date()): boolean {
  const apertura = new Date(fechaApertura)
  if (diaEnZonaNegocio(apertura) < diaEnZonaNegocio(ahora)) return true
  return ahora.getTime() - apertura.getTime() > HORAS_TURNO_VIEJO * 3600 * 1000
}

/** Las descripciones viejas de abonos terminan en "(deuda ID 1)": no le dice nada a la dueña. */
const sinIdInterno = (texto: string) => texto.replace(/\s*\(deuda ID \d+\)\s*$/i, "")

const MOTIVO_TURNO_CERRADO = "Esa caja ya se cerró: el dinero ya se contó al cerrar."

/** Movimientos de dinero que se muestran en el turno (la merma no es dinero). */
const movimientosDeDinero = (turno: CajaTurno) =>
  (turno.movimientos_financieros ?? []).filter(m => m.tipo_movimiento !== 'MERMA_INVENTARIO')

/** Fila "Gasto: Pago de agua — $5.00 — karla": qué pasó, cuánto, cuándo y quién. */
function MovimientoFila({ mov, onAnular, motivoNoAnular }: { mov: MovimientoTurno; onAnular?: (mov: MovimientoTurno) => void; motivoNoAnular?: string }) {
  // Respecto a la gaveta: sale, entra o ni la toca (se movió solo en la bóveda).
  const sale = mov.cuenta_origen === 'GAVETA'
  const entra = mov.cuenta_destino === 'GAVETA'
  const soloBoveda = !sale && !entra
  const nombre = mov.usuarios?.nombre
  const rotulo = rotuloMovimiento(mov)
  const descripcion = sinIdInterno(mov.descripcion ?? "")
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-0">
      <div className="min-w-0">
        <p className={cn("truncate text-sm", mov.anulado && "line-through opacity-60")}>
          <span className="font-medium">{rotulo}</span>
          {descripcion && <span className="text-muted-foreground">: {descripcion}</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {mov.fecha && formatFecha(mov.fecha, "hora")}
          {mov.categorias_gastos?.nombre && <> · {mov.categorias_gastos.nombre}</>}
          {soloBoveda && !rotulo.toLowerCase().includes(BOVEDA.toLowerCase()) && <> · {mov.cuenta_origen === 'BOVEDA' ? `salió de la ${BOVEDA.toLowerCase()}` : `no tocó la ${GAVETA.toLowerCase()}`}</>}
          {nombre && <> · {nombre}</>}
        </p>
        {mov.anulado && <AnuladoNota motivo={mov.motivo_anulacion} quien={mov.anulado_por?.nombre} />}
        {!onAnular && motivoNoAnular && (
          <p id={`no-anular-mov-${mov.id}`} className="mt-0.5 text-xs text-muted-foreground">{motivoNoAnular}</p>
        )}
      </div>
      {onAnular && (
        <Button variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => onAnular(mov)}>
          <Undo2 className="h-3.5 w-3.5" /> Anular
        </Button>
      )}
      {!onAnular && motivoNoAnular && (
        <Button variant="outline" size="sm" className="shrink-0 gap-1" disabled title={motivoNoAnular} aria-describedby={`no-anular-mov-${mov.id}`}>
          <Undo2 className="h-3.5 w-3.5" /> Anular
        </Button>
      )}
      <span
        className={cn(
          "shrink-0 font-mono text-sm font-semibold tabular-nums",
          mov.anulado ? "text-muted-foreground line-through" : sale ? "text-foreground" : entra ? "text-success" : "text-muted-foreground",
        )}
      >
        {sale ? "−" : entra ? "+" : ""}{formatMoney(mov.monto)}
      </span>
    </div>
  )
}

/** Movimientos de libre registro que la dueña puede anular (ADR 0012). */
const TIPOS_ANULABLES = ['EGRESO_OPERATIVO', 'RETIRO_PERSONAL', 'INGRESO_CAPITAL']

const TURNOS_POR_PAGINA = 7
const TURNOS_MAX = 50

/** Trae una página de turnos y las ventas de esos turnos. */
async function cargarPagina(limit: number, antesDe?: number) {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (antesDe) qs.set("antes_de", String(antesDe))
  const pagina = await apiFetch<PaginaTurnos>(`/cajas-turnos?${qs}`)
  const ventas = pagina.items.length
    ? await apiFetch<Venta[]>(`/ventas?caja_turno_id=${pagina.items.map(t => t.id).join(",")}`)
    : []
  return { pagina, ventas }
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

  // Paginación de turnos (de 7 en 7, más recientes primero)
  const [hayMas, setHayMas] = React.useState(false)
  const [cargandoMas, setCargandoMas] = React.useState(false)
  const turnosCargados = React.useRef(0)

  // Búsqueda de una venta por número (aunque su turno no esté cargado)
  const [busqueda, setBusqueda] = React.useState<BusquedaVenta>({ estado: "inactiva" })
  const [recargaKey, setRecargaKey] = React.useState(0)

  // Modal Anulacion State
  const [isAnulando, setIsAnulando] = React.useState(false)
  const [ventaAAnular, setVentaAAnular] = React.useState<number | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = React.useState("")
  const [anularLoading, setAnularLoading] = React.useState(false)
  const [anularError, setAnularError] = React.useState("")
  // Fila que se resalta 2 s tras anular o devolver
  const [resaltada, setResaltada] = React.useState<number | null>(null)
  const resaltarFila = (id: number) => {
    setResaltada(id)
    setTimeout(() => setResaltada(actual => (actual === id ? null : actual)), 2000)
  }

  // Devolución de cliente (Bloque 3.B)
  const [ventaADevolver, setVentaADevolver] = React.useState<Venta | null>(null)
  const [devolverOpen, setDevolverOpen] = React.useState(false)

  // Cierre forzado (ADMIN) — §7 Bloque 2
  const { user } = useCurrentUser()
  const esAdmin = user?.rol === "ADMIN"
  const [aAnular, setAAnular] = React.useState<AnularObjetivo | null>(null)

  const pedirAnular = (mov: MovimientoTurno) => {
    const monto = formatMoney(mov.monto)
    const entra = mov.cuenta_destino === 'GAVETA'
    const efecto = entra
      ? `Se quitarán ${monto} de la ${GAVETA.toLowerCase()} y «${mov.descripcion}» dejará de contar.`
      : mov.tipo_movimiento === 'EGRESO_OPERATIVO'
        ? `Se devolverán ${monto} a la ${GAVETA.toLowerCase()} y el gasto «${mov.descripcion}» dejará de contar.`
        : `Se devolverán ${monto} a la ${GAVETA.toLowerCase()} y el retiro «${mov.descripcion}» dejará de contar.`
    setAAnular({
      endpoint: `/movimientos-financieros/${mov.id}/anular`,
      titulo: `Anular ${rotuloMovimiento(mov).toLowerCase()}`,
      efecto: `${efecto} Queda marcado como anulado, no se borra.`,
    })
  }
  const [forzarOpen, setForzarOpen] = React.useState(false)
  const [forzarTurnoId, setForzarTurnoId] = React.useState<number | null>(null)
  const [forzarEfectivo, setForzarEfectivo] = React.useState("")
  const [forzarJustif, setForzarJustif] = React.useState("")
  const [forzarLoading, setForzarLoading] = React.useState(false)
  const [forzarError, setForzarError] = React.useState("")
  const [forzarErrorEfectivo, setForzarErrorEfectivo] = React.useState("")

  React.useEffect(() => { setMounted(true) }, [])

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      // Al recargar (tras anular/devolver) se conservan los turnos ya cargados.
      const limit = Math.min(TURNOS_MAX, Math.max(TURNOS_POR_PAGINA, turnosCargados.current))
      const { pagina, ventas: ventasData } = await cargarPagina(limit)
      setTurnos(pagina.items)
      setVentas(ventasData)
      setHayMas(pagina.hay_mas)
      turnosCargados.current = pagina.items.length
      setRecargaKey(k => k + 1)

      // Expand primary active turno if any
      const activo = pagina.items.find(t => t.estado === 'ABIERTA')
      if (activo) setExpandedTurno(activo.id)
    } catch (err: unknown) {
      const mensaje = mensajeError("cargar los movimientos", err)
      // Si ya hay lista en pantalla, no se borra: solo se avisa.
      if (turnosCargados.current > 0) toast.error(mensaje)
      else setError(mensaje)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (mounted) loadData()
  }, [mounted, loadData])

  // "Ver turnos anteriores": trae la página siguiente y la agrega abajo.
  const cargarMas = async () => {
    const ultimo = turnos[turnos.length - 1]
    if (!ultimo) return
    setCargandoMas(true)
    try {
      const { pagina, ventas: ventasNuevas } = await cargarPagina(TURNOS_POR_PAGINA, ultimo.id)
      setTurnos(prev => [...prev, ...pagina.items])
      setVentas(prev => [...prev, ...ventasNuevas])
      setHayMas(pagina.hay_mas)
      turnosCargados.current += pagina.items.length
    } catch (err: unknown) {
      toast.error(mensajeError("cargar las cajas anteriores", err))
    } finally {
      setCargandoMas(false)
    }
  }

  // Buscar una venta por número: si lo escrito es solo un número, se consulta
  // GET /ventas/:id (con espera corta para no consultar en cada tecla).
  React.useEffect(() => {
    const numero = searchTerm.trim()
    if (!/^\d{1,9}$/.test(numero)) {
      setBusqueda({ estado: "inactiva" })
      return
    }
    let cancelado = false
    setBusqueda({ estado: "cargando" })
    const espera = setTimeout(async () => {
      try {
        const venta = await apiFetch<Venta>(`/ventas/${numero}`)
        const turno = await apiFetch<CajaTurno>(`/cajas-turnos/${venta.caja_turno_id}`)
        if (cancelado) return
        setBusqueda({ estado: "ok", venta, turno })
        setExpandedVenta(venta.id)
      } catch (err: unknown) {
        if (cancelado) return
        setBusqueda(
          tipoDeError(err) === "no_encontrado"
            ? { estado: "no_existe", numero }
            : { estado: "error", mensaje: mensajeError("buscar la venta", err) },
        )
      }
    }, 400)
    return () => {
      cancelado = true
      clearTimeout(espera)
    }
  }, [searchTerm, recargaKey])

  // Filtrado de turnos (los cargados)
  const filteredTurnos = React.useMemo(() => {
    let base = turnos

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      base = base.filter(turno => {
        const matchId = String(turno.id).includes(searchLower)
        const matchDate = formatFecha(turno.fecha_apertura, "con hora").toLowerCase().includes(searchLower)
        const matchEstado = turno.estado.toLowerCase().includes(searchLower) || etiquetaEstado(turno.estado).toLowerCase().includes(searchLower)
        const matchMov = movimientosDeDinero(turno).some(m => m.descripcion.toLowerCase().includes(searchLower))
        return matchId || matchDate || matchEstado || matchMov
      })
    }

    return base
  }, [turnos, searchTerm])

  const ventasFiltradas = ventas.filter(v => filteredTurnos.some(t => t.id === v.caja_turno_id))
  // Solo sumamos ventas que no estén anuladas, y descontamos lo devuelto
  const ventasCompletadas = ventasFiltradas.filter(v => v.estado === 'COMPLETADA')
  const vendidoCentavos = ventasCompletadas.reduce((acc, v) => acc + montoACentavos(v.total), 0)
  const devueltoCentavos = ventasCompletadas.reduce(
    (acc, v) => acc + (v.devoluciones ?? []).reduce((a, d) => a + montoACentavos(d.total_reembolsado), 0),
    0,
  )
  const ingresosPeriodo = centavosAMonto(vendidoCentavos - devueltoCentavos)

  const turnosCerradosPeriodo = filteredTurnos.filter(t => estaCerrado(t.estado))
  const descuadreTotal = turnosCerradosPeriodo.reduce((acc, t) => acc + parseFloat(t.diferencia || "0"), 0)
  const textoDia = (t: CajaTurno) => formatFecha(t.fecha_apertura)
  const primerTurno = filteredTurnos[filteredTurnos.length - 1] // el más viejo cargado
  const ultimoTurno = filteredTurnos[0] // el más reciente
  const rangoFechas = primerTurno && ultimoTurno
    ? textoDia(primerTurno) === textoDia(ultimoTurno)
      ? textoDia(primerTurno)
      : `del ${textoDia(primerTurno)} al ${textoDia(ultimoTurno)}`
    : ""
  const cajaActiva = turnos.find(t => t.estado === 'ABIERTA')

  // Helper para obtener las ventas de un turno
  const getVentasDelTurno = (turnoId: number) => {
    return ventas.filter(v => v.caja_turno_id === turnoId)
  }

  const handleAnularVenta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ventaAAnular || !motivoAnulacion.trim()) return

    setAnularLoading(true)
    setAnularError("")
    try {
      await apiFetch(`/ventas/${ventaAAnular}/anular`, {
        method: "PATCH",
        body: JSON.stringify({ justificacion_nula: motivoAnulacion.trim() })
      })
      const id = ventaAAnular
      setIsAnulando(false)
      setMotivoAnulacion("")
      setVentaAAnular(null)
      toast.success(`Venta ${formatNumeroVenta(id)} anulada`)
      resaltarFila(id)
      await loadData() // recarga todo (ventas y saldos de caja)
    } catch (err: unknown) {
      // El diálogo sigue abierto con el motivo escrito, para reintentar.
      setAnularError(mensajeError("anular la venta", err))
    } finally {
      setAnularLoading(false)
    }
  }

  const handleForzarCierre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!forzarTurnoId || !forzarJustif.trim()) return
    const efectivoParsed = parseFloat(forzarEfectivo)
    if (isNaN(efectivoParsed) || efectivoParsed < 0) {
      setForzarErrorEfectivo("Escribe el efectivo que contaste (desde $0).")
      return
    }
    setForzarLoading(true)
    setForzarError("")
    setForzarErrorEfectivo("")
    try {
      await apiFetch(`/cajas-turnos/${forzarTurnoId}/cerrar-forzado`, {
        method: "PATCH",
        body: JSON.stringify({
          efectivo_declarado: efectivoParsed,
          observaciones: forzarJustif.trim(),
        }),
      })
      setForzarOpen(false)
      setForzarTurnoId(null)
      setForzarEfectivo("")
      setForzarJustif("")
      toast.success("Caja cerrada")
      await loadData()
    } catch (err: unknown) {
      setForzarError(mensajeError("cerrar la caja", err))
    } finally {
      setForzarLoading(false)
    }
  }

  // Tono de lo que faltó o sobró al cerrar
  const getDiferenciaTone = (diferencia: string | null): "success" | "destructive" | "muted" => {
    if (!diferencia) return "muted"
    const val = parseFloat(diferencia)
    if (val > 0) return "success"
    if (val < 0) return "destructive"
    return "muted"
  }

  // Fila de una venta (con su desglose y acciones). La usan la lista de turnos y el resultado de buscar por número.
  const renderVenta = (venta: Venta, turnoAbierto: boolean) => {
    const isVentaExpanded = expandedVenta === venta.id
    const totalProductos = venta.detalle_ventas.length
    const anulada = venta.estado === 'ANULADA'

    return (
      <div key={venta.id} className={cn("border-b border-border transition-colors duration-500 last:border-0", resaltada === venta.id && "bg-primary/10")}>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
          onClick={() => setExpandedVenta(isVentaExpanded ? null : venta.id)}
          aria-expanded={isVentaExpanded}
        >
          <div className="w-6 shrink-0">
            {isVentaExpanded ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="w-24 font-mono text-sm text-muted-foreground">{formatNumeroVenta(venta.id)}</div>
          <div className="hidden w-28 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Clock className="h-3.5 w-3.5 opacity-60" />
            {formatFecha(venta.fecha, "hora")}
          </div>
          <div className="hidden w-24 text-right sm:block">
            <StatePill tone="muted">{totalProductos} {totalProductos === 1 ? "producto" : "productos"}</StatePill>
          </div>
          <div className="flex flex-1 items-center justify-end gap-2">
            {anulada && <StatePill tone="destructive">Anulada</StatePill>}
            <MoneyValue value={venta.total} tone={anulada ? "muted" : "success"} className={cn("text-sm font-semibold", anulada && "line-through")} />
          </div>
        </button>

        {/* Detalle de productos */}
        {isVentaExpanded && (
          <div className="border-l-2 border-primary/30 bg-background/40 px-4 py-3 sm:ml-6">
            <SeccionTitulo className="mb-2">Productos de la venta</SeccionTitulo>
            {venta.usuarios?.nombre && (
              <p className="mb-2 text-xs text-muted-foreground">Vendió: {venta.usuarios.nombre}</p>
            )}
            <div className="flex flex-col gap-2">
              {venta.detalle_ventas.map(detalle => (
                <div key={detalle.id} className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-3 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-muted text-muted-foreground">
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{detalle.presentaciones
                          ? [detalle.presentaciones.productos?.nombre, detalle.presentaciones.descripcion].filter(Boolean).join(" · ")
                          : `Producto ID #${detalle.presentacion_id}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCantidad(detalle.cantidad)} unidades · <MoneyValue value={aNumero(detalle.subtotal) / (aNumero(detalle.cantidad) || 1)} tone="muted" className="text-xs" /> c/u
                      </p>
                    </div>
                  </div>
                  <MoneyValue value={detalle.subtotal} className="font-semibold" />
                </div>
              ))}
            </div>

            {/* Devolver / Anular */}
            {venta.estado === 'COMPLETADA' && (
              <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={() => { setVentaADevolver(venta); setDevolverOpen(true) }}
                >
                  <Undo2 className="h-4 w-4" /> Devolver
                </Button>
                {(venta._count?.devoluciones ?? 0) > 0 && (
                  <p className="self-center text-xs text-muted-foreground">
                    Ya tiene devoluciones — puedes devolver el resto
                  </p>
                )}
                {!turnoAbierto && (venta._count?.devoluciones ?? 0) === 0 && (
                  <p className="self-center text-xs text-muted-foreground">
                    Es de una caja ya cerrada: no se puede anular, solo devolver
                  </p>
                )}
                {turnoAbierto && (venta._count?.devoluciones ?? 0) === 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => { setVentaAAnular(venta.id); setAnularError(""); setIsAnulando(true) }}
                  >
                    <XCircle className="h-4 w-4" /> Anular venta
                  </Button>
                )}
              </div>
            )}
            {venta.estado === 'ANULADA' && venta.justificacion_nula && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="rounded-sm border border-destructive/20 bg-destructive/5 p-3 text-xs">
                  <p className="mb-1 font-medium text-destructive">
                    Motivo de anulación{venta.anulada_por?.nombre ? ` (anuló ${venta.anulada_por.nombre})` : ""}:
                  </p>
                  <p className="text-muted-foreground">{venta.justificacion_nula}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  if (!mounted) return <EsqueletoPagina />

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8 lg:py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Ventas y turnos</h1>
            <p className="text-xs text-muted-foreground">Lo que se vendió y el dinero que entró o salió, caja por caja</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar caja, gasto o número de venta…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button aria-label="Actualizar movimientos" variant="outline" size="icon" onClick={loadData} disabled={loading} className="shrink-0">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <StatCard
              label="Caja de hoy"
              icon={cajaActiva ? DoorOpen : DoorClosed}
              value={cajaActiva ? "Abierta" : "Cerrada"}
              tone={cajaActiva ? "success" : "muted"}
              hint={cajaActiva ? <>Empezó con: <MoneyValue value={cajaActiva.fondo_inicial} tone="muted" className="text-xs" /></> : undefined}
              className={cn("order-2 md:order-1", cajaActiva && "border-success/30")}
            />

            <StatCard
              label={filteredTurnos.length === 1 ? "Vendido (última caja)" : `Vendido (últimas ${filteredTurnos.length} cajas)`}
              className="order-1 col-span-2 md:order-2"
              value={formatMoney(ingresosPeriodo)}
              tone="success"
              hint={`${rangoFechas ? `${rangoFechas} · ` : ""}${ventasCompletadas.length} ${ventasCompletadas.length === 1 ? "venta" : "ventas"}${devueltoCentavos > 0 ? ` · ya sin ${formatMoney(centavosAMonto(devueltoCentavos))} devueltos` : ""}`}
            />

            <StatCard
              label="Faltó o sobró al cerrar"
              className="order-3"
              value={
                turnosCerradosPeriodo.length === 0
                  ? "Aún sin cierres"
                  : Math.abs(descuadreTotal) < 0.005
                    ? "Cuadraron"
                    : `${descuadreTotal > 0 ? TERMINOS.sobro : TERMINOS.falto} ${formatMoney(Math.abs(descuadreTotal))}`
              }
              tone={
                turnosCerradosPeriodo.length === 0 || Math.abs(descuadreTotal) < 0.005
                  ? "muted"
                  : descuadreTotal > 0 ? "success" : "destructive"
              }
            />
          </div>

          {/* Resultado de buscar una venta por número */}
          {busqueda.estado === "cargando" && (
            <p className="text-sm text-muted-foreground">Buscando la venta…</p>
          )}
          {busqueda.estado === "no_existe" && (
            <div className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">
              No hay una venta con el número {busqueda.numero}
            </div>
          )}
          {busqueda.estado === "error" && (
            <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {busqueda.mensaje}
            </div>
          )}
          {busqueda.estado === "ok" && (
            <div className="overflow-hidden rounded-sm border border-primary/40 bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-sm">
                <Search className="h-4 w-4 text-primary" />
                <span className="font-semibold">Venta {formatNumeroVenta(busqueda.venta.id)}</span>
                <span className="text-muted-foreground">· Caja #{busqueda.turno.id}</span>
                <StatePill tone={busqueda.turno.estado === 'ABIERTA' ? "success" : busqueda.turno.estado === 'CERRADA_FORZADA' ? "warning" : "muted"}>
                  {etiquetaEstado(busqueda.turno.estado)}
                </StatePill>
                <span className="text-xs text-muted-foreground">
                  {formatFecha(busqueda.venta.fecha, "con hora")}
                </span>
              </div>
              {renderVenta(busqueda.venta, busqueda.turno.estado === 'ABIERTA')}
            </div>
          )}

          {/* Lista de Turnos */}
          {error ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-destructive/20 bg-destructive/10 p-6 text-center text-destructive">
              <XCircle className="h-9 w-9 text-destructive/70" />
              <p className="font-medium">{error}</p>
              <Button variant="outline" onClick={loadData} disabled={loading} className="gap-2">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Reintentar
              </Button>
            </div>
          ) : loading && turnos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Cargando historial…</p>
            </div>
          ) : filteredTurnos.length === 0 ? (
            busqueda.estado !== "inactiva" ? null : hayMas ? (
              <div className="flex flex-col items-center gap-3 rounded-sm border border-dashed border-border py-12 text-muted-foreground">
                <p className="text-sm">Ninguna caja cargada coincide con la búsqueda.</p>
                <Button variant="outline" onClick={cargarMas} disabled={cargandoMas} className="gap-2">
                  {cargandoMas && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Ver cajas anteriores
                </Button>
              </div>
            ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-sm border border-dashed border-border py-24 text-muted-foreground">
              <Filter className="h-10 w-10 opacity-20" />
              <p className="text-sm font-medium text-foreground">No hay cajas para mostrar</p>
            </div>
            )
          ) : (
            <div className="flex flex-col gap-3">
              {filteredTurnos.map(turno => {
                const isExpanded = expandedTurno === turno.id
                const ventasDelTurno = getVentasDelTurno(turno.id)
                const ventasCompletadasTurno = ventasDelTurno.filter(v => v.estado === 'COMPLETADA')
                const vendidoTurno = ventasCompletadasTurno.reduce((acc, v) => acc + montoACentavos(v.total), 0)
                const diferenciaTurno = parseFloat(turno.diferencia || "0")
                const isAbierta = turno.estado === 'ABIERTA'

                return (
                  <div key={turno.id} className={cn("overflow-hidden rounded-sm border bg-card transition-colors", isExpanded ? "border-primary/40" : "border-border")}>
                    {/* Header del Turno */}
                    <button
                      type="button"
                      className="flex w-full flex-col gap-4 p-4 text-left transition-colors hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
                      onClick={() => setExpandedTurno(isExpanded ? null : turno.id)}
                      aria-expanded={isExpanded}
                    >
                      <div className="flex min-w-0 items-center gap-3 md:w-72">
                        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border", isAbierta ? "border-success/30 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground")}>
                          {isAbierta ? <DoorOpen className="h-5 w-5" /> : <DoorClosed className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Caja #{turno.id}</h3>
                            <StatePill tone={isAbierta ? "success" : turno.estado === 'CERRADA_FORZADA' ? "warning" : "muted"}>{etiquetaEstado(turno.estado)}</StatePill>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatFecha(turno.fecha_apertura)}
                            <Clock className="ml-1 h-3.5 w-3.5" />
                            {formatFecha(turno.fecha_apertura, "hora")}
                            {turno.fecha_cierre && <>→ {formatFecha(turno.fecha_cierre, "hora")}</>}
                          </div>
                          {(turno.usuarios?.nombre || turno.cerrado_por?.nombre) && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {turno.usuarios?.nombre && <>Abrió: {turno.usuarios.nombre}</>}
                              {turno.usuarios?.nombre && turno.cerrado_por?.nombre && " · "}
                              {turno.cerrado_por?.nombre && <>Cerró: {turno.cerrado_por.nombre}</>}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Resumen de totales */}
                      <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Empezó con</p>
                          <MoneyValue value={turno.fondo_inicial} className="text-sm" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Vendido · {ventasCompletadasTurno.length} {ventasCompletadasTurno.length === 1 ? "venta" : "ventas"}
                          </p>
                          <MoneyValue value={centavosAMonto(vendidoTurno)} tone="success" className="text-sm font-medium" />
                        </div>
                        {estaCerrado(turno.estado) ? (
                          <>
                            <div>
                              <p className="text-xs text-muted-foreground">Debía haber</p>
                              <MoneyValue value={turno.efectivo_esperado || "0"} className="text-sm" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{TERMINOS.loQueConto}</p>
                              <MoneyValue value={turno.efectivo_declarado || "0"} className="text-sm" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {diferenciaTurno > 0 ? "Sobró" : diferenciaTurno < 0 ? "Faltó" : "Resultado"}
                              </p>
                              <div className={cn("flex items-center gap-1 font-mono text-sm font-semibold tabular-nums",
                                getDiferenciaTone(turno.diferencia) === "success" ? "text-success" : getDiferenciaTone(turno.diferencia) === "destructive" ? "text-destructive" : "text-muted-foreground")}>
                                {diferenciaTurno > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : diferenciaTurno < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : null}
                                {diferenciaTurno === 0 ? <span className="font-sans">Cuadró</span> : formatMoney(Math.abs(diferenciaTurno))}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="col-span-2 flex items-center text-sm text-muted-foreground md:col-span-3 md:justify-end">
                            Caja abierta ahora
                          </div>
                        )}
                      </div>

                      <div className="hidden shrink-0 md:block">
                        {isExpanded ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                      </div>
                    </button>

                    {isAbierta && esAdmin && esTurnoViejo(turno.fecha_apertura) && (
                      <div className="flex items-center justify-between gap-2 border-t border-border bg-warning/5 px-4 py-2">
                        <span className="text-xs text-muted-foreground">¿Caja abandonada sin cerrar?</span>
                        <Button
                          variant="warning"
                          size="sm"
                          className="gap-2"
                          onClick={() => {
                            setForzarTurnoId(turno.id)
                            setForzarEfectivo("")
                            setForzarJustif("")
                            setForzarError("")
                            setForzarErrorEfectivo("")
                            setForzarOpen(true)
                          }}
                        >
                          <DoorClosed className="h-4 w-4" /> Cerrar forzado
                        </Button>
                      </div>
                    )}

                    {/* Ventas Expanded */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/20">
                        {estaCerrado(turno.estado) && turno.observaciones?.trim() && (
                          <div className="border-b border-border px-4 py-3">
                            <div className="rounded-sm border border-border bg-card p-3 text-sm">
                              <p className="mb-1 text-xs font-medium text-muted-foreground">
                                {turno.estado === 'CERRADA_FORZADA'
                                  ? `Por qué se cerró a la fuerza${turno.cerrado_por?.nombre ? ` (${turno.cerrado_por.nombre})` : ""}:`
                                  : `Lo que escribió ${turno.cerrado_por?.nombre ?? turno.usuarios?.nombre ?? "quien cerró"} al cerrar:`}
                              </p>
                              <p>«{turno.observaciones.trim()}»</p>
                            </div>
                          </div>
                        )}
                        {/* Dinero que se movió en el turno (UX-12) */}
                        <div className="border-b border-border">
                          <SeccionTitulo className="px-4 pt-3">Dinero que se movió en esta caja</SeccionTitulo>
                          {movimientosDeDinero(turno).length === 0 ? (
                            <p className="px-4 py-3 text-sm text-muted-foreground">
                              No hubo gastos ni otros movimientos de dinero.
                            </p>
                          ) : (
                            <div className="mt-1">
                              {movimientosDeDinero(turno).map(mov => (
                                <MovimientoFila
                                  key={mov.id}
                                  mov={mov}
                                  onAnular={
                                    esAdmin && isAbierta && !mov.anulado &&
                                    TIPOS_ANULABLES.includes(mov.tipo_movimiento) && !mov.es_apertura
                                      ? pedirAnular
                                      : undefined
                                  }
                                  motivoNoAnular={
                                    esAdmin && !isAbierta && !mov.anulado &&
                                    TIPOS_ANULABLES.includes(mov.tipo_movimiento) && !mov.es_apertura
                                      ? MOTIVO_TURNO_CERRADO
                                      : undefined
                                  }
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <SeccionTitulo className="px-4 pt-3">Ventas de esta caja</SeccionTitulo>
                        {/* Cabecera de la tabla de ventas (desktop) */}
                        <div className="hidden items-center border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:flex">
                          <div className="w-6" />
                          <div className="w-24">Venta</div>
                          <div className="w-28">Hora</div>
                          <div className="w-24 text-right">Productos</div>
                          <div className="flex-1 text-right">Total</div>
                        </div>

                        {ventasDelTurno.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                            <ShoppingCart className="h-6 w-6 opacity-30" />
                            <p className="text-sm">No se registraron ventas en esta caja.</p>
                          </div>
                        ) : (
                          <div>
                            {ventasDelTurno.map(venta => renderVenta(venta, isAbierta))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {hayMas && (
                <Button variant="outline" onClick={cargarMas} disabled={cargandoMas} className="gap-2 self-center">
                  {cargandoMas && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Ver cajas anteriores
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <AnularDialog objetivo={aAnular} onClose={() => setAAnular(null)} onHecho={loadData} />

      {/* ════════ DIALOG: ANULAR VENTA ════════ */}
      <Dialog open={isAnulando} onOpenChange={setIsAnulando}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" /> Anular venta {ventaAAnular !== null && formatNumeroVenta(ventaAAnular)}
            </DialogTitle>
            <DialogDescription>
              Se devuelve el producto al inventario y se quita el dinero de la gaveta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAnularVenta} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="movimientos-motivo-de-la-anulacion" className="text-xs font-medium text-muted-foreground">Motivo de la anulación (obligatorio)</Label>
              <Input id="movimientos-motivo-de-la-anulacion" value={motivoAnulacion}
                onChange={(e) => setMotivoAnulacion(e.target.value)}
                aria-invalid={!!anularError}
                aria-describedby={anularError ? "movimientos-anular-error" : undefined}
                placeholder="Ej. El cliente devolvió el producto empacado"
                autoFocus />
              {anularError && <CampoError id="movimientos-anular-error">{anularError}</CampoError>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAnulando(false)} disabled={anularLoading}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive-solid" disabled={anularLoading || !motivoAnulacion.trim()} className="gap-2">
                {anularLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Confirmar anulación
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════ DIALOG: CIERRE FORZADO (ADMIN) ════════ */}
      <Dialog open={forzarOpen} onOpenChange={setForzarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning-text">
              <DoorClosed className="h-5 w-5" /> Cerrar forzado la caja #{forzarTurnoId}
            </DialogTitle>
            <DialogDescription>
              Solo la dueña. Cuenta el efectivo que hay de verdad en la gaveta y explica por qué cierras tú la caja.
              Quedará marcada como <strong className="text-foreground">cerrada a la fuerza</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForzarCierre} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="movimientos-efectivo-contado" className="text-xs font-medium text-muted-foreground">Efectivo que contaste</Label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xl text-muted-foreground">$</span>
                <Input id="movimientos-efectivo-contado" type="number" min={0} step="0.01" inputMode="decimal"
                  value={forzarEfectivo} onChange={(e) => { setForzarEfectivo(e.target.value); setForzarErrorEfectivo("") }}
                  aria-invalid={!!forzarErrorEfectivo}
                  aria-describedby={forzarErrorEfectivo ? "movimientos-efectivo-error" : undefined}
                  placeholder="0.00" size="lg" className="text-center font-mono text-xl font-bold tabular-nums" autoFocus />
              </div>
              {forzarErrorEfectivo && <CampoError id="movimientos-efectivo-error">{forzarErrorEfectivo}</CampoError>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="movimientos-justificacion" className="text-xs font-medium text-muted-foreground">¿Por qué la cierras tú? (obligatorio)</Label>
              <Input id="movimientos-justificacion" value={forzarJustif} onChange={(e) => setForzarJustif(e.target.value)}
                aria-invalid={!!forzarError}
                aria-describedby={forzarError ? "movimientos-forzar-error" : undefined}
                placeholder="Ej. La cajera se retiró sin cerrar" />
              {forzarError && <CampoError id="movimientos-forzar-error">{forzarError}</CampoError>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForzarOpen(false)} disabled={forzarLoading}>
                Cancelar
              </Button>
              <Button type="submit" variant="warning" disabled={forzarLoading || !forzarJustif.trim()} className="gap-2">
                {forzarLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <DoorClosed className="h-4 w-4" />}
                Cerrar forzado
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════ DIALOG: DEVOLUCIÓN DE CLIENTE (3.B) ════════ */}
      <DevolucionDialog
        venta={ventaADevolver}
        open={devolverOpen}
        onOpenChange={setDevolverOpen}
        onDone={() => { if (ventaADevolver) resaltarFila(ventaADevolver.id); loadData() }}
      />
    </div>
  )
}
