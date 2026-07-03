import Link from "next/link"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-black text-zinc-200 p-8">
      <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
        <SearchX className="h-8 w-8 text-zinc-500" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-xl font-black uppercase tracking-tight text-white">Página no encontrada</h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          La página que buscas no existe o fue movida.
        </p>
      </div>
      <Button asChild className="rounded-xl bg-blue-600 hover:bg-blue-500">
        <Link href="/dashboard/pos">Volver al inicio</Link>
      </Button>
    </div>
  )
}
