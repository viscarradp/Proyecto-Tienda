"use client"

import * as React from "react"
import { AlertCircle, Loader2, PackagePlus } from "lucide-react"

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
import { apiFetch } from "@/lib/api"
import { parseDecimal } from "@/lib/format"

export interface ProductoRapido {
  id: number
  nombre: string
  presentaciones: {
    id: number
    descripcion: string
    factor_conversion: number | string
    precio_venta: string | number
    codigo_barras: string | null
  }[]
}

const UNIDADES_RAPIDAS = ["Unidad", "Libra", "Onza", "Bolsa"]

/**
 * Alta rápida (D-02): la cajera da de alta un producto que no está en el
 * catálogo sin salir del POS. La dueña lo revisa después en Inventario.
 */
export function AltaRapidaDialog({
  open,
  onOpenChange,
  nombreInicial,
  codigoInicial,
  onCreado,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  nombreInicial: string
  codigoInicial: string
  onCreado: (producto: ProductoRapido) => void | Promise<void>
}) {
  const [nombre, setNombre] = React.useState("")
  const [precio, setPrecio] = React.useState("")
  const [unidad, setUnidad] = React.useState("Unidad")
  const [codigo, setCodigo] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  // Cada vez que se abre, parte de lo que se buscó/escaneó.
  React.useEffect(() => {
    if (!open) return
    setNombre(nombreInicial)
    setCodigo(codigoInicial)
    setPrecio("")
    setUnidad("Unidad")
    setError("")
    setLoading(false)
  }, [open, nombreInicial, codigoInicial])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    const nombreLimpio = nombre.trim()
    const precioNum = parseDecimal(precio)
    if (!nombreLimpio) {
      setError("Escribe el nombre del producto.")
      return
    }
    if (precioNum === null || precioNum <= 0) {
      setError("Escribe el precio de venta, mayor que $0.")
      return
    }
    if (Math.round(precioNum * 100) / 100 !== precioNum) {
      setError("El precio solo puede tener hasta 2 decimales (centavos).")
      return
    }
    setLoading(true)
    setError("")
    try {
      const body: Record<string, unknown> = {
        nombre: nombreLimpio,
        precio_venta: precioNum,
        descripcion: unidad.trim() || "Unidad",
      }
      if (codigo.trim()) body.codigo_barras = codigo.trim()
      const producto = await apiFetch<ProductoRapido>("/productos/rapido", {
        method: "POST",
        body: JSON.stringify(body),
      })
      await onCreado(producto)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar el producto. Intenta de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!loading) onOpenChange(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" /> Producto nuevo
          </DialogTitle>
          <DialogDescription>
            Ponle nombre y precio para venderlo ahora. Después se completa en Inventario.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="flex items-center gap-3 rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="rapido-nombre" className="text-xs font-medium text-muted-foreground">Nombre</Label>
            <Input
              id="rapido-nombre"
              value={nombre}
              maxLength={150}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Queso fresco"
              className="h-12 md:h-12 text-base"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rapido-precio" className="text-xs font-medium text-muted-foreground">Precio de venta</Label>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base text-muted-foreground">$</span>
              <Input
                id="rapido-precio"
                inputMode="decimal"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0.00"
                className="h-12 md:h-12 font-mono text-lg"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rapido-unidad" className="text-xs font-medium text-muted-foreground">Se vende por</Label>
            <div className="flex flex-wrap gap-1.5">
              {UNIDADES_RAPIDAS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnidad(u)}
                  aria-pressed={unidad === u}
                  className={cn(
                    "h-11 md:h-9 rounded-sm border px-3 text-sm font-medium transition-colors",
                    unidad === u
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
            <Input
              id="rapido-unidad"
              value={unidad}
              maxLength={100}
              onChange={(e) => setUnidad(e.target.value)}
              placeholder="Otra unidad: caja, docena…"
              className="h-11 md:h-11"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rapido-codigo" className="text-xs font-medium text-muted-foreground">
              Código de barras (opcional)
            </Label>
            <Input
              id="rapido-codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Escanéalo o déjalo vacío"
              className="h-11 md:h-11 font-mono"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="min-w-40 gap-2">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Agregar al ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
