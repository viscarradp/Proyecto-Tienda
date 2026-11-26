import * as React from "react"
import { Loader2, AlertTriangle, Minus, Plus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
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
import { aNumero, formatCantidad } from "@/lib/format"
import { CampoError } from "@/components/campo-error"
import { TERMINOS, mensajeError } from "@/lib/glosario"
import { LoteStock, useInventoryStore } from "@/src/store/inventoryStore"
import { unidadBase } from "@/lib/unidades"

/** Texto del motivo que se precarga según lo que pasó (la usuaria puede cambiarlo). */
const MOTIVO_POR_TIPO: Record<string, string> = {
  QUEBRADO: "Quebrado / roto",
  VENCIDO: "Vencido",
  ROBO: "Robo / pérdida",
  CONTEO: "Ajuste de conteo",
}
const esMotivoPrecargado = (texto: string) => Object.values(MOTIVO_POR_TIPO).includes(texto.trim())

interface AjusteInventarioDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  productoId: number
  productoNombre: string
  /** Lotes con existencias del producto (para elegir de cuál se quita). */
  lotes: LoteStock[]
  /** Lote preseleccionado (si se abrió desde un lote). */
  loteInicialId?: number | null
  /** La cajera solo registra mermas, con motivo; los conteos son de la dueña. */
  esCajero: boolean
  /** Con qué dirección abre (la dueña puede cambiarla). */
  inicio?: Direccion
}

type Direccion = "quitar" | "agregar"

