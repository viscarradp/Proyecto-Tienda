"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Cookies from "js-cookie"
import { Store, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

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
      const res = await fetch(`${API_URL}/auth/login`, {
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
      // backend, ver auth.module.ts) — antes decía 1 día y quedaba
      // desincronizada. Secure + SameSite=Lax: localhost cuenta como
      // contexto seguro en navegadores modernos, así que no rompe el
      // desarrollo local (ver docs/decisions/0008-cookie-flags.md).
      const cookieOptions = { expires: 0.5, path: "/", secure: true, sameSite: "lax" as const }
      Cookies.set("token", data.access_token, cookieOptions)
      // Guardar info del usuario para mostrar en el sidebar
      Cookies.set("user", JSON.stringify(data.usuario), cookieOptions)

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
    <Card className="bg-zinc-950/80 backdrop-blur-xl border-zinc-800 shadow-2xl overflow-hidden">
      <CardHeader className="space-y-4 pt-8">
        <div className="flex justify-center">
          <div className="bg-blue-600/20 p-3.5 rounded-2xl border border-blue-600/30 shadow-[0_0_30px_rgba(37,99,235,0.2)]">
            <Store className="h-8 w-8 text-blue-500" />
          </div>
        </div>
        <div className="text-center space-y-1.5">
          <CardTitle className="text-2xl font-black tracking-tight text-white uppercase">Tienda Karlita</CardTitle>
          <CardDescription className="text-zinc-400 text-sm font-medium">
            Ingresa tus credenciales para acceder al ERP
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="px-8 pb-8">
        <form onSubmit={handleLogin} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm p-3 rounded-xl text-center font-medium animate-in fade-in slide-in-from-top-1">
              {error}
            </div>
          )}

          <div className="space-y-2.5">
            <Label htmlFor="nombre" className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Nombre de Usuario</Label>
            <Input
              id="nombre"
              type="text"
              placeholder="admin"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              autoComplete="username"
              className="bg-black/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 h-12 rounded-xl"
            />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="password" className="text-xs font-bold text-zinc-300 uppercase tracking-wider">Contraseña</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-black/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500 focus-visible:border-blue-500/50 h-12 rounded-xl"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-wide transition-all duration-300 disabled:opacity-50 disabled:hover:bg-blue-600 h-12 rounded-xl shadow-lg shadow-blue-900/20 mt-4"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Verificando acceso...
              </>
            ) : (
              "Iniciar Sesión"
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center border-t border-zinc-900/50 pt-6 pb-6 bg-black/20">
        <p className="text-[11px] text-zinc-500 text-center font-medium tracking-wider">
          SISTEMA DE CONTROL TRANSACCIONAL &bull; V1.0 <br />
          <span className="text-zinc-600">TIENDA KARLITA</span>
        </p>
      </CardFooter>
    </Card>
  )
}
