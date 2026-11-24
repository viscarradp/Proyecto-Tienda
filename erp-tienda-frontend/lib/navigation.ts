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
 * D-06 "la cajera opera, la dueña controla": Gastos, Estadísticas y Usuarios
 * son de la dueña (ADMIN). Lo que la cajera sí hace (pagar gastos chicos desde
 * la gaveta, guardar en la bóveda) vive en el botón "Sacar dinero" del POS.
 */
export type Rol = "ADMIN" | "CAJERO"

export interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  roles: Rol[]
}

export const NAV_ITEMS: NavItem[] = [
  { name: "Vender", href: "/dashboard/pos", icon: Store, roles: ["ADMIN", "CAJERO"] },
  { name: "Inventario", href: "/dashboard/inventario", icon: Package, roles: ["ADMIN", "CAJERO"] },
  { name: "Movimientos", href: "/dashboard/movimientos", icon: History, roles: ["ADMIN", "CAJERO"] },
  { name: "Gastos", href: "/dashboard/gastos", icon: Receipt, roles: ["ADMIN"] },
  { name: "Estadísticas", href: "/dashboard/stats", icon: BarChart3, roles: ["ADMIN"] },
  { name: "Usuarios", href: "/dashboard/usuarios", icon: Users, roles: ["ADMIN"] },
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

/** Ruta "hogar" para un rol: su primer destino permitido (o login si ninguno). */
export function getHomeRoute(rol: Rol | undefined | null): string {
  return getNavItems(rol)[0]?.href ?? "/auth/login"
}
