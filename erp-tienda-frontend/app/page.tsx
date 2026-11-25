import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getHomeRoute, type Rol } from "@/lib/navigation"
import { tokenVigente } from "@/lib/sesion"

export default async function Home() {
  const cookieStore = await cookies()

  if (!tokenVigente(cookieStore.get("token")?.value)) {
    redirect("/auth/login")
  }

  let destino = "/dashboard/pos"
  try {
    const raw = cookieStore.get("user")?.value
    const rol = raw ? (JSON.parse(decodeURIComponent(raw)) as { rol?: Rol }).rol : undefined
    const home = getHomeRoute(rol)
    if (rol && home !== "/auth/login") destino = home
  } catch {
    // cookie ilegible: se usa la pantalla de ventas
  }
  redirect(destino)
}
