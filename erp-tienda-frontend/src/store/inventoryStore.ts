import { create } from 'zustand'
import { apiFetch } from '@/lib/api'
import { aNumero } from '@/lib/format'

export interface Categoria {
  id: number
  nombre: string
}

export interface Presentacion {
  id: number
  descripcion: string
  codigo_barras: string | null
  factor_conversion: number | string
  precio_venta: string
}

export interface LoteStock {
  id: number
  producto_id: number
  // En runtime la API los entrega como string (Decimal de Prisma). Operar
  // siempre con aNumero() / formatCantidad() de lib/format.
  cantidad_inicial: number | string
  cantidad_disponible: number | string
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
  // Decimal como string, en unidades base. Pueden faltar en respuestas viejas:
  // usar stockTotalDe() / pendienteTotalDe().
  stock_total?: number | string
  pendiente_total?: number | string
  /** Creado con alta rápida en el POS; la dueña debe completar precio/categoría. */
  por_revisar?: boolean
}

/** Stock total en unidades base; si el servidor no lo manda, suma los lotes. */
export function stockTotalDe(prod: Producto): number {
  if (prod.stock_total !== undefined && prod.stock_total !== null) return aNumero(prod.stock_total)
  return prod.lotes_inventario.reduce((s, l) => s + aNumero(l.cantidad_disponible), 0)
}

/** Unidades vendidas sin stock registrado, aún por cuadrar. */
export function pendienteTotalDe(prod: Producto): number {
  return aNumero(prod.pendiente_total)
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
  reset: () => void
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar inventario"
      set({ error: message, loading: false })
      console.error("Zustand Inventory Error:", err)
    }
  },

  invalidateCache: () => {
    set({ lastFetched: null })
  },

  // Limpia el catálogo cacheado por completo. Se invoca en logout: en una
  // terminal compartida, el siguiente cajero no debe heredar el inventario
  // (ni un error previo) del usuario anterior.
  reset: () => {
    set({ productos: [], categorias: [], lastFetched: null, loading: false, error: null })
  }
}))
