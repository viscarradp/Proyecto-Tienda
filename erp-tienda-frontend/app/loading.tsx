import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center gap-3 bg-black text-zinc-500">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      <span className="font-bold text-sm">Cargando...</span>
    </div>
  )
}
