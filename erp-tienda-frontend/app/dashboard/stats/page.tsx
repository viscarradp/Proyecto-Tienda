"use client"

import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  AlertTriangle,
  Package,
  BarChart3,
  Calendar,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Vault,
  Plus,
  X,
  Check,
} from "lucide-react"

/* ─────────────── Types ─────────────── */
interface EstadoResultados {
  periodo: { desde: string; hasta: string }
  ingreso_bruto_ventas: string
  costo_de_ventas_fifo: string
  utilidad_bruta: string
  margen_bruto_porcentaje: string
  gastos_operativos: string
  mermas_inventario: string
  utilidad_neta: string
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
const fmt = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v
  return `$${n.toFixed(2)}`
}

const pct = (v: string | number) => {
  const n = typeof v === "string" ? parseFloat(v) : v
  return `${n.toFixed(1)}%`
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
    semana: "Últimos 7 días",
    mes: "Este Mes",
    todo: "Todo el Historial",
  }

  return (
    <div className="min-h-screen bg-black p-4 md:p-6 space-y-6 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-cyan-400" />
            Estado de Resultados
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Control financiero con costeo FIFO en tiempo real
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
            {(["hoy", "semana", "mes", "todo"] as Periodo[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  periodo === p
                    ? "bg-white text-black shadow"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {periodoLabels[p]}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {error}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && !estado && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
      )}

      {estado && (
        <>
          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Utilidad Neta (hero card) */}
            <KPICard
              label="Utilidad Neta"
              value={fmt(estado.utilidad_neta)}
              icon={parseFloat(estado.utilidad_neta) >= 0 ? TrendingUp : TrendingDown}
              accent={parseFloat(estado.utilidad_neta) >= 0 ? "emerald" : "red"}
              hero
            />
            <KPICard
              label="Ingreso Bruto"
              value={fmt(estado.ingreso_bruto_ventas)}
              icon={DollarSign}
              accent="cyan"
            />
            <KPICard
              label="Costo FIFO"
              value={fmt(estado.costo_de_ventas_fifo)}
              icon={Package}
              accent="amber"
            />
            <KPICard
              label="Margen Bruto"
              value={pct(estado.margen_bruto_porcentaje)}
              icon={parseFloat(estado.margen_bruto_porcentaje) >= 0 ? ArrowUpRight : ArrowDownRight}
              accent={parseFloat(estado.margen_bruto_porcentaje) >= 15 ? "emerald" : "red"}
            />
            <KPICard
              label="Ticket Promedio"
              value={fmt(estado.ticket_promedio)}
              icon={ShoppingCart}
              accent="violet"
            />
            {saldoBoveda && (
              <div className="relative">
                <KPICard
                  label="Caja General"
                  value={fmt(saldoBoveda.saldo_actual)}
                  icon={Vault}
                  accent={parseFloat(saldoBoveda.saldo_actual) >= 0 ? "emerald" : "red"}
                />
                <button
                  onClick={() => { setShowInyeccion(!showInyeccion); setInyeccionMsg(null) }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
                  title="Inyectar capital"
                >
                  {showInyeccion ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {/* ── Modal Inyección de Capital ── */}
          {showInyeccion && (
            <div className="bg-zinc-900 border border-emerald-500/30 rounded-2xl p-5 animate-in slide-in-from-top-2 duration-300">
              <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Vault className="w-4 h-4" />
                Inyectar Capital a Caja General
              </h3>
              <p className="text-zinc-500 text-xs mb-4">
                Registra dinero que el dueño deposita directamente en la bóveda.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="text-zinc-500 text-xs mb-1 block">Monto ($)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="500.00"
                    value={inyeccionMonto}
                    onChange={(e) => setInyeccionMonto(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white font-mono text-lg focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="flex-[2]">
                  <label className="text-zinc-500 text-xs mb-1 block">Descripción (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej: Capital inicial del dueño"
                    value={inyeccionDesc}
                    onChange={(e) => setInyeccionDesc(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    disabled={inyeccionLoading || !inyeccionMonto || parseFloat(inyeccionMonto) <= 0}
                    onClick={async () => {
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
                        setInyeccionMsg(`✅ $${parseFloat(inyeccionMonto).toFixed(2)} depositados`)
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
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-bold rounded-xl transition-all flex items-center gap-2"
                  >
                    {inyeccionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Depositar
                  </button>
                </div>
              </div>
              {inyeccionMsg && (
                <p className={`mt-3 text-sm font-medium ${inyeccionMsg.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
                  {inyeccionMsg}
                </p>
              )}
            </div>
          )}

          {/* ── Estado de Resultados Detallado ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: P&L Statement */}
            <div className="lg:col-span-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {periodoLabels[periodo]}
              </h2>

              <div className="space-y-3">
                <PLRow label="Ingreso Bruto por Ventas" value={estado.ingreso_bruto_ventas} type="income" />
                <PLRow label="Costo de Ventas (FIFO)" value={estado.costo_de_ventas_fifo} type="expense" />
                <PLDivider />
                <PLRow label="UTILIDAD BRUTA" value={estado.utilidad_bruta} type="subtotal" />
                <PLRow label={`Margen Bruto`} value={`${estado.margen_bruto_porcentaje}%`} type="pct" />
                <PLDivider />
                <PLRow label="Gastos Operativos" value={estado.gastos_operativos} type="expense" />
                <PLRow label="Pérdidas por Mermas" value={estado.mermas_inventario} type="expense" />
                <PLDivider />
                <PLRow label="UTILIDAD NETA" value={estado.utilidad_neta} type="total" />
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-800 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Ventas completadas</span>
                  <span className="text-zinc-300 font-mono">{estado.total_ventas_completadas}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-500">Ventas anuladas</span>
                  <span className="text-red-400 font-mono">{estado.total_ventas_anuladas}</span>
                </div>
              </div>
            </div>

            {/* Right: Tabla productos */}
            <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Productos — Rentabilidad FIFO
              </h2>

              {productos.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p>No hay ventas en este período</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-800">
                        <th className="text-left pb-3 font-medium">Producto</th>
                        <th className="text-right pb-3 font-medium">Uds.</th>
                        <th className="text-right pb-3 font-medium">Ingreso</th>
                        <th className="text-right pb-3 font-medium">Costo</th>
                        <th className="text-right pb-3 font-medium">Margen</th>
                        <th className="text-right pb-3 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productos.map((p, i) => {
                        const margenN = parseFloat(p.margen_porcentaje)
                        const margenColor =
                          margenN >= 25
                            ? "text-emerald-400"
                            : margenN >= 10
                            ? "text-amber-400"
                            : "text-red-400"

                        return (
                          <tr
                            key={p.producto_id}
                            className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                          >
                            <td className="py-3 text-white font-medium">
                              <span className="text-zinc-600 mr-2 text-xs">{i + 1}.</span>
                              {p.nombre}
                            </td>
                            <td className="py-3 text-right text-zinc-300 font-mono">
                              {p.unidades_vendidas}
                            </td>
                            <td className="py-3 text-right text-cyan-400 font-mono">
                              {fmt(p.ingreso)}
                            </td>
                            <td className="py-3 text-right text-amber-400 font-mono">
                              {fmt(p.costo_fifo)}
                            </td>
                            <td className="py-3 text-right font-mono font-semibold">
                              <span className={margenColor}>{fmt(p.margen)}</span>
                            </td>
                            <td className="py-3 text-right">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                  margenN >= 25
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : margenN >= 10
                                    ? "bg-amber-500/15 text-amber-400"
                                    : "bg-red-500/15 text-red-400"
                                }`}
                              >
                                {pct(p.margen_porcentaje)}
                              </span>
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
  )
}

/* ─────────────── Sub-components ─────────────── */

function KPICard({
  label,
  value,
  icon: Icon,
  accent,
  hero,
}: {
  label: string
  value: string
  icon: typeof DollarSign
  accent: "emerald" | "red" | "cyan" | "amber" | "violet"
  hero?: boolean
}) {
  const accentStyles = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", glow: "shadow-emerald-500/10" },
    red:     { bg: "bg-red-500/10",     text: "text-red-400",     glow: "shadow-red-500/10"     },
    cyan:    { bg: "bg-cyan-500/10",    text: "text-cyan-400",    glow: "shadow-cyan-500/10"    },
    amber:   { bg: "bg-amber-500/10",   text: "text-amber-400",   glow: "shadow-amber-500/10"   },
    violet:  { bg: "bg-violet-500/10",  text: "text-violet-400",  glow: "shadow-violet-500/10"  },
  }

  const s = accentStyles[accent]

  return (
    <div
      className={`${s.bg} border border-zinc-800 rounded-2xl p-4 ${hero ? "col-span-2 md:col-span-1" : ""} ${s.glow} shadow-lg`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${s.text}`} />
      </div>
      <p className={`text-xl md:text-2xl font-black ${s.text} font-mono tracking-tight`}>{value}</p>
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
  const styles = {
    income: "text-zinc-300",
    expense: "text-zinc-400",
    subtotal: "text-white font-bold",
    total: numVal >= 0 ? "text-emerald-400 font-black text-lg" : "text-red-400 font-black text-lg",
    pct: numVal >= 15 ? "text-emerald-400" : numVal >= 0 ? "text-amber-400" : "text-red-400",
  }

  const labelStyles = {
    income: "text-zinc-400",
    expense: "text-zinc-500",
    subtotal: "text-zinc-300 font-semibold",
    total: "text-white font-bold",
    pct: "text-zinc-500 text-xs",
  }

  const prefix = type === "expense" ? "- " : type === "pct" ? "" : ""
  const displayValue = type === "pct" ? value : fmt(value)

  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${labelStyles[type]}`}>
        {prefix}{label}
      </span>
      <span className={`font-mono ${styles[type]}`}>{displayValue}</span>
    </div>
  )
}

function PLDivider() {
  return <div className="border-t border-zinc-800 border-dashed" />
}
