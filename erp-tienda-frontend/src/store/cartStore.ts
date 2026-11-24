import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { centavosAMonto, totalLineaCentavos } from '@/lib/format'

export interface CartItem {
  id: string
  nombre: string
  producto_nombre?: string
  presentacion_nombre?: string
  precio: number
  cantidad: number
}

interface CartStore {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'cantidad'>) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, cantidad: number) => void
  clearCart: () => void
  getTotal: () => number
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
        items: items.map((i) =>
          i.id === product.id ? { ...i, cantidad: i.cantidad + 1 } : i
        ),
      })
    } else {
      set({ items: [...items, { ...product, cantidad: 1 }] })
    }
  },
  removeItem: (id) => {
    set({ items: get().items.filter((i) => i.id !== id) })
  },
  updateQuantity: (id, cantidad) => {
    if (cantidad <= 0) {
      get().removeItem(id)
      return
    }
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, cantidad } : i
      ),
    })
  },
  clearCart: () => set({ items: [] }),
  getTotal: () => {
    // Cada línea se redondea a centavos antes de sumar, igual que el servidor.
    const centavos = get().items.reduce(
      (acc, item) => acc + totalLineaCentavos(item.precio, item.cantidad),
      0
    )
    return centavosAMonto(centavos)
  },
}), {
  name: 'tienda-carrito',
  version: 1,
  storage: createJSONStorage(() => safeStorage),
  partialize: (state) => ({ items: state.items }),
}))
