'use client'

import * as React from "react"
import {
  Store,
  Wallet,
  Loader2,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  CheckCircle2,
  Receipt,
} from "lucide-react"

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
import { StatCard } from "@/components/stat-card"
import { apiFetch } from "@/lib/api"
import { DeudasProveedores } from "@/components/gastos/DeudasProveedores"
import { GAVETA, BOVEDA } from "@/lib/glosario"

/** Valor del selector para "sin categoría" (el backend la guarda en "Otros"). */
const SIN_CATEGORIA = "sin-categoria"

interface CategoriaGasto {
  id: number
  nombre: string
}

interface CajaTurno {
  id: number
  fondo_inicial: string
  efectivo_esperado: string | null
}

interface CajaGeneralSaldo {
  saldo_actual: string
  total_depositos: number
}

interface MovimientoFinanciero {
  id: number
  tipo_movimiento: string
  monto: string
  descripcion: string
  fecha: string
  categorias_gastos?: CategoriaGasto
}

export default function GastosPage() {
  const [mounted, setMounted] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const [success, setSuccess] = React.useState("")

  const [categorias, setCategorias] = React.useState<CategoriaGasto[]>([])
  const [cajaActiva, setCajaActiva] = React.useState<CajaTurno | null>(null)
  const [cajaGeneral, setCajaGeneral] = React.useState<CajaGeneralSaldo | null>(null)
  const [gastosRecientes, setGastosRecientes] = React.useState<MovimientoFinanciero[]>([])

  // Form State
  const [descripcion, setDescripcion] = React.useState("")
  const [monto, setMonto] = React.useState("")
  const [categoriaId, setCategoriaId] = React.useState("")
  const [origenFondos, setOrigenFondos] = React.useState("CAJA_POS")
  const [submitLoading, setSubmitLoading] = React.useState(false)

  // New Category Modal State
  const [showNewCatDialog, setShowNewCatDialog] = React.useState(false)
  const [newCatNombre, setNewCatNombre] = React.useState("")
  const [newCatTipo, setNewCatTipo] = React.useState("VARIABLE")
  const [newCatLoading, setNewCatLoading] = React.useState(false)

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [catsRes, cajaRes, generalRes, gastosRes] = await Promise.allSettled([
        apiFetch<CategoriaGasto[]>("/categorias-gastos"),
        apiFetch<CajaTurno>("/cajas-turnos/activa"),
        apiFetch<CajaGeneralSaldo>("/caja-general/saldo"),
        apiFetch<MovimientoFinanciero[]>("/movimientos-financieros?tipo_movimiento=EGRESO_OPERATIVO&limit=15")
      ])

      if (catsRes.status === 'fulfilled') setCategorias(catsRes.value)
      if (cajaRes.status === 'fulfilled') setCajaActiva(cajaRes.value)
      else setCajaActiva(null)
      if (generalRes.status === 'fulfilled') setCajaGeneral(generalRes.value)
      if (gastosRes.status === 'fulfilled') setGastosRecientes(gastosRes.value)

    } catch {
      setError("Error al cargar datos iniciales. Reintenta.")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    setMounted(true)
    loadData()
  }, [loadData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    const montoParsed = parseFloat(monto)
    if (isNaN(montoParsed) || montoParsed <= 0) {
      setError("El monto debe ser mayor a 0.")
      return
    }

    if (origenFondos === "CAJA_POS" && !cajaActiva) {
      setError(`No hay un turno abierto: abre la caja en Vender, o paga el gasto desde la ${BOVEDA.toLowerCase()}.`)
      return
    }

    // Sin validar fondos aquí: si el sistema cree que no alcanza, el gasto se
    // registra igual y el backend devuelve un aviso (registrar y avisar).
    // La categoría es opcional: sin elegir, el backend usa "Otros".
    const categoria = categoriaId && categoriaId !== SIN_CATEGORIA ? parseInt(categoriaId) : undefined

    setSubmitLoading(true)
    try {
      // Un gasto es un EGRESO_OPERATIVO; el origen (gaveta o bóveda) lo decide
      // origen_fondos. Desde 1.C la bóveda ya no se toca por la puerta trasera.
      const resp = await apiFetch<{ avisos?: string[] }>("/movimientos-financieros", {
        method: "POST",
        body: JSON.stringify({
          tipo_movimiento: 'EGRESO_OPERATIVO',
          monto: montoParsed,
          descripcion: descripcion,
          categoria_gasto_id: categoria,
          origen_fondos: origenFondos === "CAJA_POS" ? "GAVETA" : "BOVEDA",
        })
      })

      setSuccess("¡Gasto registrado!")
      for (const aviso of resp.avisos ?? []) {
        toast.warning(aviso, { duration: 12000 })
      }
      setDescripcion("")
      setMonto("")

      // Recargar saldos
      loadData()

      setTimeout(() => setSuccess(""), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar el gasto")
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatNombre.trim() || !newCatTipo) return

    setNewCatLoading(true)
    setError("")
    try {
      await apiFetch("/categorias-gastos", {
        method: "POST",
        body: JSON.stringify({
          nombre: newCatNombre.trim(),
          tipo: newCatTipo
        })
      })

      // Refresh categories
      const updatedCats = await apiFetch<CategoriaGasto[]>("/categorias-gastos")
      setCategorias(updatedCats)

      setNewCatNombre("")
      setShowNewCatDialog(false)
      setSuccess("Categoría creada exitosamente")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al crear la categoría")
    } finally {
      setNewCatLoading(false)
    }
  }

  if (!mounted) return null

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8 lg:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Control de gastos</h1>
            <p className="text-xs text-muted-foreground">Lo que pagas para que el negocio funcione</p>
          </div>
          <Button variant="outline" size="icon" onClick={loadData} disabled={loading} className="h-11 w-11 shrink-0">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">

          {/* Tarjetas de saldo */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard label={GAVETA} icon={Store}>
              {cajaActiva ? (
                <>
                  <MoneyValue value={cajaActiva.efectivo_esperado || cajaActiva.fondo_inicial} className="text-3xl font-bold tracking-tight" />
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Turno #{cajaActiva.id} abierto
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning" /> No hay turno abierto
                </div>
              )}
            </StatCard>

            <StatCard label={BOVEDA} icon={Wallet}>
              {cajaGeneral ? (
                <>
                  <MoneyValue value={cajaGeneral.saldo_actual} className="text-3xl font-bold tracking-tight" />
                  {parseFloat(cajaGeneral.saldo_actual) < 0 ? (
                    <p className="mt-1 text-xs font-medium text-warning">
                      Negativo según el sistema: falta registrar efectivo. Cuenta la bóveda o pon dinero en Estadísticas.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs font-medium text-success">Dinero disponible</p>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-warning" /> No disponible o vacía
                </div>
              )}
            </StatCard>
          </div>

          {/* Formulario de registro */}
          <div className="rounded-sm border border-border bg-card p-5 md:p-6">
            <div className="mb-6 flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Nuevo gasto</h2>
            </div>

            {error && (
              <div className="mb-5 flex items-center gap-3 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
                <AlertTriangle className="h-5 w-5 shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="mb-5 flex items-center gap-3 rounded-sm border border-success/20 bg-success/10 p-3 text-sm font-medium text-success">
                <CheckCircle2 className="h-5 w-5 shrink-0" /> {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Monto del gasto ($)</Label>
                  <Input type="number" min={0.01} step="0.01" required value={monto}
                    onChange={e => setMonto(e.target.value)}
                    placeholder="0.00"
                    className="h-14 font-mono text-2xl font-bold" />
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">¿De dónde sale el dinero?</Label>
                  <Select value={origenFondos} onValueChange={setOrigenFondos}>
                    <SelectTrigger className="h-14 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CAJA_POS">{GAVETA} (efectivo del mostrador)</SelectItem>
                      <SelectItem value="CAJA_GENERAL">{BOVEDA} (dinero guardado aparte)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">Descripción</Label>
                  <Input required value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    placeholder="Ej. Pago de Internet mes de Marzo"
                    className="h-12" />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">Categoría (opcional)</Label>
                    <Button type="button" variant="link" onClick={() => setShowNewCatDialog(true)}
                      className="h-auto p-0 text-xs text-primary">
                      + Nueva
                    </Button>
                  </div>
                  <Select value={categoriaId} onValueChange={setCategoriaId}>
                    <SelectTrigger className="h-12 w-full">
                      <SelectValue placeholder="Sin categoría (se guarda en Otros)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_CATEGORIA}>Sin categoría (Otros)</SelectItem>
                      {categorias.map(cat => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>{cat.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {origenFondos === "CAJA_GENERAL" && (
                    <p className="pl-1 text-xs text-muted-foreground">Se paga desde la bóveda; no hace falta turno abierto</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" disabled={submitLoading || loading} className="h-12 gap-2 px-8">
                  {submitLoading ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> Registrando…</>
                  ) : (
                    "Registrar gasto"
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Deudas con proveedores (compras al crédito) */}
          <DeudasProveedores onPagado={loadData} />

          {/* Historial de gastos recientes */}
          <div className="rounded-sm border border-border bg-card p-5 md:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold">Últimos gastos</h2>
            </div>

            {loading && gastosRecientes.length === 0 ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : gastosRecientes.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No hay gastos registrados recientemente.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {gastosRecientes.map(gasto => (
                  <div key={gasto.id} className="flex flex-col justify-between gap-3 rounded-sm border border-border px-4 py-3 md:flex-row md:items-center">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-primary/10 font-semibold text-primary">
                        {gasto.categorias_gastos?.nombre?.charAt(0) || '-'}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{gasto.descripcion}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{new Date(gasto.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>·</span>
                          <span>{gasto.categorias_gastos?.nombre || 'Sin categoría'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 self-start font-mono text-lg font-semibold text-destructive md:self-auto">
                      -{parseFloat(gasto.monto).toLocaleString("en-US", { style: "currency", currency: "USD" })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════ DIALOG: NUEVA CATEGORÍA ════════ */}
      <Dialog open={showNewCatDialog} onOpenChange={setShowNewCatDialog}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" /> Nueva categoría de gasto
            </DialogTitle>
            <DialogDescription>
              Define el nombre y tipo de gasto para organizar tus egresos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCategory} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Nombre de la categoría</Label>
              <Input required value={newCatNombre}
                onChange={(e) => setNewCatNombre(e.target.value)}
                placeholder="Ej. Suministros de Oficina"
                className="h-12"
                autoFocus />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Tipo de gasto</Label>
              <Select value={newCatTipo} onValueChange={setNewCatTipo}>
                <SelectTrigger className="h-12 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VARIABLE">Variable (Ej. Reparaciones)</SelectItem>
                  <SelectItem value="FIJO">Fijo (Ej. Alquiler, Luz)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowNewCatDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={newCatLoading} className="gap-2">
                {newCatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                Crear categoría
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
