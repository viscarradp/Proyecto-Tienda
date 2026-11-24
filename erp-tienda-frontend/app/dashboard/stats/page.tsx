"use client"

import { useState, useEffect, useCallback } from "react"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  AlertTriangle,
  Package,
  Calendar,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Vault,
  Plus,
  Check,
  ClipboardCheck,
  Wallet,
  Landmark,
  Scale,
  ArrowRightLeft,
  type LucideIcon,
} from "lucide-react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MoneyValue } from "@/components/money-value"
import { StatePill } from "@/components/state-pill"
import { formatMoney, formatCantidad, montoACentavos, centavosAMonto } from "@/lib/format"
import { apiFetch } from "@/lib/api"
import { BOVEDA, GAVETA, GAVETA_AYUDA, BOVEDA_AYUDA, ETIQUETAS_REPORTE as ET } from "@/lib/glosario"

/* ─────────────── Types ─────────────── */
interface EstadoResultados {
  periodo: { desde: string; hasta: string }
  ingreso_bruto_ventas: string
  devoluciones: string
  costo_de_ventas_fifo: string
  utilidad_bruta: string
  margen_bruto_porcentaje: string
  gastos_operativos: string
  mermas_inventario: string
  faltantes: string
  sobrantes: string
  utilidad_neta: string
  retiros_duenos: string
  total_ventas_completadas: number
  total_ventas_anuladas: number
  ticket_promedio: string
}

interface ProductoTop {
  producto_id: number
  nombre: string
  unidades_vendidas: number
  ingreso: string
  costo_fifo: string
  margen: string
  margen_porcentaje: string
}

interface CajaGeneralSaldo {
  saldo_actual: string
  total_depositos: number
}

interface Patrimonio {
  inventario: string
  efectivo: { gaveta: string; boveda: string; total: string }
  activos_fijos: string
  deudas: string
  patrimonio_neto: string
}

interface FlujoCuenta {
  entradas: string
  salidas: string
  neto: string
}
interface FlujoEfectivo {
  ventas_efectivo: string
  gaveta: FlujoCuenta
  boveda: FlujoCuenta
}

/* ─────────────── Helpers ─────────────── */
type Tone = "success" | "destructive" | "warning" | "primary" | "muted"
type MarginTone = "success" | "warning" | "destructive"

const marginTone = (margenPct: number): MarginTone =>
  margenPct >= 25 ? "success" : margenPct >= 10 ? "warning" : "destructive"

const toneText: Record<Tone, string> = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning-text",
  primary: "text-primary",
  muted: "text-foreground",
}
const toneChartVar: Record<Tone, string> = {
  success: "var(--success)",
  destructive: "var(--destructive)",
  warning: "var(--warning)",
  primary: "var(--primary)",
  muted: "var(--muted-foreground)",
}

type Periodo = "hoy" | "semana" | "mes" | "todo"

/** Umbral desde el cual el backend exige explicar un descuadre de la bóveda. */
const UMBRAL_EXPLICACION_CENT = 100

function getPeriodoDates(periodo: Periodo): { desde: string; hasta: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  const hasta = `${y}-${m}-${d}`

  switch (periodo) {
    case "hoy":
      return { desde: hasta, hasta }
    case "semana": {
      const weekAgo = new Date(now)
      weekAgo.setDate(weekAgo.getDate() - 6) // últimos 7 días contando hoy
      const wy = weekAgo.getFullYear()
      const wm = String(weekAgo.getMonth() + 1).padStart(2, "0")
      const wd = String(weekAgo.getDate()).padStart(2, "0")
      return { desde: `${wy}-${wm}-${wd}`, hasta }
    }
    case "mes":
      return { desde: `${y}-${m}-01`, hasta }
    case "todo":
      return { desde: "2020-01-01", hasta }
  }
}

const periodoLabels: Record<Periodo, string> = {
  hoy: "Hoy",
  semana: "7 días",
  mes: "Este mes",
  todo: "Historial",
}

/** Inicio de la frase de cabecera según el período. */
const periodoFrase: Record<Periodo, string> = {
  hoy: "Hoy",
  semana: "En los últimos 7 días",
  mes: "Este mes",
  todo: "Desde que empezaste",
}

