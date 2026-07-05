import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center gap-3 bg-background text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="text-sm font-medium">Cargando…</span>
    </div>
  )
}
