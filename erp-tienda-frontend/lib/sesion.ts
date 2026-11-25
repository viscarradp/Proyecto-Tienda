/**
 * Verificación liviana de la sesión (solo servidor).
 * Usa Buffer: importa esto únicamente desde proxy.ts y Server Components,
 * nunca desde componentes de cliente.
 *
 * No valida la firma del JWT (ver docs/decisions/0007): solo comprueba que
 * el token exista y que su propia fecha de expiración no haya pasado.
 */
export function tokenVigente(token: string | undefined): boolean {
  if (!token) return false
  try {
    const payload = token.split(".")[1]
    if (!payload) return false
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number
    }
    if (typeof decoded.exp !== "number") return true
    return Date.now() < decoded.exp * 1000
  } catch {
    return false
  }
}
