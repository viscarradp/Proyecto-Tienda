import type { Rol } from "@/lib/navigation"

/** Nombre del rol en lenguaje de tienda (como se lo dice la app a la usuaria). */
export function etiquetaRol(rol?: Rol | null): string {
  if (rol === "ADMIN") return "Dueña (administradora)"
  if (rol === "CAJERO") return "Cajera"
  return ""
}
