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
  X,
  Check,
  ClipboardCheck,
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

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyValue } from "@/components/money-value"
import { StatePill } from "@/components/state-pill"
import { formatMoney } from "@/lib/format"
import { apiFetch } from "@/lib/api"

/* ─────────────── Types ─────────────── */
interface EstadoResultados {
  periodo: { desde: string; hasta: string }
  ingreso_bruto_ventas: string
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

/* ─────────────── Helpers ─────────────── */
const pct = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v
  return `${n.toFixed(1)}%`
}

type Tone = "success" | "destructive" | "warning" | "primary" | "muted"
type MarginTone = "success" | "warning" | "destructive"

const marginTone = (margenPct: number): MarginTone =>
  margenPct >= 25 ? "success" : margenPct >= 10 ? "warning" : "destructive"

const toneText: Record<Tone, string> = {
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
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
      weekAgo.setDate(weekAgo.getDate() - 7)
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

/* ─────────────── Main Component ─────────────── */
export default function StatsPage() {
  const [periodo, setPeriodo] = useState<Periodo>("mes")
  const [estado, setEstado] = useState<EstadoResultados | null>(null)
  const [productos, setProductos] = useState<ProductoTop[]>([])
  const [saldoBoveda, setSaldoBoveda] = useState<CajaGeneralSaldo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInyeccion, setShowInyeccion] = useState(false)
  const [inyeccionMonto, setInyeccionMonto] = useState("")
  const [inyeccionDesc, setInyeccionDesc] = useState("")
  const [inyeccionLoading, setInyeccionLoading] = useState(false)
  const [inyeccionMsg, setInyeccionMsg] = useState<string | null>(null)
  const [showArqueo, setShowArqueo] = useState(false)
  const [arqueoSaldo, setArqueoSaldo] = useState("")
  const [arqueoJustif, setArqueoJustif] = useState("")
  const [arqueoLoading, setArqueoLoading] = useState(false)
  const [arqueoMsg, setArqueoMsg] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { desde, hasta } = getPeriodoDates(periodo)
      const qs = `desde=${desde}&hasta=${hasta}`

      const [estadoRes, productosRes, saldoRes] = await Promise.all([
        apiFetch(`/reportes/estado-resultados?${qs}`) as Promise<EstadoResultados>,
        apiFetch(`/reportes/productos-top?${qs}&limit=15`) as Promise<ProductoTop[]>,
        apiFetch(`/caja-general/saldo`) as Promise<CajaGeneralSaldo>,
      ])

      setEstado(estadoRes)
      setProductos(productosRes)
      setSaldoBoveda(saldoRes)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar reportes")
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const periodoLabels: Record<Periodo, string> = {
    hoy: "Hoy",
    semana: "7 días",
    mes: "Este mes",
    todo: "Historial",
  }

  const chartData = productos.slice(0, 8).map(p => ({
    nombre: p.nombre.length > 16 ? p.nombre.slice(0, 15) + "…" : p.nombre,
    ingreso: parseFloat(p.ingreso),
    tone: marginTone(parseFloat(p.margen_porcentaje)),
  }))

  const handleInyeccion = async () => {
    setInyeccionLoading(true)
    setInyeccionMsg(null)
    try {
      await apiFetch("/caja-general/inyeccion", {
        method: "POST",
        body: JSON.stringify({
          monto: parseFloat(inyeccionMonto),
          descripcion: inyeccionDesc || undefined,
        }),
      })
      setInyeccionMsg(`✅ ${formatMoney(parseFloat(inyeccionMonto))} depositados`)
      setInyeccionMonto("")
      setInyeccionDesc("")
      fetchData()
      setTimeout(() => {
        setShowInyeccion(false)
        setInyeccionMsg(null)
      }, 2000)
    } catch (err) {
      setInyeccionMsg(`❌ ${err instanceof Error ? err.message : "Error"}`)
    } finally {
      setInyeccionLoading(false)
    }
  }

  const handleArqueo = async () => {
    setArqueoLoading(true)
    setArqueoMsg(null)
    try {
      const res = await apiFetch<{ diferencia: string | number }>("/caja-general/arqueo", {
        method: "POST",
        body: JSON.stringify({
          saldo_declarado: parseFloat(arqueoSaldo),
          justificacion: arqueoJustif.trim() || undefined,
        }),
      })
      const dif = Number(res.diferencia)
      const detalle = dif === 0 ? "sin descuadre" : dif < 0 ? "faltante" : "sobrante"
      setArqueoMsg(`✅ Arqueo registrado (${detalle}: ${formatMoney(Math.abs(dif))})`)
      setArqueoSaldo("")
      setArqueoJustif("")
      fetchData()
      setTimeout(() => {
        setShowArqueo(false)
        setArqueoMsg(null)
      }, 2500)
    } catch (err) {
      setArqueoMsg(`❌ ${err instanceof Error ? err.message : "Error"}`)
    } finally {
      setArqueoLoading(false)
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8 lg:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Estado de resultados</h1>
            <p className="text-xs text-muted-foreground">Control financiero con costeo FIFO en tiempo real</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-sm border border-border bg-muted/50 p-1">
              {(["hoy", "semana", "mes", "todo"] as Periodo[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={cn(
                    "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
                    periodo === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {periodoLabels[p]}
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading} className="h-9 w-9 shrink-0">
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
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <KPICard
                label="Utilidad neta"
                value={formatMoney(estado.utilidad_neta)}
                icon={parseFloat(estado.utilidad_neta) >= 0 ? TrendingUp : TrendingDown}
                tone={parseFloat(estado.utilidad_neta) >= 0 ? "success" : "destructive"}
              />
              <KPICard label="Ingreso bruto" value={formatMoney(estado.ingreso_bruto_ventas)} icon={DollarSign} tone="primary" />
              <KPICard label="Costo FIFO" value={formatMoney(estado.costo_de_ventas_fifo)} icon={Package} tone="warning" />
              <KPICard
                label="Margen bruto"
                value={pct(estado.margen_bruto_porcentaje)}
                icon={parseFloat(estado.margen_bruto_porcentaje) >= 0 ? ArrowUpRight : ArrowDownRight}
                tone={parseFloat(estado.margen_bruto_porcentaje) >= 15 ? "success" : "destructive"}
              />
              <KPICard label="Ticket promedio" value={formatMoney(estado.ticket_promedio)} icon={ShoppingCart} tone="primary" />
              {saldoBoveda && (
                <div className="relative">
                  <KPICard
                    label="Caja general"
                    value={formatMoney(saldoBoveda.saldo_actual)}
                    icon={Vault}
                    tone={parseFloat(saldoBoveda.saldo_actual) >= 0 ? "success" : "destructive"}
                  />
                  <button
                    onClick={() => { setShowArqueo(!showArqueo); setArqueoMsg(null); setShowInyeccion(false) }}
                    className="absolute right-9 top-2 flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Arqueo de bóveda"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setShowInyeccion(!showInyeccion); setInyeccionMsg(null); setShowArqueo(false) }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Inyectar capital"
                  >
                    {showInyeccion ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}
            </div>

            {/* Inyección de capital */}
            {showInyeccion && (
              <div className="rounded-sm border border-success/30 bg-card p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-success">
                  <Vault className="h-4 w-4" /> Inyectar capital a caja general
                </h3>
                <p className="mb-4 text-xs text-muted-foreground">Registra dinero que el dueño deposita directamente en la bóveda.</p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Monto ($)</Label>
                    <Input type="number" min="0.01" step="0.01" placeholder="500.00"
                      value={inyeccionMonto} onChange={(e) => setInyeccionMonto(e.target.value)}
                      className="h-11 font-mono text-lg" />
                  </div>
                  <div className="flex flex-[2] flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Descripción (opcional)</Label>
                    <Input type="text" placeholder="Ej: Capital inicial del dueño"
                      value={inyeccionDesc} onChange={(e) => setInyeccionDesc(e.target.value)}
                      className="h-11" />
                  </div>
                  <div className="flex items-end">
                    <Button
                      disabled={inyeccionLoading || !inyeccionMonto || parseFloat(inyeccionMonto) <= 0}
                      onClick={handleInyeccion}
                      className="h-11 gap-2 bg-success text-success-foreground hover:bg-success/90"
                    >
                      {inyeccionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Depositar
                    </Button>
                  </div>
                </div>
                {inyeccionMsg && (
                  <p className={cn("mt-3 text-sm font-medium", inyeccionMsg.startsWith("✅") ? "text-success" : "text-destructive")}>
                    {inyeccionMsg}
                  </p>
                )}
              </div>
            )}

            {/* Arqueo de bóveda */}
            {showArqueo && saldoBoveda && (
              <div className="rounded-sm border border-warning/30 bg-card p-5">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-warning">
                  <ClipboardCheck className="h-4 w-4" /> Arqueo de bóveda
                </h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Declara el efectivo físico contado en la bóveda. Si difiere del saldo del sistema
                  (<MoneyValue value={saldoBoveda.saldo_actual} tone="muted" className="text-xs" />), se
                  registra el ajuste y el saldo queda igual al conteo.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Efectivo contado ($)</Label>
                    <Input type="number" min="0" step="0.01" placeholder="0.00"
                      value={arqueoSaldo} onChange={(e) => setArqueoSaldo(e.target.value)}
                      className="h-11 font-mono text-lg" />
                  </div>
                  <div className="flex flex-[2] flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Justificación (si hay descuadre)</Label>
                    <Input type="text" placeholder="Ej: Conteo físico de fin de mes"
                      value={arqueoJustif} onChange={(e) => setArqueoJustif(e.target.value)}
                      className="h-11" />
                  </div>
                  <div className="flex items-end">
                    <Button
                      disabled={arqueoLoading || arqueoSaldo === "" || parseFloat(arqueoSaldo) < 0}
                      onClick={handleArqueo}
                      className="h-11 gap-2 bg-warning text-warning-foreground hover:bg-warning/90"
                    >
                      {arqueoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Registrar arqueo
                    </Button>
                  </div>
                </div>
                {arqueoMsg && (
                  <p className={cn("mt-3 text-sm font-medium", arqueoMsg.startsWith("✅") ? "text-success" : "text-destructive")}>
                    {arqueoMsg}
                  </p>
                )}
              </div>
            )}

            {/* Gráfico: ingreso por producto */}
            {chartData.length > 0 && (
              <div className="rounded-sm border border-border bg-card p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4 text-muted-foreground" /> Ingreso por producto (top {chartData.length})
                </h2>
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
                        formatter={(v) => [formatMoney(Number(v)), "Ingreso"]}
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

            {/* Estado de resultados + tabla */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* P&L Statement */}
              <div className="rounded-sm border border-border bg-card p-5 lg:col-span-1">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Calendar className="h-4 w-4" /> {periodoLabels[periodo]}
                </h2>

                <div className="flex flex-col gap-3">
                  <PLRow label="Ingreso bruto por ventas" value={estado.ingreso_bruto_ventas} type="income" />
                  <PLRow label="Costo de ventas (FIFO)" value={estado.costo_de_ventas_fifo} type="expense" />
                  <PLDivider />
                  <PLRow label="Utilidad bruta" value={estado.utilidad_bruta} type="subtotal" />
                  <PLRow label="Margen bruto" value={`${estado.margen_bruto_porcentaje}%`} type="pct" />
                  <PLDivider />
                  <PLRow label="Gastos operativos" value={estado.gastos_operativos} type="expense" />
                  <PLRow label="Pérdidas por mermas" value={estado.mermas_inventario} type="expense" />
                  <PLRow label="Faltantes de caja" value={estado.faltantes} type="expense" />
                  {parseFloat(estado.sobrantes) > 0 && (
                    <PLRow label="Sobrantes de caja" value={estado.sobrantes} type="income" />
                  )}
                  <PLDivider />
                  <PLRow label="Utilidad neta" value={estado.utilidad_neta} type="total" />
                  {parseFloat(estado.retiros_duenos) > 0 && (
                    <>
                      <PLDivider />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Retiros de dueños
                          <span className="ml-1 text-xs opacity-70">(no baja la utilidad)</span>
                        </span>
                        <MoneyValue value={estado.retiros_duenos} tone="warning" className="text-sm font-semibold" />
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-2 border-t border-border pt-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ventas completadas</span>
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
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Package className="h-4 w-4" /> Productos — rentabilidad FIFO
                </h2>

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
                          <th className="pb-3 text-right font-medium">Ingreso</th>
                          <th className="pb-3 text-right font-medium">Costo</th>
                          <th className="pb-3 text-right font-medium">Margen</th>
                          <th className="pb-3 text-right font-medium">%</th>
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
                              <td className="py-3 text-right font-mono tabular-nums text-muted-foreground">{p.unidades_vendidas}</td>
                              <td className="py-3 text-right"><MoneyValue value={p.ingreso} className="text-sm" /></td>
                              <td className="py-3 text-right"><MoneyValue value={p.costo_fifo} tone="warning" className="text-sm" /></td>
                              <td className="py-3 text-right"><MoneyValue value={p.margen} tone={tone} className="text-sm font-semibold" /></td>
                              <td className="py-3 text-right">
                                <StatePill tone={tone}>{pct(p.margen_porcentaje)}</StatePill>
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
    </div>
  )
}

/* ─────────────── Sub-components ─────────────── */

function KPICard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone: Tone
}) {
  return (
    <div className="flex flex-col rounded-sm border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4 shrink-0", toneText[tone])} />
      </div>
      <p className={cn("mt-2 font-mono text-xl font-bold tracking-tight tabular-nums", toneText[tone])}>{value}</p>
    </div>
  )
}

function PLRow({
  label,
  value,
  type,
}: {
  label: string
  value: string
  type: "income" | "expense" | "subtotal" | "total" | "pct"
}) {
  const numVal = parseFloat(value)
  const valueClass = {
    income: "text-foreground",
    expense: "text-muted-foreground",
    subtotal: "font-semibold text-foreground",
    total: numVal >= 0 ? "text-lg font-bold text-success" : "text-lg font-bold text-destructive",
    pct: numVal >= 15 ? "text-success" : numVal >= 0 ? "text-warning" : "text-destructive",
  }[type]

  const labelClass = {
    income: "text-muted-foreground",
    expense: "text-muted-foreground",
    subtotal: "font-medium text-foreground",
    total: "font-semibold text-foreground",
    pct: "text-xs text-muted-foreground",
  }[type]

  const prefix = type === "expense" ? "- " : ""
  const displayValue = type === "pct" ? value : formatMoney(value)

  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-sm", labelClass)}>{prefix}{label}</span>
      <span className={cn("font-mono tabular-nums", valueClass)}>{displayValue}</span>
    </div>
  )
}

function PLDivider() {
  return <div className="border-t border-dashed border-border" />
}
