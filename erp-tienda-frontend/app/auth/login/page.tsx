"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Cookies from "js-cookie"
import { Store, Loader2 } from "lucide-react"

import { getApiUrl } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

interface LoginResponse {
  access_token: string
  usuario: {
    id: number
    nombre: string
    rol: string
  }
}

export default function LoginPage() {
  const [nombre, setNombre] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await fetch(`${getApiUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, password }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || "Credenciales inválidas")
      }

      const data: LoginResponse = await res.json()

      // Expiración de la cookie alineada al JWT real (expiresIn: '12h' en el
      // backend, ver auth.module.ts). SameSite=Lax y Secure solo bajo HTTPS:
      // en producción (https) la cookie es Secure; por HTTP desde la IP de la
      // laptop (probar en el celular) el navegador descartaría una cookie
      // Secure (ver docs/decisions/0008-cookie-flags.md, enmienda UX-01).
      const cookieOptions = {
        expires: 0.5,
        path: "/",
        secure: window.location.protocol === "https:",
        sameSite: "lax" as const,
      }
      Cookies.set("token", data.access_token, cookieOptions)
      // Guardar info del usuario para mostrar en el sidebar
      Cookies.set("user", JSON.stringify(data.usuario), cookieOptions)

      // Si el navegador no guardó la sesión, redirigir solo causaría un bucle
      // de vuelta al login sin explicación.
      if (!Cookies.get("token")) {
        setError(
          "No se pudo guardar la sesión en este navegador. Abre el sistema desde su dirección segura (https) o desde la computadora."
        )
        return
      }

      router.push("/dashboard/pos")
      router.refresh()
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError("Error de conexión con el servidor")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="items-center gap-3 pt-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-primary text-primary-foreground">
          <Store className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-xl font-semibold tracking-tight">Tienda Karlita</CardTitle>
          <CardDescription>Ingresa tus credenciales para acceder al ERP</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6">
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          {error && (
            <div className="rounded-sm border border-destructive/20 bg-destructive/10 p-3 text-center text-sm font-medium text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="nombre" className="text-xs font-medium text-muted-foreground">Nombre de usuario</Label>
            <Input
              id="nombre"
              type="text"
              placeholder="admin"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              autoComplete="username"
              className="h-11 md:h-11"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-11 md:h-11"
            />
          </div>

          <Button type="submit" className="mt-1 h-11 md:h-11 w-full gap-2" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Verificando acceso…
              </>
            ) : (
              "Iniciar sesión"
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-border py-4">
        <p className="text-center text-xs text-muted-foreground">
          Sistema de control transaccional · v1.0
        </p>
      </CardFooter>
    </Card>
  )
}
