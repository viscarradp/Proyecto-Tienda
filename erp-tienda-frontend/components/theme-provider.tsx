"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Envoltura de next-themes. El theming del rediseño se apoya en la clase `.dark`
 * sobre <html> (attribute="class") y en los design tokens de globals.css.
 * El tema por defecto es oscuro (decisión R2); el usuario puede alternar con
 * <ThemeToggle />.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
