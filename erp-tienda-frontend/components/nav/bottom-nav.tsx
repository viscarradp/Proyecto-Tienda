"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { getNavItems } from "@/lib/navigation"
import type { CurrentUser } from "@/hooks/useCurrentUser"

/**
 * Navegación inferior para móvil (mobile-first, al alcance del pulgar).
 * Oculta en escritorio (allí manda <Sidebar />). Respeta el safe-area inferior.
 */
export function BottomNav({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname()
  const navItems = getNavItems(user?.rol)

  if (navItems.length === 0) return null

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {/* Indicador de activo (barra superior) */}
                <span
                  className={cn(
                    "absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
