import Link from "next/link"

const enlace =
  "inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:min-h-0"

export interface PendientesNegocio {
  /** Productos creados con alta rápida que la dueña aún no revisa. */
  porRevisar: number
  /** Productos con unidades vendidas sin stock registrado. */
  sinStock: number
  /** Deudas con proveedores con saldo pendiente. */
  deudas: number
  /** Productos vendidos sin costo registrado en el período. */
  sinCosto: number
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** "Qué hacer": lo que está pendiente, cada cosa con su enlace. No se muestra si no hay nada. */
export function QueHacer({ pendientes }: { pendientes: PendientesNegocio }) {
  const items: {
    clave: string
    texto: string
    href: string
    enlace: string
  }[] = []
  if (pendientes.porRevisar > 0)
    items.push({
      clave: "revisar",
      texto: `${plural(pendientes.porRevisar, "producto", "productos")} por revisar (precio o categoría).`,
      href: "/dashboard/inventario",
      enlace: "Ir a Inventario",
    })
  if (pendientes.sinStock > 0)
    items.push({
      clave: "sin-stock",
      texto: `${plural(pendientes.sinStock, "producto", "productos")} con ventas sin stock registrado.`,
      href: "/dashboard/inventario",
      enlace: "Ir a Inventario",
    })
  if (pendientes.deudas > 0)
    items.push({
      clave: "deudas",
      texto: `${plural(pendientes.deudas, "deuda", "deudas")} con proveedores por pagar.`,
      href: "/dashboard/gastos",
      enlace: "Ir a Gastos y deudas",
    })
  if (pendientes.sinCosto > 0)
    items.push({
      clave: "sin-costo",
      texto: `${plural(pendientes.sinCosto, "producto vendido", "productos vendidos")} sin costo registrado.`,
      href: "/dashboard/inventario",
      enlace: "Registrar la compra",
    })

  if (items.length === 0) return null

  return (
    <div className="mt-4 border-t border-border/60 pt-3">
      <h2 className="text-sm font-semibold text-foreground">Qué hacer</h2>
      <ul className="mt-1 flex flex-col">
        {items.map((it) => (
          <li key={it.clave} className="flex flex-wrap items-center gap-x-3 text-sm text-warning-text">
            <span>{it.texto}</span>
            <Link href={it.href} className={enlace}>
              {it.enlace}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
