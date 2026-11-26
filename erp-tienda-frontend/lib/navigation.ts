import { MENU } from "@/lib/glosario"
import {
  Store,
  Package,
  History,
  Receipt,
  BarChart3,
  Users,
  type LucideIcon,
} from "lucide-react"

/**
 * Fuente ÚNICA de verdad de navegación y permisos por rol (decisión R3).
 * Alimenta la visibilidad del nav (sidebar + bottom-nav) y el guard de ruta
 * del dashboard. Los roles reflejan la autorización real del backend
 * (@Roles en los controllers de NestJS) para evitar llevar al usuario a
 * pantallas que responderán 403.
 *
 * D-06 "la cajera opera, la dueña controla": Mi negocio, Gastos y deudas y Usuarios
 * son de la dueña (ADMIN). Lo que la cajera sí hace (pagar gastos chicos desde
 * la gaveta, guardar en la bóveda) vive en el botón "Sacar dinero" del POS.
 */
export type Rol = "ADMIN" | "CAJERO"

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  roles: Rol[]
  /** En el menú inferior del celular, pasa a "Más" cuando hay demasiados ítems. */
  enMas?: boolean
}

/** Máximo de pestañas del menú inferior antes de agrupar el resto en "Más". */
export const MAX_PESTANAS_MOVIL = 5

export const NAV_ITEMS: NavItem[] = [
  { name: MENU.miNegocio, href: "/dashboard/stats", icon: BarChart3, roles: ["ADMIN"] },
  { name: MENU.vender, href: "/dashboard/pos", icon: Store, roles: ["ADMIN", "CAJERO"] },
  { name: MENU.inventario, href: "/dashboard/inventario", icon: Package, roles: ["ADMIN", "CAJERO"] },
  { name: MENU.gastosYDeudas, href: "/dashboard/gastos", icon: Receipt, roles: ["ADMIN"] },
  { name: MENU.ventasYTurnos, href: "/dashboard/movimientos", icon: History, roles: ["ADMIN", "CAJERO"], enMas: true },
  { name: MENU.usuarios, href: "/dashboard/usuarios", icon: Users, roles: ["ADMIN"], enMas: true },
]

/** Ítems de navegación visibles para un rol dado. */
export function getNavItems(rol: Rol | undefined | null): NavItem[] {
  if (!rol) return []
  return NAV_ITEMS.filter((item) => item.roles.includes(rol))
}

/**
 * ¿Puede el rol acceder a esta ruta? Las rutas conocidas se validan contra su
 * lista de roles; las no listadas (subrutas u otras) se permiten por defecto —
 * solo bloqueamos lo explícitamente restringido.
 */
export function canAccessRoute(rol: Rol | undefined | null, pathname: string): boolean {
  if (!rol) return false
  const item = NAV_ITEMS.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  )
  if (!item) return true
  return item.roles.includes(rol)
}

/**
 * Ruta "hogar" para un rol: la dueña llega a "Mi negocio"; la cajera, a Vender.
 * Sin rol conocido, al login.
 */
export function getHomeRoute(rol: Rol | undefined | null): string {
  if (rol === "ADMIN") return "/dashboard/stats"
  if (rol === "CAJERO") return "/dashboard/pos"
  return "/auth/login"
}

/**
 * Reparte los ítems del menú inferior del celular: pestañas visibles y los que
 * van dentro de "Más". Con pocos ítems (la cajera) no hay "Más".
 */
export function getNavMovil(rol: Rol | undefined | null): { pestanas: NavItem[]; mas: NavItem[] } {
  const items = getNavItems(rol)
  if (items.length <= MAX_PESTANAS_MOVIL) return { pestanas: items, mas: [] }
  return { pestanas: items.filter((i) => !i.enMas), mas: items.filter((i) => i.enMas) }
}
