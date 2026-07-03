import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/**
 * Protege /dashboard/* a nivel de servidor. Antes de esto, la única
 * protección era un useEffect en el cliente (dashboard/layout.tsx) que
 * corría después de que el contenido ya se había montado.
 *
 * Esto es una verificación de UX (evita el flash de contenido protegido),
 * NO la fuente de autoridad de seguridad: no valida la firma del JWT, solo
 * su presencia y si es obviamente antiguo por su propia fecha de expiración.
 * El backend sigue siendo quien realmente autoriza cada request (guards
 * globales JWT + Roles) — ver docs/decisions/0007-proxy-verificacion-liviana.md.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get("token")?.value

  if (!token || isTokenExpired(token)) {
    const loginUrl = new URL("/auth/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1]
    if (!payload) return true
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number
    }
    if (typeof decoded.exp !== "number") return false
    return Date.now() >= decoded.exp * 1000
  } catch {
    return true
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
}
