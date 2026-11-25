"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Cookies from "js-cookie"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { useCartStore } from "@/src/store/cartStore"
import { useInventoryStore } from "@/src/store/inventoryStore"

/**
 * Cierra la sesión. Un solo lugar para el sidebar (escritorio) y el menú de
 * usuario del encabezado móvil: ambos hacen exactamente lo mismo.
 *
 * Si hay un ticket sin cobrar, `pedirSalida` primero pregunta (salir lo borra).
 * Quien use el hook debe pintar `dialogoSalida` en su árbol.
 */
export function useLogout() {
  const router = useRouter()
  const [confirmar, setConfirmar] = React.useState(false)
  const cantidad = useCartStore((s) => s.items.length)

  const salir = React.useCallback(() => {
    Cookies.remove("token", { path: "/" })
    Cookies.remove("user", { path: "/" })
    // En una terminal compartida, el siguiente cajero no debe heredar carrito ni
    // inventario cacheado. getState() porque es una acción imperativa.
    useCartStore.getState().clearCart()
    useInventoryStore.getState().reset()
    router.push("/auth/login")
  }, [router])

  const pedirSalida = React.useCallback(() => {
    if (useCartStore.getState().items.length > 0) setConfirmar(true)
    else salir()
  }, [salir])

  const dialogoSalida = React.createElement(ConfirmDialog, {
    open: confirmar,
    onOpenChange: setConfirmar,
    title: "¿Cerrar sesión?",
    description: `Tienes un ticket sin cobrar con ${cantidad} ${cantidad === 1 ? "producto" : "productos"}. Si cierras sesión, se pierde.`,
    cancelLabel: "Seguir aquí",
    confirmLabel: "Cerrar sesión y borrar",
    onConfirm: salir,
  })

  return { pedirSalida, dialogoSalida }
}
