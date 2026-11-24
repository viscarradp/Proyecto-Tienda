"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Cookies from "js-cookie"

import { useCartStore } from "@/src/store/cartStore"
import { useInventoryStore } from "@/src/store/inventoryStore"

/**
 * Cierra la sesión. Un solo lugar para el sidebar (escritorio) y el menú de
 * usuario del encabezado móvil: ambos hacen exactamente lo mismo.
 */
export function useLogout() {
  const router = useRouter()

  return React.useCallback(() => {
    Cookies.remove("token", { path: "/" })
    Cookies.remove("user", { path: "/" })
    // En una terminal compartida, el siguiente cajero no debe heredar carrito ni
    // inventario cacheado. getState() porque es una acción imperativa.
    useCartStore.getState().clearCart()
    useInventoryStore.getState().reset()
    router.push("/auth/login")
  }, [router])
}