/* ─────────────── Main Component ─────────────── */
export default function StatsPage() {
  const [periodo, setPeriodo] = useState<Periodo>("mes")
  const [estado, setEstado] = useState<EstadoResultados | null>(null)
  const [productos, setProductos] = useState<ProductoTop[]>([])
  const [saldoBoveda, setSaldoBoveda] = useState<CajaGeneralSaldo | null>(null)
  const [patrimonio, setPatrimonio] = useState<Patrimonio | null>(null)
  const [flujo, setFlujo] = useState<FlujoEfectivo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Bóveda inicial (asistente de arranque)
  const [bovedaInicial, setBovedaInicial] = useState("")
  const [bovedaInicialLoading, setBovedaInicialLoading] = useState(false)

  // Bóveda: poner dinero / contar
  const [dialogo, setDialogo] = useState<"poner" | "contar" | null>(null)
  const [ponerMonto, setPonerMonto] = useState("")
  const [ponerDesc, setPonerDesc] = useState("")
  const [ponerLoading, setPonerLoading] = useState(false)
  const [contarMonto, setContarMonto] = useState("")
  const [contarMotivo, setContarMotivo] = useState("")
  const [contarLoading, setContarLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { desde, hasta } = getPeriodoDates(periodo)
      const qs = `desde=${desde}&hasta=${hasta}`

      const [estadoRes, productosRes, saldoRes, patrimonioRes, flujoRes] = await Promise.all([
        apiFetch(`/reportes/estado-resultados?${qs}`) as Promise<EstadoResultados>,
        apiFetch(`/reportes/productos-top?${qs}&limit=15`) as Promise<ProductoTop[]>,
        apiFetch(`/caja-general/saldo`) as Promise<CajaGeneralSaldo>,
        apiFetch(`/reportes/patrimonio`) as Promise<Patrimonio>,
        apiFetch(`/reportes/flujo-efectivo?${qs}`) as Promise<FlujoEfectivo>,
      ])

      setEstado(estadoRes)
      // Un producto devuelto por completo queda en cero: no aporta nada a la lista
      setProductos(productosRes.filter(p => p.unidades_vendidas !== 0 || parseFloat(p.ingreso) !== 0))
      setSaldoBoveda(saldoRes)
      setPatrimonio(patrimonioRes)
      setFlujo(flujoRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los números. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Vendido = ventas − devoluciones (centavos enteros, sin ruido decimal)
  const ingresoNeto = estado
    ? centavosAMonto(montoACentavos(estado.ingreso_bruto_ventas) - montoACentavos(estado.devoluciones))
    : 0

  const chartData = productos.slice(0, 8).map(p => ({
    nombre: p.nombre.length > 16 ? p.nombre.slice(0, 15) + "…" : p.nombre,
    ingreso: parseFloat(p.ingreso),
    tone: marginTone(parseFloat(p.margen_porcentaje)),
  }))

  // Asistente de bóveda inicial (NEG-12): crea el INGRESO_CAPITAL de arranque con el
  // mismo endpoint de inyección. Desaparece solo cuando la bóveda ya tiene movimientos.
  const handleBovedaInicial = async () => {
    const monto = parseFloat(bovedaInicial)
    if (isNaN(monto) || monto <= 0) {
      toast.error("Escribe un monto mayor a $0")
      return
    }
    setBovedaInicialLoading(true)
    try {
      await apiFetch("/caja-general/inyeccion", {
        method: "POST",
        body: JSON.stringify({ monto, descripcion: "Efectivo guardado al empezar a usar el sistema" }),
      })
      toast.success(`Listo: la ${BOVEDA.toLowerCase()} empieza con ${formatMoney(monto)}`)
      setBovedaInicial("")
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo.")
    } finally {
      setBovedaInicialLoading(false)
    }
  }

  const bovedaSinMovimientos =
    saldoBoveda !== null && saldoBoveda.total_depositos === 0 && parseFloat(saldoBoveda.saldo_actual) === 0

  const abrirDialogo = (cual: "poner" | "contar") => {
    setPonerMonto("")
    setPonerDesc("")
    setContarMonto("")
    setContarMotivo("")
    setDialogo(cual)
  }

  const handlePoner = async (e: React.FormEvent) => {
    e.preventDefault()
    const monto = parseFloat(ponerMonto)
    if (isNaN(monto) || monto <= 0) {
      toast.error("Escribe un monto mayor a $0")
      return
    }
    setPonerLoading(true)
    try {
      await apiFetch("/caja-general/inyeccion", {
        method: "POST",
        body: JSON.stringify({ monto, descripcion: ponerDesc.trim() || undefined }),
      })
      toast.success(`Pusiste ${formatMoney(monto)} en la ${BOVEDA.toLowerCase()}`)
      setDialogo(null)
      fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar. Intenta de nuevo.")
    } finally {
      setPonerLoading(false)
    }
  }

  // Cuenta de la bóveda: la diferencia se calcula con centavos enteros y se muestra antes de confirmar.
  const saldoCent = saldoBoveda ? montoACentavos(saldoBoveda.saldo_actual) : 0
  const contadoNum = parseFloat(contarMonto)
  const contadoValido = contarMonto !== "" && !isNaN(contadoNum) && contadoNum >= 0
  const difCent = contadoValido ? montoACentavos(contadoNum) - saldoCent : 0
  const requiereMotivo = contadoValido && Math.abs(difCent) >= UMBRAL_EXPLICACION_CENT

  const handleContar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contadoValido) return
    setContarLoading(true)
    try {
      const res = await apiFetch<{ diferencia: string | number }>("/caja-general/arqueo", {
        method: "POST",
        body: JSON.stringify({
          saldo_declarado: contadoNum,
          justificacion: contarMotivo.trim() || undefined,
        }),
      })
      const dif = Number(res.diferencia)
      if (dif === 0) toast.success(`La ${BOVEDA.toLowerCase()} cuadra: tienes ${formatMoney(contadoNum)}`)
      else
        toast.success(
          `Anotado: ${dif < 0 ? "faltaban" : "sobraban"} ${formatMoney(Math.abs(dif))}. La ${BOVEDA.toLowerCase()} quedó en ${formatMoney(contadoNum)}`,
        )
      setDialogo(null)
      fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el conteo. Intenta de nuevo.")
    } finally {
      setContarLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8 lg:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight lg:text-xl">¿Cómo va el negocio?</h1>
            <p className="text-xs text-muted-foreground">Cuánto ganas, cuánto vendes y dónde está tu dinero</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-sm border border-border bg-muted/50 p-1">
              {(["hoy", "semana", "mes", "todo"] as Periodo[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  aria-pressed={periodo === p}
                  className={cn(
                    "min-h-11 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors md:min-h-0",
                    periodo === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {periodoLabels[p]}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchData}
              disabled={loading}
              aria-label="Actualizar números"
              className="size-11 md:size-9 shrink-0"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4 lg:px-8 lg:py-6">
        {error && (
          <div className="flex items-center gap-2 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {loading && !estado && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {estado && (
          <>
            {/* Asistente de bóveda inicial */}
            {bovedaSinMovimientos && (
              <div className="rounded-sm border border-primary/30 bg-primary/5 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Vault className="h-4 w-4" /> ¿Cuánto efectivo tienes guardado fuera de la gaveta hoy?
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Así la {BOVEDA.toLowerCase()} empieza con lo que de verdad tienes y los pagos desde ella cuadran.
                  Si no tienes nada guardado, ignora este aviso.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Input
                    type="number" min={0.01} step="0.01" inputMode="decimal"
                    value={bovedaInicial} onChange={(e) => setBovedaInicial(e.target.value)}
                    placeholder="0.00" aria-label="Efectivo guardado" className="h-11 md:h-11 w-40 font-mono"
                  />
                  <Button onClick={handleBovedaInicial} disabled={bovedaInicialLoading || !bovedaInicial} className="h-11 md:h-11 gap-2">
                    {bovedaInicialLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Guardar
                  </Button>
                </div>
              </div>
            )}

            {/* Cabecera: ¿estoy ganando? en una frase */}
            <Cabecera estado={estado} periodo={periodo} vendido={ingresoNeto} />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPICard
                label={ET.ganancia}
                ayuda="Lo que te queda después de pagar todo."
                value={formatMoney(estado.utilidad_neta)}
                icon={parseFloat(estado.utilidad_neta) >= 0 ? TrendingUp : TrendingDown}
                tone={parseFloat(estado.utilidad_neta) >= 0 ? "success" : "destructive"}
              />
              <KPICard
                label={ET.vendido}
                ayuda="Lo que cobraste, sin contar lo devuelto."
                value={formatMoney(ingresoNeto)}
                icon={DollarSign}
                tone="primary"
              />
              <KPICard
                label={ET.costoVendido}
                ayuda="Lo que pagaste por la mercadería que vendiste."
                value={formatMoney(estado.costo_de_ventas_fifo)}
                icon={Package}
                tone="warning"
              />
              <KPICard
                label={ET.gananciaPor100}
                ayuda="Antes de pagar gastos."
                value={formatMoney(estado.margen_bruto_porcentaje)}
                icon={parseFloat(estado.margen_bruto_porcentaje) >= 0 ? ArrowUpRight : ArrowDownRight}
                tone={parseFloat(estado.margen_bruto_porcentaje) >= 15 ? "success" : "destructive"}
              />
              <KPICard
                label="Compra promedio"
                ayuda="Lo que gasta en promedio cada cliente."
                value={formatMoney(estado.ticket_promedio)}
                icon={ShoppingCart}
                tone="primary"
              />
            </div>

            {/* Bóveda */}
            {saldoBoveda && (
              <section aria-labelledby="titulo-boveda" className="rounded-sm border border-border bg-card p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h2 id="titulo-boveda" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <Vault className="h-4 w-4" /> {BOVEDA}
                    </h2>
                    <MoneyValue
                      value={saldoBoveda.saldo_actual}
                      tone={parseFloat(saldoBoveda.saldo_actual) >= 0 ? "success" : "destructive"}
                      className="mt-1 block text-3xl font-bold tracking-tight"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {parseFloat(saldoBoveda.saldo_actual) < 0
                        ? `El sistema cree que hay menos de lo que sacaste: falta registrar efectivo. Cuenta la ${BOVEDA.toLowerCase()} o pon dinero.`
                        : `El dinero que guardas aparte, fuera de la ${GAVETA.toLowerCase()}.`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button onClick={() => abrirDialogo("poner")} className="h-11 md:h-11 gap-2">
                      <Plus className="h-4 w-4" /> Poner dinero
                    </Button>
                    <Button variant="outline" onClick={() => abrirDialogo("contar")} className="h-11 md:h-11 gap-2">
                      <ClipboardCheck className="h-4 w-4" /> Contar la {BOVEDA.toLowerCase()}
                    </Button>
                  </div>
                </div>
              </section>
            )}

            {/* Lo que vale el negocio */}
            {patrimonio && (
              <div className="rounded-sm border border-border bg-card p-5">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Scale className="h-4 w-4" /> {ET.patrimonio}
                  <span className="text-xs font-normal opacity-70">— hoy</span>
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Lo que tienes (mercadería, efectivo y equipo) menos lo que debes.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  <BalanceItem label="Mercadería" value={patrimonio.inventario} icon={Package} />
                  <BalanceItem
                    label="Efectivo"
                    value={patrimonio.efectivo.total}
                    icon={Wallet}
                    hint={`${GAVETA} ${formatMoney(patrimonio.efectivo.gaveta)} · ${BOVEDA} ${formatMoney(patrimonio.efectivo.boveda)}`}
                  />
                  <BalanceItem label="Equipo y muebles" value={patrimonio.activos_fijos} icon={Landmark} />
                  <BalanceItem label="Lo que debes" value={patrimonio.deudas} icon={TrendingDown} tone="destructive" prefix="− " />
                  <div className="col-span-2 flex flex-col justify-center rounded-sm border border-primary/30 bg-primary/5 p-4 sm:col-span-3 lg:col-span-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ET.patrimonio}</span>
                    <MoneyValue
                      value={patrimonio.patrimonio_neto}
                      tone={parseFloat(patrimonio.patrimonio_neto) >= 0 ? "success" : "destructive"}
                      className="mt-1 text-2xl font-bold"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Entradas y salidas de dinero por cuenta */}
            {flujo && (
              <div className="rounded-sm border border-border bg-card p-5">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <ArrowRightLeft className="h-4 w-4" /> {ET.flujo} — {periodoLabels[periodo]}
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  A dónde entró y de dónde salió el efectivo. No es lo mismo que la ganancia: comprar mercadería baja el dinero, pero no la ganancia.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FlujoCard titulo={GAVETA} ayuda={GAVETA_AYUDA} icon={Wallet} cuenta={flujo.gaveta} />
                  <FlujoCard titulo={BOVEDA} ayuda={BOVEDA_AYUDA} icon={Vault} cuenta={flujo.boveda} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Lo cobrado en ventas (<span className="font-medium text-foreground">{formatMoney(flujo.ventas_efectivo)}</span>) entra a la {GAVETA.toLowerCase()}.
                </p>
              </div>
            )}

            {/* Gráfico: lo que más vendes */}
            {chartData.length > 0 && (
              <div className="rounded-sm border border-border bg-card p-5">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4 text-muted-foreground" /> Lo que más vendes (top {chartData.length})
                </h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  El largo de la barra es lo vendido; el color dice cuánta ganancia deja cada producto.
                </p>
                <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <LeyendaColor tone="success" texto="Deja buena ganancia ($25 o más por cada $100)" />
                  <LeyendaColor tone="warning" texto="Deja poca ($10 a $25 por cada $100)" />
                  <LeyendaColor tone="destructive" texto="Casi no deja (menos de $10 por cada $100)" />
                </ul>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" />
                      <XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                        tickFormatter={(v) => formatMoney(v)} stroke="var(--border)" />
                      <YAxis type="category" dataKey="nombre" width={110}
                        tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} stroke="var(--border)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "2px", color: "var(--popover-foreground)", fontSize: 12 }}
                        formatter={(v) => [formatMoney(Number(v)), ET.vendido]}
                      />
                      <Bar dataKey="ingreso" radius={[0, 2, 2, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={toneChartVar[entry.tone]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Cómo salió la ganancia + tabla */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Estado de resultados */}
              <div className="rounded-sm border border-border bg-card p-5 lg:col-span-1">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Calendar className="h-4 w-4" /> Cómo salió la ganancia — {periodoLabels[periodo]}
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">De lo vendido, restando lo que costó y lo que gastaste.</p>

                <div className="flex flex-col gap-3">
                  <PLRow label={ET.vendido} value={estado.ingreso_bruto_ventas} type="income" />
                  <PLRow label={ET.devuelto} value={estado.devoluciones} type="expense" />
                  <PLDivider />
                  <PLRow label="Vendido sin lo devuelto" value={String(ingresoNeto)} type="subtotal" />
                  <PLRow label={ET.costoVendido} value={estado.costo_de_ventas_fifo} type="expense" />
                  <PLDivider />
                  <PLRow label={ET.gananciaAntesGastos} value={estado.utilidad_bruta} type="subtotal" />
                  <PLRow
                    label={ET.gananciaPor100}
                    value={estado.margen_bruto_porcentaje}
                    display={formatMoney(estado.margen_bruto_porcentaje)}
                    type="pct"
                  />
                  <PLDivider />
                  <PLRow label="Gastos del negocio" value={estado.gastos_operativos} type="expense" />
                  <PLRow label="Mercadería echada a perder" value={estado.mermas_inventario} type="expense" />
                  <PLRow label={ET.faltoGaveta} value={estado.faltantes} type="expense" />
                  <PLRow label={ET.soboGaveta} value={estado.sobrantes} type="plus" />
                  <PLDivider />
                  <PLRow label={ET.ganancia} value={estado.utilidad_neta} type="total" />
                  <div className="mt-1 rounded-sm border border-dashed border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">{ET.retirosDuena}</span>
                      <MoneyValue value={estado.retiros_duenos} tone="warning" className="text-sm font-semibold" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ET.retirosDuenaNota}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ventas cobradas</span>
                    <span className="font-mono tabular-nums">{estado.total_ventas_completadas}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ventas anuladas</span>
                    <span className="font-mono tabular-nums text-destructive">{estado.total_ventas_anuladas}</span>
                  </div>
                </div>
              </div>

              {/* Tabla productos */}
              <div className="rounded-sm border border-border bg-card p-5 lg:col-span-2">
                <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Package className="h-4 w-4" /> Productos — cuánto dejan
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Cada producto: cuánto vendiste, cuánto te costó y cuánta ganancia dejó.
                </p>

                {productos.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Package className="mx-auto mb-3 h-12 w-12 opacity-30" />
                    <p className="text-sm">No hay ventas en este período</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="pb-3 text-left font-medium">Producto</th>
                          <th className="pb-3 text-right font-medium">Uds.</th>
                          <th className="pb-3 text-right font-medium">Vendido</th>
                          <th className="pb-3 text-right font-medium">Costó</th>
                          <th className="pb-3 text-right font-medium">Ganancia</th>
                          <th className="pb-3 text-right font-medium">Por cada $100</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productos.map((p, i) => {
                          const margenN = parseFloat(p.margen_porcentaje)
                          const tone = marginTone(margenN)
                          return (
                            <tr key={p.producto_id} className="border-b border-border/60 transition-colors hover:bg-muted/40">
                              <td className="py-3 font-medium">
                                <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                                {p.nombre}
                              </td>
                              <td className="py-3 text-right font-mono tabular-nums text-muted-foreground">{formatCantidad(p.unidades_vendidas)}</td>
                              <td className="py-3 text-right"><MoneyValue value={p.ingreso} className="text-sm" /></td>
                              <td className="py-3 text-right"><MoneyValue value={p.costo_fifo} tone="warning" className="text-sm" /></td>
                              <td className="py-3 text-right"><MoneyValue value={p.margen} tone={tone} className="text-sm font-semibold" /></td>
                              <td className="py-3 text-right">
                                <StatePill tone={tone}>{formatMoney(p.margen_porcentaje)}</StatePill>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ════════ DIALOG: PONER DINERO EN LA BÓVEDA ════════ */}
      <Dialog open={dialogo === "poner"} onOpenChange={(v) => !v && !ponerLoading && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-success" /> Poner dinero en la {BOVEDA.toLowerCase()}
            </DialogTitle>
            <DialogDescription>
              Apunta el dinero tuyo que metes directo a la {BOVEDA.toLowerCase()}. No es una venta ni un gasto.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePoner} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="poner-monto" className="text-xs font-medium text-muted-foreground">Monto ($)</Label>
              <Input
                id="poner-monto" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="500.00"
                value={ponerMonto} onChange={(e) => setPonerMonto(e.target.value)} autoFocus
                className="h-12 md:h-12 text-center font-mono text-xl font-bold tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="poner-desc" className="text-xs font-medium text-muted-foreground">Nota (opcional)</Label>
              <Input
                id="poner-desc" placeholder="Ej: Dinero que puse del ahorro"
                value={ponerDesc} onChange={(e) => setPonerDesc(e.target.value)} className="h-11 md:h-11"
              />
            </div>
            {parseFloat(ponerMonto) > 0 && saldoBoveda && (
              <p role="status" className="rounded-sm border border-primary/30 bg-primary/5 p-3 text-sm font-medium">
                La {BOVEDA.toLowerCase()} pasará de {formatMoney(saldoBoveda.saldo_actual)} a{" "}
                {formatMoney(centavosAMonto(saldoCent + montoACentavos(ponerMonto)))}.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogo(null)} disabled={ponerLoading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={ponerLoading || !(parseFloat(ponerMonto) > 0)} className="gap-2">
                {ponerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Poner el dinero
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ════════ DIALOG: CONTAR LA BÓVEDA ════════ */}
      <Dialog open={dialogo === "contar"} onOpenChange={(v) => !v && !contarLoading && setDialogo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-warning-text" /> Contar la {BOVEDA.toLowerCase()}
            </DialogTitle>
            <DialogDescription>
              Cuenta el efectivo que hay de verdad en la {BOVEDA.toLowerCase()} y escríbelo. El sistema dice que debería haber{" "}
              <strong className="text-foreground">{formatMoney(saldoBoveda?.saldo_actual ?? 0)}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleContar} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contar-monto" className="text-xs font-medium text-muted-foreground">Efectivo que contaste ($)</Label>
              <Input
                id="contar-monto" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00"
                value={contarMonto} onChange={(e) => setContarMonto(e.target.value)} autoFocus
                className="h-12 md:h-12 text-center font-mono text-xl font-bold tabular-nums"
              />
            </div>

            {contadoValido && (
              <p
                role="status"
                className={cn(
                  "rounded-sm border p-3 text-sm font-medium",
                  difCent === 0 ? "border-success/30 bg-success/10" : "border-warning/40 bg-warning/10",
                )}
              >
                {difCent === 0
                  ? `La ${BOVEDA.toLowerCase()} cuadra: hay ${formatMoney(contadoNum)}.`
                  : `La ${BOVEDA.toLowerCase()} pasará de ${formatMoney(centavosAMonto(saldoCent))} a ${formatMoney(contadoNum)}: ${difCent < 0 ? "faltan" : "sobran"} ${formatMoney(centavosAMonto(Math.abs(difCent)))}.`}
              </p>
            )}

            {contadoValido && difCent !== 0 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="contar-motivo" className="text-xs font-medium text-muted-foreground">
                  {requiereMotivo ? "¿Por qué hay esa diferencia? (obligatorio)" : "¿Por qué hay esa diferencia? (opcional)"}
                </Label>
                <Input
                  id="contar-motivo" value={contarMotivo} onChange={(e) => setContarMotivo(e.target.value)}
                  placeholder="Ej: Saqué para pagar al proveedor y no lo anoté" className="h-11 md:h-11"
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialogo(null)} disabled={contarLoading}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={contarLoading || !contadoValido || (requiereMotivo && !contarMotivo.trim())}
                className="gap-2"
              >
                {contarLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {contadoValido ? `Confirmar: dejar ${formatMoney(contadoNum)}` : "Confirmar conteo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─────────────── Sub-components ─────────────── */

/** "¿Estoy ganando?" en una frase, adaptada al período. */
function Cabecera({
  estado,
  periodo,
  vendido,
}: {
  estado: EstadoResultados
  periodo: Periodo
  vendido: number
}) {
  const gananciaCent = montoACentavos(estado.utilidad_neta)
  const gana = gananciaCent > 0
  const pierde = gananciaCent < 0
  const inicio = periodoFrase[periodo]
  const monto = formatMoney(centavosAMonto(Math.abs(gananciaCent)))

  // Qué mirar cuando se pierde: lo que más pesó, de mayor a menor.
  const sospechas = [
    { texto: "gastos del negocio", cent: montoACentavos(estado.gastos_operativos) },
    { texto: "faltantes en la gaveta", cent: montoACentavos(estado.faltantes) },
    { texto: "mercadería echada a perder", cent: montoACentavos(estado.mermas_inventario) },
    { texto: "lo que costó lo vendido", cent: montoACentavos(estado.costo_de_ventas_fifo) },
  ]
    .filter((s) => s.cent > 0)
    .sort((a, b) => b.cent - a.cent)

  const retiros = montoACentavos(estado.retiros_duenos)

  return (
    <section
      aria-label="Resumen del período"
      className={cn(
        "rounded-sm border p-5",
        gana ? "border-success/30 bg-success/5" : pierde ? "border-destructive/30 bg-destructive/5" : "border-border bg-card",
      )}
    >
      <p className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
        {gana || pierde ? (
          <>
            {inicio} {gana ? "ganaste" : "perdiste"}{" "}
            <span className={cn("font-mono tabular-nums", gana ? "text-success" : "text-destructive")}>{monto}</span>
            <span className="text-base font-normal text-muted-foreground sm:text-lg">
              {" "}(de {formatMoney(vendido)} vendidos)
            </span>
          </>
        ) : vendido > 0 ? (
          <>
            {inicio} no ganaste ni perdiste
            <span className="text-base font-normal text-muted-foreground sm:text-lg"> (de {formatMoney(vendido)} vendidos)</span>
          </>
        ) : (
          <>{inicio} todavía no hay ventas.</>
        )}
      </p>
      {pierde && sospechas.length > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          Qué mirar primero:{" "}
          {sospechas
            .slice(0, 3)
            .map((s) => `${s.texto} (${formatMoney(centavosAMonto(s.cent))})`)
            .join(", ")}
          .
        </p>
      )}
      {(gana || pierde) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Es lo que queda de lo vendido después de pagar la mercadería, los gastos y los faltantes.
          {retiros > 0 && <> Lo que sacaste para ti ({formatMoney(centavosAMonto(retiros))}) no está restado.</>}
        </p>
      )}
    </section>
  )
}

function LeyendaColor({ tone, texto }: { tone: MarginTone; texto: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: toneChartVar[tone] }} aria-hidden />
      {texto}
    </li>
  )
}

function KPICard({
  label,
  ayuda,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  ayuda: string
  value: string
  icon: LucideIcon
  tone: Tone
}) {
  return (
    <div className="flex flex-col rounded-sm border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", toneText[tone])} />
      </div>
      <p className={cn("mt-2 font-mono text-xl font-bold tracking-tight tabular-nums", toneText[tone])}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{ayuda}</p>
    </div>
  )
}

function BalanceItem({
  label,
  value,
  icon: Icon,
  tone = "muted",
  hint,
  prefix = "",
}: {
  label: string
  value: string
  icon: LucideIcon
  tone?: Tone
  hint?: string
  prefix?: string
}) {
  return (
    <div className="flex flex-col rounded-sm border border-border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("h-3.5 w-3.5 shrink-0", toneText[tone])} />
      </div>
      <span className={cn("mt-1 font-mono text-base font-semibold tabular-nums", toneText[tone])}>
        {prefix}
        {formatMoney(value)}
      </span>
      {hint && <span className="mt-0.5 text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  )
}

function FlujoCard({
  titulo,
  ayuda,
  icon: Icon,
  cuenta,
}: {
  titulo: string
  ayuda: string
  icon: LucideIcon
  cuenta: FlujoCuenta
}) {
  const neto = parseFloat(cuenta.neto)
  return (
    <div className="rounded-sm border border-border bg-background/40 p-4">
      <div className="mb-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" /> {titulo}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{ayuda}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5 text-success" /> Entró
          </span>
          <MoneyValue value={cuenta.entradas} tone="success" className="text-sm" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <ArrowDownRight className="h-3.5 w-3.5 text-destructive" /> Salió
          </span>
          <MoneyValue value={cuenta.salidas} tone="destructive" className="text-sm" />
        </div>
        <div className="flex items-center justify-between border-t border-dashed border-border pt-2 text-sm">
          <span className="font-medium">{neto >= 0 ? "Aumentó" : "Bajó"}</span>
          <MoneyValue value={cuenta.neto} tone={neto >= 0 ? "success" : "destructive"} className="text-sm font-semibold" />
        </div>
      </div>
    </div>
  )
}

function PLRow({
  label,
  value,
  display,
  type,
}: {
  label: string
  value: string
  /** Texto a mostrar en lugar del monto (p. ej. "ganancia por cada $100"). */
  display?: string
  type: "income" | "expense" | "plus" | "subtotal" | "total" | "pct"
}) {
  const numVal = parseFloat(value)
  const valueClass = {
    income: "text-foreground",
    plus: "text-foreground",
    expense: "text-muted-foreground",
    subtotal: "font-semibold text-foreground",
    total: numVal >= 0 ? "text-lg font-bold text-success" : "text-lg font-bold text-destructive",
    pct: numVal >= 15 ? "text-success" : numVal >= 0 ? "text-warning-text" : "text-destructive",
  }[type]

  const labelClass = {
    income: "text-muted-foreground",
    plus: "text-muted-foreground",
    expense: "text-muted-foreground",
    subtotal: "font-medium text-foreground",
    total: "font-semibold text-foreground",
    pct: "text-xs text-muted-foreground",
  }[type]

  const prefix = type === "expense" ? "− " : type === "plus" ? "+ " : ""
  const displayValue = display ?? formatMoney(value)

  return (
    <div className="flex items-center justify-between gap-2">
      <span className={cn("text-sm", labelClass)}>{prefix}{label}</span>
      <span className={cn("shrink-0 font-mono tabular-nums", valueClass)}>{displayValue}</span>
    </div>
  )
}

function PLDivider() {
  return <div className="border-t border-dashed border-border" />
}
