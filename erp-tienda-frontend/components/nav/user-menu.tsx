"use client"

import * as React from "react"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/components/ui/bottom-sheet"
import type { CurrentUser } from "@/hooks/useCurrentUser"
import { useLogout } from "@/hooks/useLogout"
import { etiquetaRol } from "@/lib/roles"

/**
 * Menú de usuario del encabezado móvil (en celular el sidebar no se ve):
 * muestra quién está en la sesión y permite cerrarla.
 */
export function UserMenu({ user }: { user: CurrentUser | null }) {
  const [open, setOpen] = React.useState(false)
  const logout = useLogout()
  const inicial = user?.nombre?.trim().charAt(0).toUpperCase() || "?"

  return (
    <BottomSheet open={open} onOpenChange={setOpen}>
      <BottomSheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={user ? `Usuario: ${user.nombre}. Abrir menú` : "Abrir menú de usuario"}
          title="Usuario"
        >
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
          >
            {inicial}
          </span>
        </Button>
      </BottomSheetTrigger>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>{user ? user.nombre : "Usuario"}</BottomSheetTitle>
          <BottomSheetDescription>{etiquetaRol(user?.rol) || "Sesión iniciada"}</BottomSheetDescription>
        </BottomSheetHeader>
        <div className="px-4 pb-2">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={() => {
              setOpen(false)
              logout()
            }}
          >
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}
