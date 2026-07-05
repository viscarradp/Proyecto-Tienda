import Link from "next/link"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <div className="flex h-14 w-14 items-center justify-center rounded-sm border border-border bg-muted">
        <SearchX className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-semibold">Página no encontrada</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard/pos">Volver al inicio</Link>
      </Button>
    </div>
  )
}
