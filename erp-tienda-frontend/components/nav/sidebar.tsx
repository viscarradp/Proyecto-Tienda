"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import Cookies from "js-cookie"
import { Store, LogOut } from "lucide-react"

import { cn } from "@/lib/utils"
import { getNavItems } from "@/lib/navigation"
import type { CurrentUser } from "@/hooks/useCurrentUser"
import { ThemeToggle } from "@/components/theme-toggle"
import { useCartStore } from "@/src/store/cartStore"
import { useInventoryStore } from "@/src/store/inventoryStore"

/**
 * Sidebar de escritorio (oculta en móvil; en móvil manda <BottomNav />).
 * Estética "estación de trabajo": tokenizada, esquinas rectas, sin glows.
 */
export function Sidebar({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const navItems = getNavItems(user?.rol)

  const handleLogout = () => {
    Cookies.remove("token", { path: "/" })
    Cookies.remove("user", { path: "/" })
    // En una terminal compartida, el siguiente cajero no debe heredar carrito ni
    // inventario cacheado. getState() porque es una acción imperativa.
    useCartStore.getState().clearCart()
    useInventoryStore.getState().reset()
    router.push("/auth/login")
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Marca */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary text-primary-foreground">
          <Store className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight">Tienda Karlita</h1>
          <p className="text-xs text-muted-foreground">
            {user?.rol === "CAJERO" ? "Cajero · POS" : user?.rol === "ADMIN" ? "Administrador" : "ERP"}
          </p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
                  <span className="flex-1">{item.name}</span>
                  {isActive && <span className="h-5 w-0.5 rounded-full bg-primary" />}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Pie: usuario + tema + salir */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user ? user.nombre : "Cargando…"}</p>
            <p className="text-xs text-muted-foreground">
              {user?.rol === "CAJERO" ? "Cajero" : user?.rol === "ADMIN" ? "Administrador" : ""}
            </p>
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className="flex h-9 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
