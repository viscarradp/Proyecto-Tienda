import Link from "next/link"
import { ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getHomeRoute } from "@/lib/navigation"
import type { CurrentUser } from "@/hooks/useCurrentUser"

/**
 * Estado de "sin permiso": respaldo cuando un rol accede directo (URL) a una
 * ruta que no le corresponde. La visibilidad del nav ya evita llegar aquí en
 * uso normal (ver lib/navigation.ts).
 */
export function ForbiddenState({ user }: { user: CurrentUser | null }) {
  const home = getHomeRoute(user?.rol)

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-sm bg-muted text-muted-foreground">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Sin permiso</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu rol no tiene acceso a esta sección. Si crees que es un error, contacta al administrador.
        </p>
      </div>
      {home !== "/auth/login" && (
        <Button asChild>
          <Link href={home}>Ir a mi inicio</Link>
        </Button>
      )}
    </div>
  )
}
