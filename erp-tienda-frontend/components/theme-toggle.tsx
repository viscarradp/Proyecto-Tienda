"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Alterna entre tema claro y oscuro. Usa un guard de montaje para evitar
 * desajustes de hidratación (el tema real solo se conoce en el cliente).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={isDark ? "Tema claro" : "Tema oscuro"}
      className={className}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {/* Antes de montar, no renderizamos icono para no fijar un estado erróneo */}
      {mounted && (isDark ? <Sun /> : <Moon />)}
    </Button>
  )
}
