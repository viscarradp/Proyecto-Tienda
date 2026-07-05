'use client' // Los error boundaries deben ser Client Components

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-destructive/20 bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold">Algo salió mal</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ocurrió un error inesperado. Puedes intentar de nuevo; si persiste, contacta soporte.
        </p>
      </div>
      <Button onClick={() => unstable_retry()} className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Intentar de nuevo
      </Button>
    </div>
  )
}