export function AjusteInventarioDialog({
  open,
  onClose,
  onSuccess,
  productoId,
  productoNombre,
  lotes,
  loteInicialId = null,
  esCajero,
  inicio = "quitar",
}: AjusteInventarioDialogProps) {
  const [direccion, setDireccion] = React.useState<Direccion>("quitar")
  const [loteId, setLoteId] = React.useState("")
  const [cantidad, setCantidad] = React.useState("1")
  const [tipoAjuste, setTipoAjuste] = React.useState("QUEBRADO")
  const [justificacion, setJustificacion] = React.useState(MOTIVO_POR_TIPO.QUEBRADO)
  // Por defecto sale la tanda más vieja (FIFO); elegir otra es opcional.
  const [eligiendoTanda, setEligiendoTanda] = React.useState(false)
  const unidad = useInventoryStore((s) => unidadBase(s.productos.find((p) => p.id === productoId)?.presentaciones))

  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  // Errores de campo: salen junto al campo, no como aviso aparte.
  const [errores, setErrores] = React.useState<{ cantidad?: string; lote?: string; motivo?: string }>({})

  React.useEffect(() => {
    if (open) {
      setErrores({})
      const dir = esCajero ? "quitar" : inicio
      setDireccion(dir)
      setLoteId(String(loteInicialId ?? lotes[0]?.id ?? ""))
      // Si se abrió desde una tanda concreta, se muestra elegida; si no, sale la más vieja.
      setEligiendoTanda(loteInicialId != null && lotes.length > 1)
      setCantidad("1")
      setTipoAjuste("QUEBRADO")
      setJustificacion(dir === "quitar" ? MOTIVO_POR_TIPO.QUEBRADO : "")
      setError("")
    }
    // Solo al abrir: no pisar lo que la usuaria ya escribió si se recarga el catálogo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const esAgregar = direccion === "agregar" && !esCajero
  const lote = lotes.find((l) => String(l.id) === loteId) ?? null
  const disponible = aNumero(lote?.cantidad_disponible)
  const sinExistencias = !esAgregar && lotes.length === 0

  const cambiarTipo = (tipo: string) => {
    setTipoAjuste(tipo)
    // Solo se reemplaza el motivo si está vacío o es uno de los precargados (no pisa lo que escribió).
    if (!justificacion.trim() || esMotivoPrecargado(justificacion)) setJustificacion(MOTIVO_POR_TIPO[tipo] ?? "")
  }

  const cambiarDireccion = (dir: Direccion) => {
    setDireccion(dir)
    if (dir === "agregar" && esMotivoPrecargado(justificacion)) setJustificacion("")
    if (dir === "quitar" && !justificacion.trim()) setJustificacion(MOTIVO_POR_TIPO[tipoAjuste] ?? "")
  }

  const alternarTanda = () => {
    // Al plegar, vuelve a la más vieja.
    if (eligiendoTanda) setLoteId(String(lotes[0]?.id ?? ""))
    setEligiendoTanda(!eligiendoTanda)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cantNum = parseFloat(cantidad)

    const nuevos: typeof errores = {}
    if (isNaN(cantNum) || cantNum <= 0) {
      nuevos.cantidad = "Escribe una cantidad mayor a 0."
    } else if (!esAgregar && cantNum > disponible) {
      nuevos.cantidad = `Solo quedan ${formatCantidad(disponible)} ${unidad} en esa ${TERMINOS.tanda.toLowerCase()}.`
    }
    if (!esAgregar && !lote) {
      nuevos.lote = `Elige la ${TERMINOS.tanda.toLowerCase()} de la que se quita.`
    }
    if (esCajero && !justificacion.trim()) {
      nuevos.motivo = "Escribe qué pasó con el producto (el motivo)."
    }
    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0) return

    setLoading(true)
    setError("")

    try {
      // Sumar: al lote más reciente del producto aunque esté en 0. Quitar: del lote elegido.
      const destino = esAgregar ? { producto_id: productoId } : { lote_id: lote?.id }
      await apiFetch("/ajustes-inventario", {
        method: "POST",
        body: JSON.stringify({
          ...destino,
          cantidad_ajustada: cantNum,
          tipo_ajuste: esAgregar ? "CONTEO_SOBRANTE" : tipoAjuste,
          justificacion: justificacion.trim() || undefined,
        }),
      })
      toast.success(
        esAgregar
          ? `Se sumaron ${formatCantidad(cantNum)} a «${productoNombre}»`
          : `Mercadería perdida: ${formatCantidad(cantNum)} registradas en «${productoNombre}»`,
      )
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError(mensajeError("registrar el ajuste", err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning-text" />
            {esCajero ? "Registrar mercadería perdida" : esAgregar ? "Encontré producto" : "Ajuste de inventario"}
          </DialogTitle>
          <DialogDescription>
            {esAgregar
              ? "Suma unidades que están en el estante pero el sistema no tiene. Se agregan a la compra más reciente del producto."
              : "Descuenta unidades que se perdieron, quebraron o vencieron. Queda anotado quién lo registró."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6 pt-2">
          {error && <CampoError className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium">{error}</CampoError>}

          {/* Dirección del ajuste (solo la dueña: los conteos son suyos) */}
          {!esCajero && (
            <div className="grid grid-cols-2 gap-1 rounded-sm border border-border p-1">
              <button type="button" onClick={() => cambiarDireccion("quitar")} aria-pressed={!esAgregar}
                className={cn("flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                  !esAgregar ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:text-foreground")}>
                <Minus className="h-4 w-4" /> Quitar (se perdió)
              </button>
              <button type="button" onClick={() => cambiarDireccion("agregar")} aria-pressed={esAgregar}
                className={cn("flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                  esAgregar ? "bg-success/10 text-success" : "text-muted-foreground hover:text-foreground")}>
                <Plus className="h-4 w-4" /> Encontré (conteo)
              </button>
            </div>
          )}

          <div className="rounded-sm border border-border bg-muted/40 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Producto afectado</p>
            <p className="font-semibold text-foreground">{productoNombre}</p>
          </div>

          {sinExistencias ? (
            <p className="rounded-sm border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Este producto no tiene existencias registradas, no hay nada que quitar.
            </p>
          ) : (
            <>
              {!esAgregar && lotes.length > 1 && (
                <div className="flex flex-col items-start gap-2">
                  <p className="font-mono text-xs text-muted-foreground">
                    {eligiendoTanda
                      ? "Eliges de qué tanda se descuenta."
                      : `Se descuenta de la tanda más vieja (quedan ${formatCantidad(lotes[0]?.cantidad_disponible)} ${unidad}).`}
                  </p>
                  <Button type="button" variant="link" size="sm" className="h-auto min-h-11 px-0 md:min-h-0"
                    aria-expanded={eligiendoTanda} onClick={alternarTanda}>
                    {eligiendoTanda ? "Usar la más vieja" : "Elegir la tanda"}
                  </Button>
                </div>
              )}
              {!esAgregar && lotes.length > 1 && eligiendoTanda && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ajusteinventariodialog-de-que-lote-el-mas-viejo-sal" className="text-xs font-medium text-muted-foreground">¿De qué tanda?</Label>
                  <Select value={loteId} onValueChange={setLoteId}>
                    <SelectTrigger
                      id="ajusteinventariodialog-de-que-lote-el-mas-viejo-sal"
                      className="w-full"
                      aria-invalid={!!errores.lote}
                      aria-describedby={errores.lote ? "ajuste-lote-error" : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {lotes.map((l) => (
                        <SelectItem key={l.id} value={String(l.id)}>
                          Tanda #{l.id} · quedan {formatCantidad(l.cantidad_disponible)} {unidad}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errores.lote && <CampoError id="ajuste-lote-error">{errores.lote}</CampoError>}
                </div>
              )}
              {!esAgregar && lotes.length === 1 && (
                <p className="font-mono text-xs text-muted-foreground">
                  Quedan {formatCantidad(disponible)} {unidad} en la tanda #{lote?.id}
                </p>
              )}

              <div className={esAgregar ? "" : "grid grid-cols-2 gap-4"}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ajuste-cantidad" className="text-xs font-medium text-muted-foreground">
                    {esAgregar ? "Cantidad que encontré" : "Cantidad a descontar"} ({unidad})
                  </Label>
                  <Input
                    id="ajuste-cantidad"
                    type="number"
                    min="0.001"
                    step="0.001"
                    max={esAgregar ? undefined : disponible}
                    inputMode="decimal"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    size="lg"
                    className="font-mono text-lg"
                    aria-invalid={!!errores.cantidad}
                    aria-describedby={errores.cantidad ? "ajuste-cantidad-error" : undefined}
                  />
                  {errores.cantidad && <CampoError id="ajuste-cantidad-error">{errores.cantidad}</CampoError>}
                </div>
                {!esAgregar && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ajusteinventariodialog-que-paso" className="text-xs font-medium text-muted-foreground">¿Qué pasó?</Label>
                    <Select value={tipoAjuste} onValueChange={cambiarTipo}>
                      <SelectTrigger id="ajusteinventariodialog-que-paso" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="QUEBRADO">Quebrado / roto</SelectItem>
                        <SelectItem value="VENCIDO">Vencido</SelectItem>
                        <SelectItem value="ROBO">Robo / pérdida</SelectItem>
                        {!esCajero && <SelectItem value="CONTEO">Ajuste de conteo</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="ajuste-motivo" className="text-xs font-medium text-muted-foreground">
                  {esCajero ? "Motivo (obligatorio)" : "Motivo (opcional)"}
                </Label>
                <Input
                  id="ajuste-motivo"
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  placeholder={esAgregar ? "Ej: Estaba en la bodega" : "Ej: Se cayó de la estantería…"}
                  aria-invalid={!!errores.motivo}
                  aria-describedby={errores.motivo ? "ajuste-motivo-error" : undefined}
                />
                {errores.motivo && <CampoError id="ajuste-motivo-error">{errores.motivo}</CampoError>}
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || sinExistencias}
              variant={esAgregar ? "success" : "warning"} className="gap-2">
              {loading
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : sinExistencias
                  ? "No hay existencias que quitar"
                  : esAgregar ? "Sumar al inventario" : "Registrar pérdida"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
