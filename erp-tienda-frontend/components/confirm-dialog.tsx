"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pregunta corta: "¿Borrar la categoría Bebidas?" */
  title: string
  /** Qué va a pasar exactamente (y si se puede o no deshacer). */
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** true (por defecto) = botón rojo sólido (`destructive-solid`). */
  destructive?: boolean
  /** Variante del botón de confirmar; si se pasa, manda sobre `destructive`. Ej.: "success". */
  confirmVariant?: "default" | "success" | "warning" | "destructive-solid"
  onConfirm: () => void | Promise<void>
}

/**
 * Confirmación uniforme para acciones destructivas: dice qué va a pasar y deja
 * cancelar con un toque. El foco inicial queda en "Cancelar" (lo seguro).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = true,
  confirmVariant,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false)

  const handleConfirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            autoFocus
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant ?? (destructive ? "destructive-solid" : "default")}
            onClick={handleConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
