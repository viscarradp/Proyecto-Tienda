"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Cookies from "js-cookie"
import type { Rol } from "@/lib/navigation"

export interface CurrentUser {
  nombre: string
  rol: Rol
}

/**
 * Lee el perfil guardado en la cookie `user` (cliente). Opcionalmente redirige
 * a login si no hay sesión. Centraliza lo que antes vivía inline en el layout.
 */
export function useCurrentUser(options?: { redirectTo?: string }): {
  user: CurrentUser | null
  loading: boolean
} {
  const router = useRouter()
  const redirectTo = options?.redirectTo
  const [user, setUser] = React.useState<CurrentUser | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const raw = Cookies.get("user")
    if (raw) {
      try {
        setUser(JSON.parse(raw) as CurrentUser)
      } catch (e) {
        console.error("Error al leer el perfil guardado", e)
        if (redirectTo) router.push(redirectTo)
      }
    } else if (redirectTo) {
      router.push(redirectTo)
    }
    setLoading(false)
  }, [router, redirectTo])

  return { user, loading }
}
