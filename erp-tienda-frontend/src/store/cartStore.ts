import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  aNumero,
  cantidadDesdeMonto,
  centavosAMonto,
  montoACentavos,
  redondear3,
  totalLineaCentavos,
} from '@/lib/format'

export interface CartItem {
  id: string
  nombre: string
  producto_nombre?: string
  presentacion_nombre?: string
  precio: number
  /** En línea "por monto" es la cantidad estimada (monto ÷ precio); el servidor la recalcula. */
  cantidad: number
  /** "cantidad" (por defecto) o "monto" ("dame $1 de queso"). */
  modo: 'cantidad' | 'monto'
  /** Dólares exactos de la línea; solo en modo "monto". */
  monto?: number
}

interface CartStore {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'cantidad' | 'modo' | 'monto'>) => void
  removeItem: (id: string) => void
  /** Fija la cantidad (hasta 3 decimales). Si es ≤ 0 quita la línea. Vuelve la línea a modo cantidad. */
  updateQuantity: (id: string, cantidad: number) => void
  /** Pasa la línea a "por monto" con ese monto en dólares (> 0). */
  setMonto: (id: string, monto: number) => void
  /** Vuelve la línea a "por cantidad", conservando la cantidad estimada. */
  quitarMonto: (id: string) => void
  clearCart: () => void
  getTotal: () => number
  /**
   * Alinea el precio de cada línea con el actual del catálogo (id de línea → precio).
   * Devuelve las líneas que cambiaron. Las que no están en el mapa se dejan igual.
   */
  reconciliarPrecios: (precios: ReadonlyMap<string, number>) => CambioPrecio[]
}

export interface CambioPrecio {
  id: string
  nombre: string
  precio: number
}

/**
 * Pura: líneas con el precio actualizado y la lista de cambios. En líneas por monto
 * se conserva el monto exacto y se recalcula la cantidad estimada.
 */
export function reconciliarLineas(
  items: CartItem[],
  precios: ReadonlyMap<string, number>,
): { items: CartItem[]; cambios: CambioPrecio[] } {
  const cambios: CambioPrecio[] = []
  const nuevos = items.map((i) => {
    const actual = precios.get(i.id)
    if (actual === undefined || !Number.isFinite(actual)) return i
    if (montoACentavos(actual) === montoACentavos(i.precio)) return i
    cambios.push({ id: i.id, nombre: i.nombre, precio: actual })
    if (i.modo === 'monto' && i.monto !== undefined) {
      return { ...i, precio: actual, cantidad: cantidadDesdeMonto(i.monto, actual) }
    }
    return { ...i, precio: actual }
  })
  return { items: cambios.length > 0 ? nuevos : items, cambios }
}

/** Total de una línea en centavos: el monto exacto en líneas por monto; precio × cantidad en las demás. */
export function totalItemCentavos(item: Pick<CartItem, 'precio' | 'cantidad' | 'modo' | 'monto'>): number {
  if (item.modo === 'monto' && item.monto !== undefined) return montoACentavos(item.monto)
  return totalLineaCentavos(item.precio, item.cantidad)
}

// localStorage puede no existir o lanzar (modo privado, datos bloqueados):
// en ese caso el carrito simplemente vive en memoria.
const safeStorage = {
  getItem: (name: string) => {
    try { return localStorage.getItem(name) } catch { return null }
  },
  setItem: (name: string, value: string) => {
    try { localStorage.setItem(name, value) } catch { /* sin persistencia */ }
  },
  removeItem: (name: string) => {
    try { localStorage.removeItem(name) } catch { /* sin persistencia */ }
  },
}

export const useCartStore = create<CartStore>()(persist((set, get) => ({
  items: [],
  addItem: (product) => {
    const { items } = get()
    const existingItem = items.find((i) => i.id === product.id)
    if (existingItem) {
      set({
        items: items.map((i) => {
          if (i.id !== product.id) return i
          // Línea por monto: otra unidad suma el precio de una unidad al monto.
          if (i.modo === 'monto' && i.monto !== undefined) {
            const monto = centavosAMonto(montoACentavos(i.monto) + montoACentavos(i.precio))
            return { ...i, monto, cantidad: cantidadDesdeMonto(monto, i.precio) }
          }
          return { ...i, cantidad: redondear3(i.cantidad + 1) }
        }),
      })
    } else {
      set({ items: [...items, { ...product, cantidad: 1, modo: 'cantidad' }] })
    }
  },
  removeItem: (id) => {
    set({ items: get().items.filter((i) => i.id !== id) })
  },
  updateQuantity: (id, cantidad) => {
    const q = redondear3(cantidad)
    if (!(q > 0)) {
      get().removeItem(id)
      return
    }
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, cantidad: q, modo: 'cantidad', monto: undefined } : i
      ),
    })
  },
  setMonto: (id, monto) => {
    const m = centavosAMonto(montoACentavos(monto))
    if (!(m > 0)) return
    set({
      items: get().items.map((i) =>
        i.id === id && i.precio > 0
          ? { ...i, modo: 'monto', monto: m, cantidad: cantidadDesdeMonto(m, i.precio) }
          : i
      ),
    })
  },
  quitarMonto: (id) => {
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, modo: 'cantidad', monto: undefined } : i
      ),
    })
  },
  clearCart: () => set({ items: [] }),
  reconciliarPrecios: (precios) => {
    const { items, cambios } = reconciliarLineas(get().items, precios)
    if (cambios.length > 0) set({ items })
    return cambios
  },
  getTotal: () => {
    // Cada línea se redondea a centavos antes de sumar, igual que el servidor.
    const centavos = get().items.reduce((acc, item) => acc + totalItemCentavos(item), 0)
    return centavosAMonto(centavos)
  },
}), {
  name: 'tienda-carrito',
  version: 2,
  storage: createJSONStorage(() => safeStorage),
  partialize: (state) => ({ items: state.items }),
  // v1 → v2: las líneas guardadas no tenían modo; todas eran por cantidad.
  migrate: (persisted) => {
    const items = (persisted as { items?: Partial<CartItem>[] } | null)?.items
    if (!Array.isArray(items)) return { items: [] }
    return {
      items: items
        .filter((i) => i && typeof i.id === 'string')
        .map((i) => ({
          ...(i as CartItem),
          precio: aNumero(i.precio),
          cantidad: aNumero(i.cantidad) || 1,
          modo: i.modo === 'monto' && i.monto !== undefined ? 'monto' : 'cantidad',
        })),
    }
  },
}))
