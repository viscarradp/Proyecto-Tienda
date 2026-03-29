import { create } from 'zustand'
import { apiFetch } from '@/lib/api'

export interface Categoria {
  id: number
  nombre: string
}

export interface Presentacion {
  id: number
  descripcion: string
  codigo_barras: string | null
  factor_conversion: number
  precio_venta: string
}

export interface LoteStock {
  id: number
  producto_id: number
  cantidad_inicial: number
  cantidad_disponible: number
  costo_unitario_adquisicion: string
  fecha_vencimiento: string | null
}

export interface Producto {
  id: number
  nombre: string
  categoria_id: number
  categorias: Categoria
  presentaciones: Presentacion[]
  lotes_inventario: LoteStock[]
}

interface InventoryState {
  productos: Producto[]
  categorias: Categoria[]
  lastFetched: number | null
  loading: boolean
  error: string | null
  
  // Actions
  fetchInventory: (forceRefresh?: boolean) => Promise<void>
  invalidateCache: () => void
}

// Tiempo de cache: 3 minutos. Si ha pasado este tiempo, refresca automáticamente.
const CACHE_TTL_MS = 3 * 60 * 1000

export const useInventoryStore = create<InventoryState>((set, get) => ({
  productos: [],
  categorias: [],
  lastFetched: null,
  loading: false,
  error: null,

  fetchInventory: async (forceRefresh = false) => {
    const state = get()
    
    // Si ya está cargando, no hacer más llamadas
    if (state.loading) return

    // Si tenemos datos, y no forzamos refresh, y no expiró el TTL, usar cache
    if (!forceRefresh && state.lastFetched && state.productos.length > 0) {
      const now = Date.now()
      if (now - state.lastFetched < CACHE_TTL_MS) {
        return // Servir desde el store local
      }
    }

    set({ loading: true, error: null })
    try {
      // Hacer ambas llamadas en paralelo para máxima eficiencia
      const [resProductos, resCategorias] = await Promise.all([
        apiFetch<Producto[]>("/productos"),
        apiFetch<Categoria[]>("/categorias")
      ])
      
      set({ 
        productos: Array.isArray(resProductos) ? resProductos : [], 
        categorias: Array.isArray(resCategorias) ? resCategorias : [],
        lastFetched: Date.now(),
        loading: false 
      })
    } catch (err: any) {
      set({ error: err.message || "Error al cargar inventario", loading: false })
      console.error("Zustand Inventory Error:", err)
    }
  },

  invalidateCache: () => {
    set({ lastFetched: null })
  }
}))
