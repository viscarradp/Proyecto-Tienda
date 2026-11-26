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
  Undo2,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatCard } from "@/components/stat-card"
import { CampoError } from "@/components/campo-error"
import { SeccionTitulo } from "@/components/seccion-titulo"
import { apiFetch } from "@/lib/api"
import { formatFecha, formatMoney } from "@/lib/format"
import { DeudasProveedores } from "@/components/gastos/DeudasProveedores"
import { GAVETA, BOVEDA, mensajeError } from "@/lib/glosario"
import { AnularDialog, AnuladoNota, type AnularObjetivo } from "@/components/gastos/AnularDialog"
import { EsqueletoPagina } from "@/components/esqueleto-pagina"

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
  caja_turno_id: number | null
  cuenta_origen: string | null
  categorias_gastos?: CategoriaGasto
  anulado: boolean
  motivo_anulacion: string | null
  anulado_por?: { nombre: string } | null
}

export default function GastosPage() {
  const [mounted, setMounted] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

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
  const [aAnular, setAAnular] = React.useState<AnularObjetivo | null>(null)
  // Errores de campo del gasto: salen junto al campo (VIS-24).
  const [errores, setErrores] = React.useState<{ monto?: string; descripcion?: string; origen?: string }>({})

  // New Category Modal State
  const [showNewCatDialog, setShowNewCatDialog] = React.useState(false)
  const [newCatNombre, setNewCatNombre] = React.useState("")
  // El tipo (fijo/variable) no lo usa ningún reporte: se guarda siempre como variable (DUE-20).
  const [newCatLoading, setNewCatLoading] = React.useState(false)
  const [newCatError, setNewCatError] = React.useState("")

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

    const montoParsed = parseFloat(monto)
    const nuevos: typeof errores = {}
    if (isNaN(montoParsed) || montoParsed <= 0) nuevos.monto = "Escribe un monto mayor a 0."
    if (!descripcion.trim()) nuevos.descripcion = "Escribe en qué se gastó."
    if (origenFondos === "CAJA_POS" && !cajaActiva) {
      nuevos.origen = `No hay caja abierta: ábrela en Vender, o paga el gasto desde la ${BOVEDA.toLowerCase()}.`
    }
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

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

      toast.success(`Gasto registrado: ${formatMoney(montoParsed)}`)
      for (const aviso of resp.avisos ?? []) {
        toast.warning(aviso, { duration: 12000 })
      }
      setDescripcion("")
      setMonto("")

      // Recargar saldos
      loadData()

    } catch (err: unknown) {
      setError(mensajeError("registrar el gasto", err))
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatNombre.trim()) {
      setNewCatError("Escribe el nombre de la categoría.")
      return
    }

    setNewCatLoading(true)
    setNewCatError("")
    try {
      await apiFetch("/categorias-gastos", {
        method: "POST",
        body: JSON.stringify({
          nombre: newCatNombre.trim(),
          tipo: "VARIABLE"
        })
      })

      // Refresh categories
      const updatedCats = await apiFetch<CategoriaGasto[]>("/categorias-gastos")
      setCategorias(updatedCats)

      setNewCatNombre("")
      setShowNewCatDialog(false)
      toast.success("Categoría creada")
    } catch (err: unknown) {
      // Dentro del diálogo: el error de la página queda tapado por el diálogo (DUE-20).
      setNewCatError(mensajeError("crear la categoría", err))
    } finally {
      setNewCatLoading(false)
    }
  }

  const pedirAnular = (g: MovimientoFinanciero) => {
    const monto = formatMoney(g.monto)
    const lugar = g.cuenta_origen === "BOVEDA" ? `la ${BOVEDA.toLowerCase()}` : `la ${GAVETA.toLowerCase()}`
    setAAnular({
      endpoint: `/movimientos-financieros/${g.id}/anular`,
      titulo: "Anular gasto",
      efecto: `Se devolverán ${monto} a ${lugar} y el gasto «${g.descripcion}» dejará de contar. Queda marcado como anulado, no se borra.`,
    })
  }

  // Un gasto de la gaveta solo se anula mientras su turno siga abierto.
  const sePuedeAnular = (g: MovimientoFinanciero) =>
    !g.anulado && (g.cuenta_origen === "BOVEDA" || (g.caja_turno_id !== null && g.caja_turno_id === cajaActiva?.id))
  // Si no se puede, se muestra el botón apagado con el motivo (en vez de esconderlo).
  const MOTIVO_TURNO_CERRADO = "Esa caja ya se cerró: el dinero ya se contó al cerrar."

  if (!mounted) return <EsqueletoPagina />

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:px-8 lg:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Gastos</h1>
            <p className="text-xs text-muted-foreground">Lo que pagas para que el negocio funcione</p>
          </div>
          <Button aria-label="Actualizar gastos" variant="outline" size="icon" onClick={loadData} disabled={loading} className="shrink-0">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">

          {/* Tarjetas de saldo */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {cajaActiva ? (
              <StatCard
                label={GAVETA}
                icon={Store}
                size="lg"
                value={formatMoney(cajaActiva.efectivo_esperado || cajaActiva.fondo_inicial)}
                hint={
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Caja abierta
                  </span>
                }
              />
            ) : (
              <StatCard
                label={GAVETA}
                icon={Store}
                size="lg"
                hint={
                  <span className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-warning-text" /> No hay caja abierta
                  </span>
                }
              />
            )}

            {cajaGeneral ? (
              <StatCard
                label={BOVEDA}
                icon={Wallet}
                size="lg"
                value={formatMoney(cajaGeneral.saldo_actual)}
                tone={parseFloat(cajaGeneral.saldo_actual) < 0 ? "warning" : "default"}
                hint={
                  parseFloat(cajaGeneral.saldo_actual) < 0 ? (
                    <span className="font-medium text-warning-text">
                      Negativo según el sistema: falta registrar efectivo. Cuenta la bóveda o pon dinero en Estadísticas.
                    </span>
                  ) : (
                    "Dinero disponible"
                  )
                }
              />
            ) : (
              <StatCard
                label={BOVEDA}
                icon={Wallet}
                size="lg"
                hint={
                  <span className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-warning-text" /> No disponible o vacía
                  </span>
                }
              />
            )}
          </div>

          {/* Formulario de registro */}
          <div className="rounded-sm border border-border bg-card p-5 md:p-6">
            <SeccionTitulo icono={PlusCircle} className="mb-6">Nuevo gasto</SeccionTitulo>

            {error && <CampoError className="mb-5 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium">{error}</CampoError>}

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="gastos-monto-del-gasto" className="text-xs font-medium text-muted-foreground">Monto del gasto ($)</Label>
                  <Input id="gastos-monto-del-gasto" type="number" min={0.01} step="0.01" value={monto}
                    onChange={e => { setMonto(e.target.value); setErrores(p => ({ ...p, monto: undefined })) }}
                    placeholder="0.00"
                    size="lg"
                    className="font-mono text-2xl font-bold"
                    aria-invalid={!!errores.monto}
                    aria-describedby={errores.monto ? "gastos-monto-error" : undefined} />
                  {errores.monto && <CampoError id="gastos-monto-error">{errores.monto}</CampoError>}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="gastos-de-donde-sale-el-dinero" className="text-xs font-medium text-muted-foreground">¿De dónde sale el dinero?</Label>
                  <Select value={origenFondos} onValueChange={(v) => { setOrigenFondos(v); setErrores(p => ({ ...p, origen: undefined })) }}>
                    <SelectTrigger
                      id="gastos-de-donde-sale-el-dinero"
                      className="w-full"
                      aria-invalid={!!errores.origen}
                      aria-describedby={errores.origen ? "gastos-origen-error" : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CAJA_POS">{GAVETA} (efectivo del mostrador)</SelectItem>
                      <SelectItem value="CAJA_GENERAL">{BOVEDA} (dinero guardado aparte)</SelectItem>
                    </SelectContent>
                  </Select>
                  {errores.origen && <CampoError id="gastos-origen-error">{errores.origen}</CampoError>}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="gastos-descripcion" className="text-xs font-medium text-muted-foreground">Descripción</Label>
                  <Input id="gastos-descripcion" value={descripcion}
                    onChange={e => { setDescripcion(e.target.value); setErrores(p => ({ ...p, descripcion: undefined })) }}
                    placeholder="Ej. Pago de Internet mes de Marzo"
                    aria-invalid={!!errores.descripcion}
                    aria-describedby={errores.descripcion ? "gastos-descripcion-error" : undefined} />
                  {errores.descripcion && <CampoError id="gastos-descripcion-error">{errores.descripcion}</CampoError>}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="gastos-categoria-opcional" className="text-xs font-medium text-muted-foreground">Categoría (opcional)</Label>
                    <Button type="button" variant="link" size="sm" onClick={() => { setNewCatError(""); setShowNewCatDialog(true) }}
                      className="px-0 text-xs">
                      + Nueva
                    </Button>
                  </div>
                  <Select value={categoriaId} onValueChange={setCategoriaId}>
                    <SelectTrigger id="gastos-categoria-opcional" className="w-full">
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
                    <p className="pl-1 text-xs text-muted-foreground">Se paga desde la bóveda; no hace falta caja abierta</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end border-t border-border pt-4">
                <Button type="submit" size="lg" disabled={submitLoading || loading} className="px-8">
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
            <SeccionTitulo icono={Receipt} className="mb-4">Últimos gastos</SeccionTitulo>

            {loading && gastosRecientes.length === 0 ? (
              <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : gastosRecientes.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Todavía no hay gastos. Anota el primero arriba.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {gastosRecientes.map(gasto => (
                  <div key={gasto.id} className={cn("flex flex-col justify-between gap-3 rounded-sm border border-border px-4 py-3 md:flex-row md:items-center", gasto.anulado && "bg-muted/30")}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-muted font-semibold text-muted-foreground">
                        {gasto.categorias_gastos?.nombre?.charAt(0) || '-'}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("truncate font-medium", gasto.anulado && "text-muted-foreground line-through")}>{gasto.descripcion}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{formatFecha(gasto.fecha, "con hora")}</span>
                          <span>·</span>
                          <span>{gasto.categorias_gastos?.nombre || 'Sin categoría'}</span>
                        </div>
                        {gasto.anulado && <AnuladoNota motivo={gasto.motivo_anulacion} quien={gasto.anulado_por?.nombre} />}
                        {!gasto.anulado && !sePuedeAnular(gasto) && (
                          <p id={`no-anular-gasto-${gasto.id}`} className="mt-0.5 text-xs text-muted-foreground">{MOTIVO_TURNO_CERRADO}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 self-start md:self-auto">
                      {sePuedeAnular(gasto) && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => pedirAnular(gasto)}>
                          <Undo2 className="h-3.5 w-3.5" /> Anular
                        </Button>
                      )}
                      {!gasto.anulado && !sePuedeAnular(gasto) && (
                        <Button variant="outline" size="sm" className="gap-1" disabled title={MOTIVO_TURNO_CERRADO} aria-describedby={`no-anular-gasto-${gasto.id}`}>
                          <Undo2 className="h-3.5 w-3.5" /> Anular
                        </Button>
                      )}
                      <div className={cn("font-mono text-lg font-semibold text-foreground", gasto.anulado && "text-muted-foreground line-through")}>
                        -{formatMoney(gasto.monto)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnularDialog objetivo={aAnular} onClose={() => setAAnular(null)} onHecho={loadData} />

      {/* ════════ DIALOG: NUEVA CATEGORÍA ════════ */}
      <Dialog open={showNewCatDialog} onOpenChange={setShowNewCatDialog}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-primary" /> Nueva categoría de gasto
            </DialogTitle>
            <DialogDescription>
              Ponle un nombre para organizar tus gastos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCategory} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="gastos-nombre-de-la-categoria" className="text-xs font-medium text-muted-foreground">Nombre de la categoría</Label>
              <Input id="gastos-nombre-de-la-categoria" value={newCatNombre}
                onChange={(e) => { setNewCatNombre(e.target.value); setNewCatError("") }}
                placeholder="Ej. Suministros de Oficina"
                aria-invalid={!!newCatError}
                aria-describedby={newCatError ? "gastos-nombre-categoria-error" : undefined}
                autoFocus />
              {newCatError && <CampoError id="gastos-nombre-categoria-error">{newCatError}</CampoError>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewCatDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={newCatLoading} className="gap-2">
                {newCatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                Crear categoría
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
