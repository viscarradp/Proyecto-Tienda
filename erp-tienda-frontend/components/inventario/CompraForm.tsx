'use client'

import * as React from "react"
import { Plus, X, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { apiFetch } from "@/lib/api"
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner"

// ─── Types ───
interface Producto {
  id: number
  nombre: string
  presentaciones: {
    id: number
    codigo_barras: string | null
  }[]
}

// ─── Custom Searchable Select ───
function ProductSearchableSelect({ 
  productos, 
  value, 
  onChange 
}: { 
  productos: Producto[]
  value: string
  onChange: (v: string) => void 
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filtered = productos.filter(p => 
    p.nombre.toLowerCase().includes(search.toLowerCase()) || 
    p.presentaciones.some(pres => pres.codigo_barras === search)
  )
  const selectedProduct = productos.find(p => String(p.id) === value)

  return (
    <div className="relative" ref={ref}>
      <div 
        className="flex items-center justify-between bg-black/50 border border-zinc-800 text-white h-9 rounded-lg text-sm px-3 shadow-none focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{selectedProduct ? selectedProduct.nombre : "Seleccionar..."}</span>
      </div>
      {open && (
        <div className="absolute top-10 left-0 w-full z-50 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl overflow-hidden mt-1">
          <div className="p-2 border-b border-zinc-900 bg-black/50">
            <input 
              autoFocus
              className="w-full h-8 px-2 text-xs bg-zinc-900 border border-zinc-800 rounded text-white focus:outline-none focus:border-blue-500" 
              placeholder="Buscar por nombre o código..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1 text-zinc-300">
            {filtered.length === 0 && <div className="p-2 text-xs text-zinc-500 text-center">No encontrado</div>}
            {filtered.map(p => (
              <div 
                key={p.id} 
                className={`p-2 text-sm rounded cursor-pointer ${value === String(p.id) ? 'bg-blue-600 font-bold text-white' : 'hover:bg-zinc-800 hover:text-white'}`}
                onClick={() => { onChange(String(p.id)); setOpen(false); setSearch("") }}
              >
                {p.nombre}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface LoteLineForm {
  key: string
  producto_id: string
  cantidad_inicial: string
  costo_unitario_adquisicion: string
  fecha_vencimiento: string
}

interface CompraFormProps {
  productos: Producto[]
  onSuccess: () => void
}

export function CompraForm({ productos, onSuccess }: CompraFormProps) {
  const [proveedor, setProveedor] = React.useState("")
  const [estadoPago, setEstadoPago] = React.useState("PAGADO")
  const [origenFondos, setOrigenFondos] = React.useState("CAPITAL_DUEÑOS")
  const [lineas, setLineas] = React.useState<LoteLineForm[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [success, setSuccess] = React.useState("")

  const addLinea = () => {
    setLineas([...lineas, {
      key: crypto.randomUUID(),
      producto_id: "",
      cantidad_inicial: "1",
      costo_unitario_adquisicion: "",
      fecha_vencimiento: "",
    }])
  }

  const updateLinea = (key: string, field: keyof LoteLineForm, value: string) => {
    setLineas(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l))
  }

  const removeLinea = (key: string) => {
    setLineas(prev => prev.filter(l => l.key !== key))
  }

  // ─── Auto-Add Lot with Barcode ───
  useBarcodeScanner({
    enabled: true,
    onScan: (barcode) => {
      const targetProd = productos.find(p => p.presentaciones.some(pres => pres.codigo_barras === barcode))
      
      if (targetProd) {
        setLineas(prev => [...prev, {
          key: crypto.randomUUID(),
          producto_id: String(targetProd.id),
          cantidad_inicial: "1",
          costo_unitario_adquisicion: "",
          fecha_vencimiento: "",
        }])
      } else {
        alert("El código escaneado no pertenece a ningún producto registrado.")
      }
    }
  })

  // ─── Cálculo automático del monto total ───
  const montoTotal = lineas.reduce((sum, l) => {
    const qty = parseFloat(l.cantidad_inicial) || 0
    const cost = parseFloat(l.costo_unitario_adquisicion) || 0
    return sum + (qty * cost)
  }, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    if (lineas.length === 0) {
      setError("Debes agregar al menos un lote de producto")
      setLoading(false)
      return
    }

    const invalidLines = lineas.filter(l => !l.producto_id || (parseFloat(l.cantidad_inicial) || 0) < 1 || (parseFloat(l.costo_unitario_adquisicion) || 0) <= 0)
    if (invalidLines.length > 0) {
      setError("Todos los lotes deben tener producto, cantidad ≥ 1 y costo > 0")
      setLoading(false)
      return
    }

    try {
      await apiFetch("/compras", {
        method: "POST",
        body: JSON.stringify({
          proveedor,
          monto_total: montoTotal,
          estado_pago: estadoPago,
          origen_fondos: origenFondos,
          detalles_lotes: lineas.map(l => ({
            producto_id: parseInt(l.producto_id),
            cantidad_inicial: parseInt(l.cantidad_inicial) || 0,
            costo_unitario_adquisicion: parseFloat(l.costo_unitario_adquisicion) || 0,
            fecha_vencimiento: l.fecha_vencimiento || undefined,
          })),
        }),
      })

      setSuccess("Compra registrada exitosamente. Los lotes de inventario fueron creados.")
      setProveedor("")
      setEstadoPago("PAGADO")
      setOrigenFondos("CAPITAL_DUEÑOS")
      setLineas([])
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al registrar la compra")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl font-medium">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-3 rounded-xl font-medium">
          {success}
        </div>
      )}

      {/* Cabecera de la compra */}
      <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-black text-zinc-300 uppercase tracking-wider">Datos de la Compra</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Proveedor</Label>
            <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} required
              placeholder="Nombre del proveedor"
              className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl focus-visible:ring-blue-500" />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Estado de Pago</Label>
            <Select value={estadoPago} onValueChange={setEstadoPago}>
              <SelectTrigger className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800">
                <SelectItem value="PAGADO" className="text-zinc-200 focus:bg-zinc-800 focus:text-white">Pagado</SelectItem>
                <SelectItem value="AL_CREDITO" className="text-zinc-200 focus:bg-zinc-800 focus:text-white">Al Crédito</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Origen de Fondos</Label>
            <Select value={origenFondos} onValueChange={setOrigenFondos}>
              <SelectTrigger className="bg-black/50 border-zinc-800 text-white h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800">
                <SelectItem value="CAPITAL_DUEÑOS" className="text-zinc-200 focus:bg-zinc-800 focus:text-white">Capital Dueños</SelectItem>
                <SelectItem value="CAJA_GENERAL" className="text-zinc-200 focus:bg-zinc-800 focus:text-white">Caja General</SelectItem>
                <SelectItem value="CAJA_POS" className="text-zinc-200 focus:bg-zinc-800 focus:text-white">Caja POS (requiere turno abierto)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Líneas de lotes */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-zinc-300 uppercase tracking-wider">Lotes de Inventario</h3>
          <Button type="button" variant="outline" size="sm" onClick={addLinea}
            className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-white rounded-xl gap-1.5 h-9 text-xs font-bold">
            <Plus className="h-3.5 w-3.5" /> Agregar Lote
          </Button>
        </div>

        {lineas.length === 0 && (
          <div className="border border-dashed border-zinc-800 rounded-2xl p-10 text-center">
            <p className="text-zinc-600 text-sm font-medium">No hay lotes. Haz clic en &quot;Agregar Lote&quot; para añadir productos a esta compra.</p>
          </div>
        )}

        {lineas.map((linea, idx) => (
          <div key={linea.key} className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-4 relative">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Lote #{idx + 1}</span>
              <Button type="button" variant="ghost" size="icon"
                className="h-6 w-6 text-zinc-600 hover:text-red-400"
                onClick={() => removeLinea(linea.key)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Producto</Label>
                <ProductSearchableSelect 
                  productos={productos} 
                  value={linea.producto_id} 
                  onChange={(v) => updateLinea(linea.key, "producto_id", v)} 
                />
              </div>

              <div>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Cantidad</Label>
                <Input type="number" min={1} value={linea.cantidad_inicial}
                  onChange={(e) => updateLinea(linea.key, "cantidad_inicial", e.target.value)}
                  className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
              </div>

              <div>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Costo Unit. ($)</Label>
                <Input type="number" min={0} step="0.01" value={linea.costo_unitario_adquisicion}
                  onChange={(e) => updateLinea(linea.key, "costo_unitario_adquisicion", e.target.value)}
                  className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
              </div>

              <div className="col-span-2">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1 block">Vencimiento (Opcional)</Label>
                <Input type="date" value={linea.fecha_vencimiento}
                  onChange={(e) => updateLinea(linea.key, "fecha_vencimiento", e.target.value)}
                  className="bg-black/50 border-zinc-800 text-white h-9 rounded-lg text-sm focus-visible:ring-blue-500" />
              </div>

              <div className="col-span-2 flex items-end">
                <div className="text-right w-full">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Subtotal: </span>
                  <span className="text-sm font-black text-white">
                    ${((parseFloat(linea.cantidad_inicial) || 0) * (parseFloat(linea.costo_unitario_adquisicion) || 0)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer con total y botón */}
      <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-0.5">Monto Total Calculado</p>
          <p className="text-3xl font-black text-white tracking-tighter">${montoTotal.toFixed(2)}</p>
        </div>

        <Button type="submit" disabled={loading || lineas.length === 0}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl h-12 px-8 shadow-lg shadow-blue-900/20 gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Registrando...
            </>
          ) : (
            "Registrar Compra"
          )}
        </Button>
      </div>
    </form>
  )
}
