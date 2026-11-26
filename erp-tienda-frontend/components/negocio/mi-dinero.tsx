"use client"

import Link from "next/link"
import { ClipboardCheck, Plus, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SeccionTitulo } from "@/components/seccion-titulo"
import { StatCard } from "@/components/stat-card"
import { formatMoney } from "@/lib/format"
import { BOVEDA, BOVEDA_AYUDA, GAVETA, GAVETA_AYUDA } from "@/lib/glosario"
import { LibroBoveda } from "@/components/negocio/libro-boveda"

/**
 * "Mi dinero" (DUE-32): Gaveta + Bóveda = Efectivo total, menos lo que se debe a proveedores,
 * con los botones de la bóveda y su libro. Las cifras salen de `GET /reportes/patrimonio`.
 */
export function MiDinero({
  gaveta,
  boveda,
  efectivoTotal,
  deudas,
  refreshKey,
  onPoner,
  onContar,
}: {
  gaveta: string
  boveda: string
  efectivoTotal: string
  deudas: string
  refreshKey: number
  onPoner: () => void
  onContar: () => void
}) {
  const bovedaNegativa = parseFloat(boveda) < 0
  return (
    <section aria-label="Mi dinero" className="rounded-sm border border-border bg-card p-5">
      <SeccionTitulo icono={Wallet} ayuda="Lo que tienes en efectivo hoy y lo que debes a proveedores.">
        Mi dinero
      </SeccionTitulo>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard size="md" label={GAVETA} value={formatMoney(gaveta)} hint={GAVETA_AYUDA} />
        <StatCard
          size="md"
          label={BOVEDA}
          value={formatMoney(boveda)}
          tone={bovedaNegativa ? "destructive" : "default"}
          hint={BOVEDA_AYUDA}
        />
        <StatCard
          size="md"
          label="= Efectivo total"
          value={formatMoney(efectivoTotal)}
          hint={`${GAVETA} + ${BOVEDA}`}
          className="border-primary/30 bg-primary/5"
        />
        <StatCard
          size="md"
          label="− Lo que debo"
          value={formatMoney(deudas)}
          hint={
            <Link
              href="/dashboard/gastos"
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:min-h-0"
            >
              Ver deudas en Gastos y deudas
            </Link>
          }
        />
      </div>

      {bovedaNegativa && (
        <p className="mt-3 text-xs text-warning-text">
          El sistema cree que hay menos en la {BOVEDA.toLowerCase()} de lo que sacaste: falta registrar efectivo. Cuenta
          la {BOVEDA.toLowerCase()} o pon dinero.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onPoner} className="gap-2">
          <Plus className="h-4 w-4" /> Poner dinero
        </Button>
        <Button variant="outline" onClick={onContar} className="gap-2">
          <ClipboardCheck className="h-4 w-4" /> Contar la {BOVEDA.toLowerCase()}
        </Button>
      </div>

      <LibroBoveda refreshKey={refreshKey} />
    </section>
  )
}
