import { create } from 'zustand'

export interface CartItem {
  id: string
  nombre: string
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

export const useCartStore = create<CartStore>((set, get) => ({
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
    return get().items.reduce((acc, item) => acc + item.precio * item.cantidad, 0)
  },
}))
