"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

/**
 * Bottom sheet: patrón base para acciones principales en móvil (§5.5, §6 specs).
 * Envuelve el primitivo Sheet con side="bottom", un asa de arrastre y altura
 * máxima con scroll. Reutilizado por POS/Inventario/etc. en fases posteriores.
 */
function BottomSheetContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetContent>) {
  return (
    <SheetContent
      side="bottom"
      showCloseButton={showCloseButton}
      className={cn(
        "max-h-[90dvh] overflow-y-auto rounded-t-md bg-popover pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    >
      {/* Asa de arrastre (círculo permitido por la regla de radios) */}
      <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-border" />
      {children}
    </SheetContent>
  )
}

export {
  Sheet as BottomSheet,
  SheetTrigger as BottomSheetTrigger,
  SheetClose as BottomSheetClose,
  BottomSheetContent,
  SheetHeader as BottomSheetHeader,
  SheetFooter as BottomSheetFooter,
  SheetTitle as BottomSheetTitle,
  SheetDescription as BottomSheetDescription,
}
