"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import * as React from "react"
import { Ellipsis } from "lucide-react"

import { cn } from "@/lib/utils"
import { getNavMovil } from "@/lib/navigation"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet"
import type { CurrentUser } from "@/hooks/useCurrentUser"

/**
 * Navegación inferior para móvil (mobile-first, al alcance del pulgar).
 * Oculta en escritorio (allí manda <Sidebar />). Respeta el safe-area inferior.
 */
export function BottomNav({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname()
  const { pestanas, mas } = getNavMovil(user?.rol)
  const [masAbierto, setMasAbierto] = React.useState(false)

  if (pestanas.length === 0) return null

  const estaActivo = (href: string) => pathname === href || pathname.startsWith(href + "/")
  const masActivo = mas.some((item) => estaActivo(item.href))
  const claseTab =
    "relative flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

  return (
    <nav
      aria-label="Menú principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-sm md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {pestanas.map((item) => {
          const isActive = estaActivo(item.href)
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  claseTab,
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
        {mas.length > 0 && (
          <li className="flex-1">
            <BottomSheet open={masAbierto} onOpenChange={setMasAbierto}>
              <BottomSheetTrigger asChild>
                <button
                  type="button"
                  aria-current={masActivo ? "page" : undefined}
                  className={cn(
                    claseTab,
                    masActivo ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary transition-opacity",
                      masActivo ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <Ellipsis className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="truncate">Más</span>
                </button>
              </BottomSheetTrigger>
              <BottomSheetContent>
                <BottomSheetHeader>
                  <BottomSheetTitle>Más</BottomSheetTitle>
                  <BottomSheetDescription className="sr-only">Otras pantallas del menú</BottomSheetDescription>
                </BottomSheetHeader>
                <ul className="flex flex-col gap-1 px-4 pb-2">
                  {mas.map((item) => {
                    const isActive = estaActivo(item.href)
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => setMasAbierto(false)}
                          className={cn(
                            "flex min-h-11 items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground hover:bg-accent/60",
                          )}
                        >
                          <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} aria-hidden="true" />
                          {item.name}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </BottomSheetContent>
            </BottomSheet>
          </li>
        )}
      </ul>
    </nav>
  )
}
