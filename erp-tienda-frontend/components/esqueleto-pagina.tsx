/** Forma general de una página mientras monta (estática: igual en servidor y cliente). */
export function EsqueletoPagina() {
  return (
    <div
      aria-busy="true"
      role="status"
      className="flex w-full animate-pulse flex-col gap-4 p-4 md:p-6"
    >
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-48 rounded-sm bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="h-20 rounded-sm bg-muted" />
        <div className="h-20 rounded-sm bg-muted" />
        <div className="h-20 rounded-sm bg-muted" />
        <div className="h-20 rounded-sm bg-muted" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-12 rounded-sm bg-muted" />
        <div className="h-12 rounded-sm bg-muted" />
        <div className="h-12 rounded-sm bg-muted" />
        <div className="h-12 rounded-sm bg-muted" />
        <div className="h-12 rounded-sm bg-muted" />
      </div>
    </div>
  )
}
