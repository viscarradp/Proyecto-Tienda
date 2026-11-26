"use client"

import { useMemo, useState } from "react"
import { Package } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { MoneyValue } from "@/components/money-value"
import { StatePill } from "@/components/state-pill"
import { SeccionTitulo } from "@/components/seccion-titulo"
import { formatMoney } from "@/lib/format"
import { MARGEN_BAJO, MARGEN_BUENO, formatUnidades, marginTone, type MarginTone } from "@/components/negocio/margen"

export interface ProductoMargen {
  producto_id: number
  nombre: string
  unidades_vendidas: number
  ingreso: string
  costo_fifo: string
  margen: string
  margen_porcentaje: string
}

type Orden = "mas-vendes" | "menos-deja"

const PASO = 10

const colorPunto: Record<MarginTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
}

function Leyenda({ tone, texto }: { tone: MarginTone; texto: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", colorPunto[tone])} aria-hidden />
      {texto}
    </li>
  )
}

/**
 * Una sola lista de productos (DUE-33): "Lo que más vendes" (por unidades) o "Lo que menos deja"
 * (por margen, de menor a mayor). Celular: tarjetas; pantalla ancha: tabla.
 */
export function ProductosNegocio({ productos, sinCosto }: { productos: ProductoMargen[]; sinCosto: Set<number> }) {
  const [orden, setOrden] = useState<Orden>("mas-vendes")
  const [verTodos, setVerTodos] = useState(false)

  const ordenados = useMemo(() => {
    const copia = [...productos]
    if (orden === "mas-vendes") return copia.sort((a, b) => b.unidades_vendidas - a.unidades_vendidas)
    // Sin costo registrado el margen no es real: van al final.
    return copia.sort((a, b) => {
      const sa = sinCosto.has(a.producto_id) ? 1 : 0
      const sb = sinCosto.has(b.producto_id) ? 1 : 0
      if (sa !== sb) return sa - sb
      return parseFloat(a.margen_porcentaje) - parseFloat(b.margen_porcentaje)
    })
  }, [productos, orden, sinCosto])

  const lista = verTodos ? ordenados : ordenados.slice(0, PASO)

  return (
    <section aria-label="Productos" className="rounded-sm border border-border bg-card p-5">
      <SeccionTitulo icono={Package} ayuda="Cada producto: cuánto vendiste, cuánto te costó y cuánta ganancia dejó.">
        Productos — cuánto dejan
      </SeccionTitulo>

      {productos.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Package className="mx-auto mb-3 h-12 w-12 opacity-30" />
          <p className="text-sm">No hay ventas en este período</p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex w-fit gap-1 rounded-sm border border-border bg-muted/50 p-1">
            {(
              [
                ["mas-vendes", "Lo que más vendes"],
                ["menos-deja", "Lo que menos deja"],
              ] as [Orden, string][]
            ).map(([clave, texto]) => (
              <button
                key={clave}
                onClick={() => setOrden(clave)}
                aria-pressed={orden === clave}
                className={cn(
                  "min-h-11 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:min-h-0",
                  orden === clave
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {texto}
              </button>
            ))}
          </div>

          <ul className="mb-2 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Leyenda tone="success" texto={`Deja buena ganancia ($${MARGEN_BUENO} o más por cada $100)`} />
            <Leyenda tone="warning" texto={`Deja poca ($${MARGEN_BAJO} a $${MARGEN_BUENO} por cada $100)`} />
            <Leyenda tone="destructive" texto={`Casi no deja (menos de $${MARGEN_BAJO} por cada $100)`} />
          </ul>

          {/* Celular: una tarjeta por producto, sin desplazarse de lado */}
          <ul className="flex flex-col sm:hidden">
            {lista.map((p, i) => {
              const tone = marginTone(parseFloat(p.margen_porcentaje))
              const sinCostoProd = sinCosto.has(p.producto_id)
              return (
                <li
                  key={p.producto_id}
                  className="flex items-start justify-between gap-3 border-b border-border/60 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                      {p.nombre}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Vendiste {formatMoney(p.ingreso)} · dejó {formatMoney(p.margen)}
                    </p>
                  </div>
                  {sinCostoProd ? (
                    <StatePill tone="muted">sin costo</StatePill>
                  ) : (
                    <StatePill tone={tone}>{formatMoney(p.margen_porcentaje)}</StatePill>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-3 text-left font-medium">Producto</th>
                  <th className="pb-3 text-right font-medium">Unidades</th>
                  <th className="pb-3 text-right font-medium">Vendido</th>
                  <th className="pb-3 text-right font-medium">Costó</th>
                  <th className="pb-3 text-right font-medium">Ganancia</th>
                  <th className="pb-3 text-right font-medium">Por cada $100</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p, i) => {
                  const tone = marginTone(parseFloat(p.margen_porcentaje))
                  const sinCostoProd = sinCosto.has(p.producto_id)
                  return (
                    <tr key={p.producto_id} className="border-b border-border/60 transition-colors hover:bg-muted/40">
                      <td className="py-3 font-medium">
                        <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                        {p.nombre}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-muted-foreground">
                        {formatUnidades(p.unidades_vendidas)}
                      </td>
                      <td className="py-3 text-right">
                        <MoneyValue value={p.ingreso} className="text-sm" />
                      </td>
                      <td className="py-3 text-right">
                        <MoneyValue value={p.costo_fifo} tone="muted" className="text-sm" />
                      </td>
                      <td className="py-3 text-right">
                        <MoneyValue
                          value={p.margen}
                          tone={sinCostoProd ? "muted" : tone}
                          className="text-sm font-semibold"
                        />
                      </td>
                      <td className="py-3 text-right">
                        {sinCostoProd ? (
                          <StatePill tone="muted">sin costo</StatePill>
                        ) : (
                          <StatePill tone={tone}>{formatMoney(p.margen_porcentaje)}</StatePill>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {ordenados.length > PASO && (
            <Button variant="outline" size="sm" onClick={() => setVerTodos((v) => !v)} className="mt-3">
              {verTodos ? `Ver solo los primeros ${PASO}` : `Ver los ${ordenados.length} productos`}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
