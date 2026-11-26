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
import { formatMoney } from "@/lib/format"
import { GAVETA, BOVEDA, TERMINOS, mensajeError } from "@/lib/glosario"
import { CampoError } from "@/components/campo-error"
import { SeccionTitulo } from "@/components/seccion-titulo"
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner"
import { generarId } from "@/lib/id"

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
  onChange,
  id,
  invalid,
  describedBy,
}: {
  id?: string
  invalid?: boolean
  describedBy?: string
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

  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const close = (returnFocus: boolean) => {
    setOpen(false)
    setSearch("")
    if (returnFocus) triggerRef.current?.focus()
  }

  // Teclado: Esc cierra y devuelve el foco; flecha abajo/arriba recorre las opciones.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      close(true)
      return
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("input, [role='option']") ?? [])
    const idx = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === "ArrowDown" ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0)
    e.preventDefault()
    items[next]?.focus()
  }

  return (
    <div className="relative" ref={ref} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="flex h-11 w-full cursor-pointer items-center justify-between rounded-lg border border-input bg-transparent px-3 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-invalid:border-destructive data-invalid:ring-3 data-invalid:ring-destructive/20 md:h-10"
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <span className={cn("truncate", !selectedProduct && "text-muted-foreground")}>
          {selectedProduct ? selectedProduct.nombre : "Seleccionar…"}
        </span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-sm border border-border bg-popover shadow-lg">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              aria-label="Buscar producto por nombre o código"
              className="h-11 md:h-8 w-full rounded-sm border border-input bg-transparent px-2 text-base md:text-xs outline-none focus:border-ring"
              placeholder="Buscar por nombre o código…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div role="listbox" aria-label="Productos" className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 && <div className="p-2 text-center text-xs text-muted-foreground">No encontrado</div>}
            {filtered.map(p => (
              <button
                type="button"
                role="option"
                aria-selected={value === String(p.id)}
                key={p.id}
                className={cn(
                  "block min-h-11 w-full cursor-pointer rounded-sm p-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-0",
                  value === String(p.id)
                    ? "bg-primary font-medium text-primary-foreground"
                    : "hover:bg-muted",
                )}
                onClick={() => { onChange(String(p.id)); close(true) }}
              >
                {p.nombre}
              </button>
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
  /** Avisa si hay datos escritos (líneas o proveedor) y cuántas líneas hay. */
  onCambioSucio?: (sucio: boolean, lineas: number) => void
  /** Modo "carga inicial de inventario" (Bloque 1.F): aporte del dueño en
   * especie. Fuerza origen CAPITAL_DUEÑOS + PAGADO y oculta esos selectores. */
  inicial?: boolean
}

export function CompraForm({ productos, onSuccess, onCambioSucio, inicial = false }: CompraFormProps) {
  const [proveedor, setProveedor] = React.useState("")
  const [estadoPago, setEstadoPago] = React.useState("PAGADO")
  const [origenFondos, setOrigenFondos] = React.useState("")
  const [lineas, setLineas] = React.useState<LoteLineForm[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [intentado, setIntentado] = React.useState(false)
  const cambioSucioRef = React.useRef(onCambioSucio)
  React.useEffect(() => {
    cambioSucioRef.current = onCambioSucio
  })
  React.useEffect(() => {
    cambioSucioRef.current?.(lineas.length > 0 || proveedor.trim() !== "", lineas.length)
  }, [lineas.length, proveedor])

  const addLinea = () => {
    setLineas([...lineas, {
      key: generarId(),
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
          key: generarId(),
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

  const alCredito = !inicial && estadoPago === "AL_CREDITO"
  // La carga inicial siempre es aporte en especie; una compra pagada exige
  // elegir de dónde salió el dinero (sin valor por defecto: así no se olvida).
  const origen = inicial ? "CAPITAL_DUEÑOS" : origenFondos

  // Errores de campo: salen junto al campo una vez que se intentó registrar.
  const errProveedor = intentado && !proveedor.trim() ? "Escribe el nombre del proveedor." : null
  const errOrigen =
    intentado && !alCredito && !origen
      ? `Elige de dónde salió el dinero: ${GAVETA.toLowerCase()}, ${BOVEDA.toLowerCase()} o ${TERMINOS.aporteDuena.toLowerCase()}.`
      : null
  const errLinea = (l: LoteLineForm) => ({
    producto: intentado && !l.producto_id ? "Elige el producto." : null,
    cantidad: intentado && (parseFloat(l.cantidad_inicial) || 0) <= 0 ? "La cantidad debe ser mayor a 0." : null,
    costo: intentado && (parseFloat(l.costo_unitario_adquisicion) || 0) <= 0 ? "Escribe cuánto costó (mayor a 0)." : null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIntentado(true)
    setError("")

    if (lineas.length === 0) {
      setError("Agrega al menos un producto a la compra.")
      return
    }
    const hayErrores =
      !proveedor.trim() ||
      (!alCredito && !origen) ||
      lineas.some(l => !l.producto_id || (parseFloat(l.cantidad_inicial) || 0) <= 0 || (parseFloat(l.costo_unitario_adquisicion) || 0) <= 0)
    if (hayErrores) {
      setError("Revisa los campos marcados en rojo.")
      return
    }

    setLoading(true)
    try {
      const res = await apiFetch<{ avisos?: string[] }>("/compras", {
        method: "POST",
        body: JSON.stringify({
          proveedor,
          monto_total: montoTotal,
          estado_pago: estadoPago,
          ...(alCredito ? {} : { origen_fondos: origen }),
          detalles_lotes: lineas.map(l => ({
            producto_id: parseInt(l.producto_id),
            cantidad_inicial: parseFloat(l.cantidad_inicial) || 0,
            costo_unitario_adquisicion: parseFloat(l.costo_unitario_adquisicion) || 0,
            fecha_vencimiento: l.fecha_vencimiento || undefined,
          })),
        }),
      })

      toast.success(
        alCredito
          ? `Compra registrada · ${formatMoney(montoTotal)}. Quedó como deuda con el proveedor; la pagas desde Gastos → Deudas.`
          : `Compra registrada · ${formatMoney(montoTotal)}. La mercadería ya está en el inventario.`,
        { duration: 8000 },
      )
      for (const aviso of res?.avisos ?? []) toast.warning(aviso, { duration: 12000 })
      setProveedor("")
      setEstadoPago("PAGADO")
      setOrigenFondos("")
      setLineas([])
      setIntentado(false)
      onSuccess()
    } catch (err: unknown) {
      setError(mensajeError("registrar la compra", err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-w-4xl flex-col gap-6">
      {error && <CampoError className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium">{error}</CampoError>}

      {/* Cabecera de la compra */}
      <div className="flex flex-col gap-4 rounded-sm border border-border bg-card p-5">
        <SeccionTitulo>{inicial ? "Inventario inicial" : "Datos de la compra"}</SeccionTitulo>

        {inicial && (
          <p className="rounded-sm bg-muted/50 p-3 text-xs text-muted-foreground">
            Registra la mercadería con la que ya arranca la tienda. Se anota como «{TERMINOS.aporteDuena}», sin salida
            de la {GAVETA.toLowerCase()} ni turno abierto.
          </p>
        )}

        <div className={inicial ? "grid grid-cols-1 gap-4" : "grid grid-cols-1 gap-4 md:grid-cols-3"}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="compra-proveedor" className="text-xs font-medium text-muted-foreground">
              {inicial ? "¿De dónde viene este inventario?" : "Proveedor"}
            </Label>
            <Input id="compra-proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)}
              placeholder={inicial ? "Ej. Inventario propio inicial" : "Nombre del proveedor"}
              aria-invalid={!!errProveedor}
              aria-describedby={errProveedor ? "compra-proveedor-error" : undefined} />
            {errProveedor && <CampoError id="compra-proveedor-error">{errProveedor}</CampoError>}
          </div>

          {!inicial && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="compraform-estado-de-pago" className="text-xs font-medium text-muted-foreground">¿Ya la pagaste?</Label>
                <Select value={estadoPago} onValueChange={setEstadoPago}>
                  <SelectTrigger id="compraform-estado-de-pago" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAGADO">Ya la pagué</SelectItem>
                    <SelectItem value="AL_CREDITO">Al crédito (la debo)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {estadoPago !== "AL_CREDITO" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="compraform-de-donde-salio-el-dinero" className="text-xs font-medium text-muted-foreground">¿De dónde salió el dinero?</Label>
                  <Select value={origenFondos} onValueChange={setOrigenFondos}>
                    <SelectTrigger
                      id="compraform-de-donde-salio-el-dinero"
                      className="w-full"
                      aria-invalid={!!errOrigen}
                      aria-describedby={errOrigen ? "compra-origen-error" : undefined}
                    >
                      <SelectValue placeholder="Elige una opción" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CAJA_POS">{GAVETA} (requiere caja abierta)</SelectItem>
                      <SelectItem value="CAJA_GENERAL">{BOVEDA}</SelectItem>
                      <SelectItem value="CAPITAL_DUEÑOS">{TERMINOS.aporteDuena}</SelectItem>
                    </SelectContent>
                  </Select>
                  {errOrigen && <CampoError id="compra-origen-error">{errOrigen}</CampoError>}
                </div>
              )}
            </>
          )}
        </div>

        {!inicial && estadoPago === "AL_CREDITO" && (
          <p className="rounded-sm bg-muted/50 p-3 text-xs text-muted-foreground">
            Quedará como deuda con el proveedor; la pagas después en Gastos → Deudas.
          </p>
        )}
      </div>

      {/* Líneas de lotes */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SeccionTitulo>Productos de la compra</SeccionTitulo>
          <Button type="button" variant="outline" size="sm" onClick={addLinea} className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Agregar producto
          </Button>
        </div>

        {lineas.length === 0 && (
          <div className="rounded-sm border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">Todavía no hay productos. Toca «Agregar producto» (o escanea el código) para añadirlos a esta compra.</p>
          </div>
        )}

        {lineas.map((linea, idx) => {
          const errs = errLinea(linea)
          return (
          <div key={linea.key} className="rounded-sm border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Producto {idx + 1}</span>
              <Button type="button" variant="ghost" size="icon-xs"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Quitar el producto ${idx + 1}`}
                onClick={() => removeLinea(linea.key)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="col-span-2">
                <Label htmlFor={`compra-producto-${linea.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">Producto</Label>
                <ProductSearchableSelect
                  id={`compra-producto-${linea.key}`}
                  productos={productos}
                  value={linea.producto_id}
                  onChange={(v) => updateLinea(linea.key, "producto_id", v)}
                  invalid={!!errs.producto}
                  describedBy={errs.producto ? `compra-producto-${linea.key}-error` : undefined}
                />
                {errs.producto && <CampoError id={`compra-producto-${linea.key}-error`} className="mt-1">{errs.producto}</CampoError>}
              </div>

              <div>
                <Label htmlFor={`compra-cant-${linea.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">Cantidad</Label>
                <Input id={`compra-cant-${linea.key}`} type="number" min={0.001} step="0.001" inputMode="decimal" value={linea.cantidad_inicial}
                  onChange={(e) => updateLinea(linea.key, "cantidad_inicial", e.target.value)}
                  className="font-mono text-sm"
                  aria-invalid={!!errs.cantidad}
                  aria-describedby={errs.cantidad ? `compra-cant-${linea.key}-error` : undefined} />
                {errs.cantidad && <CampoError id={`compra-cant-${linea.key}-error`} className="mt-1">{errs.cantidad}</CampoError>}
              </div>

              <div>
                <Label htmlFor={`compra-costo-${linea.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">Costo por unidad ($)</Label>
                <Input id={`compra-costo-${linea.key}`} type="number" min={0} step="0.01" value={linea.costo_unitario_adquisicion}
                  onChange={(e) => updateLinea(linea.key, "costo_unitario_adquisicion", e.target.value)}
                  className="font-mono text-sm"
                  aria-invalid={!!errs.costo}
                  aria-describedby={errs.costo ? `compra-costo-${linea.key}-error` : undefined} />
                {errs.costo && <CampoError id={`compra-costo-${linea.key}-error`} className="mt-1">{errs.costo}</CampoError>}
              </div>

              <div className="col-span-2">
                <Label htmlFor={`compra-venc-${linea.key}`} className="mb-1 block text-xs font-medium text-muted-foreground">Vencimiento (opcional)</Label>
                <Input id={`compra-venc-${linea.key}`} type="date" value={linea.fecha_vencimiento}
                  onChange={(e) => updateLinea(linea.key, "fecha_vencimiento", e.target.value)}
                  className="text-sm" />
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
          )
        })}
      </div>

      {/* Footer con total y botón */}
      <div className="sticky bottom-0 z-10 -mb-6 flex flex-col items-center justify-between gap-4 rounded-sm border border-border bg-card p-4 shadow-[0_-6px_10px_-6px_rgb(0_0_0/0.15)] md:flex-row md:p-5">
        <div>
          <p className="mb-0.5 text-xs font-medium text-muted-foreground">Total de la compra</p>
          <MoneyValue value={montoTotal} className="text-3xl font-bold tracking-tight" />
        </div>

        <Button type="submit" size="lg" disabled={loading || lineas.length === 0} className="px-8">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Registrando…
            </>
          ) : lineas.length === 0 ? (
            "Agrega un producto primero"
          ) : (
            inicial ? "Cargar inventario inicial" : "Registrar compra"
          )}
        </Button>
      </div>
    </form>
  )
}
