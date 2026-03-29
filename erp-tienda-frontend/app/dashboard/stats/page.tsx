import { Construction, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function StatsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black/95 p-6 animate-in fade-in duration-500">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full w-32 h-32 -z-10 animate-pulse"></div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-cyan-400"></div>
          <Construction className="w-16 h-16 text-blue-500 mx-auto" strokeWidth={1.5} />
        </div>
      </div>
      
      <h1 className="text-4xl font-black text-white tracking-tight text-center mb-4 flex items-center gap-2">
        Módulo en Construcción
        <Sparkles className="w-6 h-6 text-cyan-400 animate-pulse" />
      </h1>
      
      <p className="text-zinc-400 text-lg text-center max-w-lg mb-10 leading-relaxed">
        Estamos forjando el panel de estadísticas avanzadas. 
        Pronto podrás visualizar gráficos de ventas, rendimiento de cajeros, ganancias y flujos financieros aquí.
      </p>
      
      <Link href="/dashboard/pos">
        <Button className="bg-white text-black hover:bg-zinc-200 rounded-xl px-8 py-6 h-auto text-base font-bold shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-105">
          Volver al POS Transaccional
        </Button>
      </Link>
    </div>
  )
}
