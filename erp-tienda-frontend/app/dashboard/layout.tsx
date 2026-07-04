'use client'

import * as React from "react"
import { usePathname } from "next/navigation"
import { Store } from "lucide-react"

import { Sidebar } from "@/components/nav/sidebar"
import { BottomNav } from "@/components/nav/bottom-nav"
import { ForbiddenState } from "@/components/forbidden-state"
import { ThemeToggle } from "@/components/theme-toggle"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { canAccessRoute } from "@/lib/navigation"

function MobileHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur-sm md:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-primary-foreground">
          <Store className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Tienda Karlita</span>
      </div>
      <ThemeToggle />
    </header>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user } = useCurrentUser({ redirectTo: "/auth/login" })
  const denied = user != null && !canAccessRoute(user.rol, pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar de escritorio */}
      <aside className="fixed inset-y-0 z-50 hidden w-64 flex-col md:flex">
        <Sidebar user={user} />
      </aside>

      {/* Área principal */}
      <div className="relative flex h-full min-w-0 flex-1 flex-col md:pl-64">
        <MobileHeader />
        <main className="relative flex-1 overflow-auto pb-16 md:pb-0">
          {denied ? <ForbiddenState user={user} /> : children}
        </main>
        <BottomNav user={user} />
      </div>
    </div>
  )
}
