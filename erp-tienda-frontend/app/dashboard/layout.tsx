'use client'

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Store,
  History,
  BarChart3,
  Package,
  Settings,
  Menu,
  ChevronRight,
  User,
  LogOut,
  Receipt
} from "lucide-react"
import Cookies from "js-cookie"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { useCartStore } from "@/src/store/cartStore"
import { useInventoryStore } from "@/src/store/inventoryStore"

const NAV_ITEMS = [
  { name: 'Vender', icon: Store, href: '/dashboard/pos' },
  { name: 'Movimientos', icon: History, href: '/dashboard/movimientos' },
  { name: 'Gastos', icon: Receipt, href: '/dashboard/gastos' },
  { name: 'Inventario', icon: Package, href: '/dashboard/inventario' },
  { name: 'Estadísticas', icon: BarChart3, href: '/dashboard/stats' },
  // { name: 'Configuración', icon: Settings, href: '/dashboard/config' },
]

function SidebarContent() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = React.useState<{ nombre: string; rol: string } | null>(null)

  React.useEffect(() => {
    const userCookie = Cookies.get("user")
    if (userCookie) {
      try {
        setUser(JSON.parse(userCookie))
      } catch (e) {
        console.error("Error al leer el perfil guardado", e)
      }
    } else {
      router.push("/auth/login")
    }
  }, [router])

  const handleLogout = () => {
    Cookies.remove("token", { path: '/' })
    Cookies.remove("user", { path: '/' })
    // Limpia el estado en memoria: en una terminal compartida, el siguiente
    // cajero no debe heredar el carrito ni el inventario cacheado de la
    // sesión anterior. Se usa getState() (no el hook) porque es una acción
    // imperativa en un event handler, no una lectura reactiva — evita
    // suscribir el sidebar a cambios de esos stores sin necesidad.
    useCartStore.getState().clearCart()
    useInventoryStore.getState().reset()
    router.push("/auth/login")
  }

  const filteredNavItems = NAV_ITEMS.filter(item => {
    if (user?.rol === 'CAJERO') {
      return ['/dashboard/pos', '/dashboard/inventario', '/dashboard/movimientos', '/dashboard/gastos'].includes(item.href)
    }
    return true
  })

  return (
    <div className="flex flex-col h-full bg-black border-r border-zinc-900">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <Store className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-black text-xl tracking-tight text-white uppercase">Tienda Karlita</h1>
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-0.5">Admin Panel</p>
          </div>
        </div>

        <nav className="space-y-2">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.name} href={item.href}>
                <span className={`
                  flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 group
                  ${isActive
                    ? 'bg-zinc-900/80 text-white shadow-inner border border-zinc-800'
                    : 'text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-200 border border-transparent'}
                `}>
                  <item.icon className={`h-5 w-5 transition-colors ${isActive ? 'text-blue-500' : 'group-hover:text-blue-400'}`} />
                  <span className="font-bold text-sm flex-1 tracking-wide">{item.name}</span>
                  {isActive && <ChevronRight className="h-4 w-4 text-zinc-600" />}
                </span>
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto p-6">
        <Separator className="mb-6 bg-zinc-900" />
        <div 
          onClick={handleLogout}
          className="flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-zinc-900/50 transition-colors cursor-pointer group border border-transparent hover:border-zinc-800"
        >
          <div className="h-10 w-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 shadow-sm overflow-hidden group-hover:border-zinc-700 transition-colors">
            <User className="h-5 w-5 text-zinc-400 group-hover:text-zinc-300" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-white tracking-wide">{user ? user.nombre : "Cargando..."}</p>
            <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mt-0.5">
              {user?.rol === 'CAJERO' ? 'Cajero / POS' : 'Administrador'}
            </p>
          </div>
          <LogOut className="h-4 w-4 text-zinc-600 group-hover:text-red-500 transition-colors" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-black overflow-hidden font-sans text-zinc-200">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-72 flex-col fixed inset-y-0 z-50">
        <SidebarContent />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-72 h-full relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between px-6 h-20 bg-black/80 backdrop-blur-xl border-b border-zinc-900 z-40 sticky top-0">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/20 p-2 rounded-lg border border-blue-600/30">
              <Store className="h-5 w-5 text-blue-500" />
            </div>
            <span className="font-black text-lg tracking-tight text-white uppercase">ERP TIENDA</span>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 border-r border-zinc-900 bg-black">
              <SheetHeader className="sr-only">
                <SheetTitle>Navegación del Dashboard</SheetTitle>
              </SheetHeader>
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-black relative">
          {children}
        </main>
      </div>
    </div>
  )
}

