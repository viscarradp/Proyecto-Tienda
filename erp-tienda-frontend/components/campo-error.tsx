import * as React from "react"
import { AlertCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Error de un campo de formulario (VIS-24). Cómo conectarlo:
 *
 *   <Input id="monto" aria-invalid={!!error} aria-describedby={error ? "monto-error" : undefined} />
 *   {error && <CampoError id="monto-error">{error}</CampoError>}
 *
 * `role="alert"` hace que el lector de pantalla lo anuncie al aparecer;
 * `aria-invalid` activa el borde rojo que ya traen Input y Select.
 */
export function CampoError({
  id,
  children,
  className,
}: {
  id?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <p id={id} role="alert" className={cn("flex items-start gap-1.5 text-xs text-destructive", className)}>
      <AlertCircle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
