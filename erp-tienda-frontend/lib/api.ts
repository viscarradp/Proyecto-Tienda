import Cookies from "js-cookie"

const CONFIGURED_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

const HOSTS_LOCALES = ["localhost", "127.0.0.1", "[::1]"]

/**
 * URL base de la API, sin "/" final.
 *
 * Para probar desde el celular en la red local: si la API está configurada en
 * localhost pero la página se abrió por otra dirección (p. ej. la IP de la
 * laptop), en el celular "localhost" sería el propio celular. Entonces se usa
 * el mismo host de la página, con el puerto y protocolo configurados.
 * En producción (dominio real) o con la página en localhost no cambia nada.
 */
export function getApiUrl(): string {
  const base = CONFIGURED_API_URL.replace(/\/+$/, "")
  if (typeof window === "undefined") return base
  try {
    const url = new URL(base)
    const paginaEnLocal = HOSTS_LOCALES.includes(window.location.hostname) ||
      window.location.hostname === "::1"
    if (HOSTS_LOCALES.includes(url.hostname) && !paginaEnLocal) {
      url.hostname = window.location.hostname
      return url.toString().replace(/\/+$/, "")
    }
    return base
  } catch {
    return base
  }
}

export type ApiErrorKind = "red" | "servidor" | "validacion" | "no_encontrado" | "sesion" | "permiso"

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
    res = await fetch(`${getApiUrl()}${endpoint}`, {
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
    // 403 (D-06): el mensaje es el del backend ("Esto lo hace la dueña…").
    const kind: ApiErrorKind =
      res.status === 404 ? "no_encontrado" : res.status === 403 ? "permiso" : "validacion"
    throw new ApiError(message, kind, res.status)
  }

  return res.json() as Promise<T>
}
