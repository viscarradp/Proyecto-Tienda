import Cookies from "js-cookie"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

/**
 * Helper centralizado para peticiones al backend NestJS.
 * Inyecta automáticamente el JWT desde las cookies en cada request.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = Cookies.get("token")

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  }

  if (token) {
    ;(headers as Record<string, string>)["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (res.status === 401) {
    // Token expirado o inválido — limpiar cookie y redirigir al login
    Cookies.remove("token")
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login"
    }
    throw new Error("Sesión expirada. Redirigiendo al login...")
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.message || `Error ${res.status}`)
  }

  return res.json() as Promise<T>
}
