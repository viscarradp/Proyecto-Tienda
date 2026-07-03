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
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-black text-zinc-200 p-8">
      <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Algo salió mal</h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          Ocurrió un error inesperado. Puedes intentar de nuevo; si persiste, contacta soporte.
        </p>
      </div>
      <Button onClick={() => unstable_retry()} className="gap-2 rounded-xl bg-blue-600 hover:bg-blue-500">
        <RefreshCw className="h-4 w-4" />
        Intentar de nuevo
      </Button>
    </div>
  )
}
