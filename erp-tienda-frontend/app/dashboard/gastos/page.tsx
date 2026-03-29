'use client'

import * as React from "react"
import {
  Banknote,
  Receipt,
  Store,
  Wallet,
  Loader2,
  AlertTriangle,
  RefreshCw,
  PlusCircle,
  CheckCircle2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { apiFetch } from "@/lib/api"

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
      
    } catch (err: unknown) {
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
      setError("No hay un turno de caja abierto para registrar el gasto en POS.")
      return
    }

    // Validar fondos suficientes
    if (origenFondos === "CAJA_POS" && cajaActiva) {
      const esperado = parseFloat(cajaActiva.efectivo_esperado || cajaActiva.fondo_inicial)
      if (montoParsed > esperado) {
        setError(`Fondos insuficientes en Caja POS. Disponible: $${esperado.toFixed(2)}`)
        return
      }
    } else if (origenFondos === "CAJA_GENERAL" && cajaGeneral) {
      const disponible = parseFloat(cajaGeneral.saldo_actual)
      if (montoParsed > disponible) {
        setError(`Fondos insuficientes en Bóveda. Disponible: $${disponible.toFixed(2)}`)
        return
      }
    }

    setSubmitLoading(true)
    try {
      if (origenFondos === "CAJA_POS") {
        if (!categoriaId) throw new Error("Selecciona una categoría de gasto.")
        await apiFetch("/movimientos-financieros", {
          method: "POST",
          body: JSON.stringify({
            caja_turno_id: cajaActiva!.id,
            tipo_movimiento: 'EGRESO_OPERATIVO',
            monto: montoParsed,
            descripcion: descripcion,
            categoria_gasto_id: parseInt(categoriaId)
          })
        })
      } else {
        await apiFetch("/caja-general", {
          method: "POST",
          body: JSON.stringify({
            monto: -montoParsed, // En negativo porque es un retiro manual
            descripcion: descripcion + (categoriaId ? ` (Cat: ${categorias.find(c => c.id.toString() === categoriaId)?.nombre})` : '')
          })
        })
      }

      setSuccess("¡Gasto registrado exitosamente!")
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
    <>
      <div className="flex flex-col h-full bg-black text-slate-200">
        <header className="sticky top-0 z-20 bg-black/60 backdrop-blur-xl border-b border-zinc-900 px-6 py-5 lg:px-8 lg:py-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-1.5 bg-rose-500 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white uppercase flex items-center gap-3">
                  <Receipt className="h-7 w-7 text-rose-400" />
                  Control de Gastos
                </h1>
                <p className="text-xs font-bold text-zinc-500 tracking-[0.1em] mt-1">
                  REGISTRO DE EGRESOS OPERATIVOS
                </p>
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={loadData} disabled={loading}
              className="h-11 w-11 shrink-0 rounded-xl border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </header>

        <ScrollArea className="flex-1 px-4 py-8 md:px-8">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Tarjetas de Saldo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Store className="h-24 w-24 text-blue-500" />
                </div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Caja Registradora (POS)</p>
                {cajaActiva ? (
                  <>
                    <p className="text-4xl font-black text-white tracking-tight my-2">
                      ${parseFloat(cajaActiva.efectivo_esperado || cajaActiva.fondo_inicial).toFixed(2)}
                    </p>
                    <p className="text-xs font-bold text-blue-500 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Turno #{cajaActiva.id} Activo
                    </p>
                  </>
                ) : (
                  <div className="mt-4 flex items-center gap-2 text-zinc-600 font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-500/50" />
                    No hay turno abierto
                  </div>
                )}
              </div>

              <div className="bg-zinc-950/40 border border-zinc-900 rounded-3xl p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Wallet className="h-24 w-24 text-emerald-500" />
                </div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Caja General (Bóveda)</p>
                {cajaGeneral ? (
                  <>
                    <p className="text-4xl font-black text-white tracking-tight my-2">
                      ${parseFloat(cajaGeneral.saldo_actual).toFixed(2)}
                    </p>
                    <p className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5" /> Saldo disponible
                    </p>
                  </>
                ) : (
                  <div className="mt-4 flex items-center gap-2 text-zinc-600 font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-500/50" />
                    No disponible o vacía
                  </div>
                )}
              </div>
            </div>

            {/* Formulario de Registro */}
            <div className="bg-zinc-950/60 border border-zinc-900 rounded-3xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="h-8 w-8 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                  <PlusCircle className="h-4 w-4 text-rose-500" />
                </div>
                <h2 className="text-lg font-black text-white uppercase tracking-wide">Nuevo Gasto</h2>
              </div>

              {error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-2xl font-bold flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 shrink-0" /> {error}
                </div>
              )}
              {success && (
                <div className="mb-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-4 rounded-2xl font-bold flex items-center gap-3 animate-in fade-in">
                  <CheckCircle2 className="h-5 w-5 shrink-0" /> {success}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Monto del Gasto ($)</Label>
                    <Input type="number" min={0.01} step="0.01" required value={monto} 
                      onChange={e => setMonto(e.target.value)}
                      placeholder="0.00"
                      className="bg-black/50 border-zinc-800 text-white h-14 rounded-2xl text-2xl font-black pl-5 focus-visible:ring-rose-500" />
                  </div>

                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Origen de los Fondos</Label>
                    <Select value={origenFondos} onValueChange={setOrigenFondos}>
                      <SelectTrigger className="bg-black/50 border-zinc-800 text-white h-14 rounded-2xl px-5 font-bold focus:ring-rose-500">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800">
                        <SelectItem value="CAJA_POS" className="font-bold text-zinc-300 focus:bg-zinc-900 focus:text-white py-3">Caja Registradora (POS)</SelectItem>
                        <SelectItem value="CAJA_GENERAL" className="font-bold text-zinc-300 focus:bg-zinc-900 focus:text-white py-3">Caja General (Bóveda)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2.5">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Descripción</Label>
                    <Input required value={descripcion} 
                      onChange={e => setDescripcion(e.target.value)}
                      placeholder="Ej. Pago de Internet mes de Marzo"
                      className="bg-black/50 border-zinc-800 text-white h-12 rounded-xl px-4 font-medium focus-visible:ring-rose-500" />
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Categoría</Label>
                      <Button type="button" variant="link" onClick={() => setShowNewCatDialog(true)}
                        className="h-auto p-0 text-[10px] font-bold text-rose-500 hover:text-rose-400 uppercase tracking-wider">
                        + Nueva
                      </Button>
                    </div>
                    <Select value={categoriaId} onValueChange={setCategoriaId} required={origenFondos === "CAJA_POS"}>
                      <SelectTrigger className="bg-black/50 border-zinc-800 text-white h-12 rounded-xl px-4 font-medium focus:ring-rose-500">
                        <SelectValue placeholder="Selecciona una categoría..." />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-950 border-zinc-800">
                        {categorias.map(cat => (
                          <SelectItem key={cat.id} value={cat.id.toString()} className="text-zinc-300 focus:bg-zinc-900 focus:text-white">
                            {cat.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {origenFondos === "CAJA_GENERAL" && (
                      <p className="text-[10px] text-zinc-600 font-bold pl-1">Opcional para retiros de Bóveda</p>
                    )}
                  </div>

                </div>

                <div className="pt-4 border-t border-zinc-900 flex justify-end">
                  <Button type="submit" disabled={submitLoading || loading}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-black uppercase tracking-wide rounded-2xl h-14 px-10 shadow-[0_0_20px_rgba(244,63,94,0.3)] transition-all active:scale-95">
                    {submitLoading ? (
                      <><Loader2 className="h-5 w-5 animate-spin mr-3" /> Registrando...</>
                    ) : (
                      "Registrar Egreso"
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Historial de Gastos Recientes */}
            <div className="bg-zinc-950/60 border border-zinc-900 rounded-3xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <Receipt className="h-6 w-6 text-zinc-500" />
                <h2 className="text-lg font-black text-white uppercase tracking-wide">Últimos Gastos (POS)</h2>
              </div>
              
              {loading && gastosRecientes.length === 0 ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-zinc-500" /></div>
              ) : gastosRecientes.length === 0 ? (
                <div className="text-center p-8 text-zinc-500 font-bold border border-dashed border-zinc-800 rounded-2xl">
                  No hay gastos registrados recientemente.
                </div>
              ) : (
                <div className="space-y-3">
                  {gastosRecientes.map(gasto => (
                    <div key={gasto.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-zinc-900/40 border border-zinc-800 rounded-2xl gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 shrink-0 bg-rose-500/10 text-rose-500 rounded-xl flex items-center justify-center font-black">
                          {gasto.categorias_gastos?.nombre?.charAt(0) || '-'}
                        </div>
                        <div>
                          <p className="font-bold text-zinc-200">{gasto.descripcion}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                            <span>{new Date(gasto.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            <span>•</span>
                            <span className="text-rose-500/70">{gasto.categorias_gastos?.nombre || 'Sin categoría'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xl font-black text-rose-400 self-start md:self-auto shrink-0">
                        -${parseFloat(gasto.monto).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* ════════ DIALOG: NUEVA CATEGORÍA ════════ */}
      <Dialog open={showNewCatDialog} onOpenChange={setShowNewCatDialog}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-rose-500" /> Nueva Categoría de Gasto
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              Define el nombre y tipo de gasto para organizar tus egresos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateCategory} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Nombre de la Categoría</Label>
              <Input required value={newCatNombre}
                onChange={(e) => setNewCatNombre(e.target.value)}
                placeholder="Ej. Suministros de Oficina"
                className="bg-black/50 border-zinc-800 text-white h-12 rounded-xl focus-visible:ring-rose-500"
                autoFocus />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Tipo de Gasto</Label>
              <Select value={newCatTipo} onValueChange={setNewCatTipo}>
                <SelectTrigger className="bg-black/50 border-zinc-800 text-white h-12 rounded-xl px-4 font-medium focus:ring-rose-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800">
                  <SelectItem value="VARIABLE" className="text-zinc-300 focus:bg-zinc-900 focus:text-white">Variable (Ej. Reparaciones)</SelectItem>
                  <SelectItem value="FIJO" className="text-zinc-300 focus:bg-zinc-900 focus:text-white">Fijo (Ej. Alquiler, Luz)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" onClick={() => setShowNewCatDialog(false)}
                className="bg-zinc-800 text-white hover:bg-zinc-700 rounded-xl">Cancelar</Button>
              <Button type="submit" disabled={newCatLoading}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg gap-2">
                {newCatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                Crear Categoría
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
