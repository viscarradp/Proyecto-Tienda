import Cookies from "js-cookie"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

export type ApiErrorKind = "red" | "servidor" | "validacion" | "no_encontrado" | "sesion"

/**
 * Error de la API con un tipo para que cada pantalla decida qué hacer
 * (p. ej. "red" → ofrecer Reintentar; "no_encontrado" → no existe el recurso).
 * `message` ya es un texto listo para mostrar a la cajera.
 */
export class ApiError extends Error {
  kind: ApiErrorKind
  status: number | null

  constructor(message: string, kind: ApiErrorKind, status: number | null = null) {
    super(message)
    this.name = "ApiError"
    this.kind = kind
    this.status = status
  }
}

export const MSG_SIN_CONEXION =
  "No hay conexión con el sistema. Revisa el internet e intenta de nuevo. Si sigue, anota la venta y usa «Venta durante un apagón» al volver la conexión."
export const MSG_ERROR_SERVIDOR = "Algo falló en el sistema. Intenta de nuevo en un momento."

/** Tipo de un error cualquiera, o null si no viene de apiFetch. */
export function tipoDeError(err: unknown): ApiErrorKind | null {
  return err instanceof ApiError ? err.kind : null
}

/**
 * Helper centralizado para peticiones al backend NestJS.
 * Inyecta automáticamente el JWT desde las cookies en cada request.
 * Lanza siempre ApiError (con `kind`) para fallos de red, servidor y 4xx.
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

  let res: Response
  try {
    res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    })
  } catch {
    throw new ApiError(MSG_SIN_CONEXION, "red")
  }

  if (res.status === 401) {
    // Token expirado o inválido — limpiar cookie y redirigir al login
    Cookies.remove("token")
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login"
    }
    throw new ApiError("Sesión expirada. Redirigiendo al login...", "sesion", 401)
  }

  if (!res.ok) {
    if (res.status >= 500) {
      throw new ApiError(MSG_ERROR_SERVIDOR, "servidor", res.status)
    }
    const errorBody = await res.json().catch(() => ({}))
    const raw = errorBody?.message
    const message = Array.isArray(raw)
      ? raw.join(". ")
      : typeof raw === "string" && raw
        ? raw
        : `Error ${res.status}`
    throw new ApiError(message, res.status === 404 ? "no_encontrado" : "validacion", res.status)
  }

  return res.json() as Promise<T>
}
