'use client'

import * as React from "react"
import { Plus, X, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
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
import { MoneyValue } from "@/components/money-value"
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
        className="flex h-9 cursor-pointer items-center justify-between rounded-sm border border-input bg-transparent px-3 text-sm outline-none focus:border-ring"
        onClick={() => setOpen(!open)}
      >
        <span className={cn("truncate", !selectedProduct && "text-muted-foreground")}>
          {selectedProduct ? selectedProduct.nombre : "Seleccionar…"}
        </span>
      </div>
      {open && (
        <div className="absolute left-0 top-10 z-50 mt-1 w-full overflow-hidden rounded-sm border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              className="h-8 w-full rounded-sm border border-input bg-transparent px-2 text-xs outline-none focus:border-ring"
              placeholder="Buscar por nombre o código…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && <div className="p-2 text-center text-xs text-muted-foreground">No encontrado</div>}
            {filtered.map(p => (
              <div
                key={p.id}
                className={cn(
                  "cursor-pointer rounded-sm p-2 text-sm",
                  value === String(p.id)
                    ? "bg-primary font-medium text-primary-foreground"
                    : "hover:bg-muted",
                )}
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
  /** Modo "carga inicial de inventario" (Bloque 1.F): aporte del dueño en
   * especie. Fuerza origen CAPITAL_DUEÑOS + PAGADO y oculta esos selectores. */
  inicial?: boolean
}

export function CompraForm({ productos, onSuccess, inicial = false }: CompraFormProps) {
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
        toast.warning("El código escaneado no pertenece a ningún producto registrado.")
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

    const invalidLines = lineas.filter(l => !l.producto_id || (parseFloat(l.cantidad_inicial) || 0) <= 0 || (parseFloat(l.costo_unitario_adquisicion) || 0) <= 0)
    if (invalidLines.length > 0) {
      setError("Todos los lotes deben tener producto, cantidad > 0 y costo > 0")
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
            cantidad_inicial: parseFloat(l.cantidad_inicial) || 0,
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
    <form onSubmit={handleSubmit} className="flex max-w-4xl flex-col gap-6">
      {error && (
        <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-sm border border-success/20 bg-success/10 p-3 text-sm font-medium text-success">
          {success}
        </div>
      )}

      {/* Cabecera de la compra */}
      <div className="flex flex-col gap-4 rounded-sm border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">{inicial ? "Inventario inicial" : "Datos de la compra"}</h3>

        {inicial && (
          <p className="rounded-sm bg-muted/50 p-3 text-xs text-muted-foreground">
            Registra el stock con el que ya arranca la tienda. Se contabiliza como
            aporte del dueño en especie (capital), sin salida de caja ni turno abierto.
          </p>
        )}

        <div className={inicial ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 gap-4 md:grid-cols-3"}>
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-muted-foreground">
              {inicial ? "Origen del inventario" : "Proveedor"}
            </Label>
            <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} required
              placeholder={inicial ? "Ej. Inventario propio inicial" : "Nombre del proveedor"} className="h-11" />
          </div>

          {!inicial && (
            <>
              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Estado de pago</Label>
                <Select value={estadoPago} onValueChange={setEstadoPago}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAGADO">Pagado</SelectItem>
                    <SelectItem value="AL_CREDITO">Al crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs font-medium text-muted-foreground">Origen de fondos</Label>
                <Select value={origenFondos} onValueChange={setOrigenFondos}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAPITAL_DUEÑOS">Capital dueños</SelectItem>
                    <SelectItem value="CAJA_GENERAL">Caja general</SelectItem>
                    <SelectItem value="CAJA_POS">Caja POS (requiere turno abierto)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Líneas de lotes */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Lotes de inventario</h3>
          <Button type="button" variant="outline" size="sm" onClick={addLinea} className="h-9 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Agregar lote
          </Button>
        </div>

        {lineas.length === 0 && (
          <div className="rounded-sm border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">No hay lotes. Haz clic en &quot;Agregar lote&quot; para añadir productos a esta compra.</p>
          </div>
        )}

        {lineas.map((linea, idx) => (
          <div key={linea.key} className="rounded-sm border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lote #{idx + 1}</span>
              <Button type="button" variant="ghost" size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeLinea(linea.key)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="col-span-2">
                <Label className="mb-1 block text-xs font-medium text-muted-foreground">Producto</Label>
                <ProductSearchableSelect
                  productos={productos}
                  value={linea.producto_id}
                  onChange={(v) => updateLinea(linea.key, "producto_id", v)}
                />
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-muted-foreground">Cantidad</Label>
                <Input type="number" min={0.001} step="0.001" inputMode="decimal" value={linea.cantidad_inicial}
                  onChange={(e) => updateLinea(linea.key, "cantidad_inicial", e.target.value)}
                  className="h-9 font-mono text-sm" />
              </div>

              <div>
                <Label className="mb-1 block text-xs font-medium text-muted-foreground">Costo unit. ($)</Label>
                <Input type="number" min={0} step="0.01" value={linea.costo_unitario_adquisicion}
                  onChange={(e) => updateLinea(linea.key, "costo_unitario_adquisicion", e.target.value)}
                  className="h-9 font-mono text-sm" />
              </div>

              <div className="col-span-2">
                <Label className="mb-1 block text-xs font-medium text-muted-foreground">Vencimiento (opcional)</Label>
                <Input type="date" value={linea.fecha_vencimiento}
                  onChange={(e) => updateLinea(linea.key, "fecha_vencimiento", e.target.value)}
                  className="h-9 text-sm" />
              </div>

              <div className="col-span-2 flex items-end justify-end">
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">Subtotal: </span>
                  <MoneyValue
                    value={(parseFloat(linea.cantidad_inicial) || 0) * (parseFloat(linea.costo_unitario_adquisicion) || 0)}
                    className="text-sm font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer con total y botón */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-sm border border-border bg-card p-5 md:flex-row">
        <div>
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Monto total calculado</p>
          <MoneyValue value={montoTotal} className="text-3xl font-bold tracking-tight" />
        </div>

        <Button type="submit" disabled={loading || lineas.length === 0} className="h-12 gap-2 px-8">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Registrando…
            </>
          ) : (
            inicial ? "Cargar inventario inicial" : "Registrar compra"
          )}
        </Button>
      </div>
    </form>
  )
}
