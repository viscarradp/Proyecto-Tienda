'use client'

import * as React from "react"
import {
  KeyRound,
  Loader2,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserX,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatePill } from "@/components/state-pill"
import { useCurrentUser } from "@/hooks/useCurrentUser"
import { apiFetch } from "@/lib/api"
import { etiquetaRol, mensajeError } from "@/lib/glosario"
import { CampoError } from "@/components/campo-error"
import type { Rol } from "@/lib/navigation"

interface Usuario {
  id: number
  nombre: string
  rol: Rol
  activo: boolean
}

type Accion =
  | { tipo: "crear" }
  | { tipo: "rol"; usuario: Usuario }
  | { tipo: "password"; usuario: Usuario }
  | { tipo: "desactivar"; usuario: Usuario }
  | { tipo: "reactivar"; usuario: Usuario }

/**
 * Gestión de usuarios (solo ADMIN). Los usuarios no se borran: se desactivan,
 * para que quede quién hizo qué en el historial. Un usuario desactivado no
 * puede entrar y su sesión abierta deja de servir de inmediato.
 */
export default function UsuariosPage() {
  const { user: yo } = useCurrentUser()
  const [usuarios, setUsuarios] = React.useState<Usuario[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  const [accion, setAccion] = React.useState<Accion | null>(null)
  const [guardando, setGuardando] = React.useState(false)
  const [errorDialogo, setErrorDialogo] = React.useState("")
  // Errores de campo (nombre, contraseña): salen junto al campo.
  const [errorNombre, setErrorNombre] = React.useState("")
  const [errorPassword, setErrorPassword] = React.useState("")

  // Campos del diálogo activo
  const [nombre, setNombre] = React.useState("")
  const [rol, setRol] = React.useState<Rol>("CAJERO")
  const [password, setPassword] = React.useState("")

  const cargar = React.useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setUsuarios(await apiFetch<Usuario[]>("/usuarios"))
    } catch (err: unknown) {
      setError(mensajeError("cargar los usuarios", err))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    cargar()
  }, [cargar])

  const abrir = (a: Accion) => {
    setErrorDialogo("")
    setErrorNombre("")
    setErrorPassword("")
    setPassword("")
    setNombre("")
    setRol(a.tipo === "rol" ? a.usuario.rol : "CAJERO")
    setAccion(a)
  }

  const cerrar = () => {
    if (!guardando) setAccion(null)
  }

  const ejecutar = async (
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown> | undefined,
    exito: string,
  ) => {
    setGuardando(true)
    setErrorDialogo("")
    try {
      await apiFetch(path, { method, body: body ? JSON.stringify(body) : undefined })
      toast.success(exito)
      setAccion(null)
      await cargar()
    } catch (err: unknown) {
      setErrorDialogo(mensajeError("completar la acción", err))
    } finally {
      setGuardando(false)
    }
  }

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!accion) return
    const MSG_PASSWORD = "La contraseña debe tener al menos 6 caracteres."
    if (accion.tipo === "crear") {
      const sinNombre = !nombre.trim()
      const passCorta = password.length < 6
      setErrorNombre(sinNombre ? "Escribe el nombre del usuario." : "")
      setErrorPassword(passCorta ? MSG_PASSWORD : "")
      if (sinNombre || passCorta) return
      return ejecutar("/usuarios", "POST", { nombre: nombre.trim(), rol, password }, "Usuario creado")
    }
    if (accion.tipo === "rol") {
      return ejecutar(`/usuarios/${accion.usuario.id}`, "PATCH", { rol }, "Rol actualizado")
    }
    if (accion.tipo === "password") {
      if (password.length < 6) return setErrorPassword(MSG_PASSWORD)
      return ejecutar(`/usuarios/${accion.usuario.id}`, "PATCH", { password }, "Contraseña cambiada")
    }
    if (accion.tipo === "desactivar") {
      return ejecutar(`/usuarios/${accion.usuario.id}`, "DELETE", undefined, "Usuario desactivado")
    }
    return ejecutar(`/usuarios/${accion.usuario.id}/reactivar`, "PATCH", undefined, "Usuario reactivado")
  }

  const titulo =
    accion?.tipo === "crear"
      ? "Nuevo usuario"
      : accion?.tipo === "rol"
        ? "Cambiar rol"
        : accion?.tipo === "password"
          ? "Cambiar contraseña"
          : accion?.tipo === "desactivar"
            ? "Desactivar usuario"
            : "Reactivar usuario"

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8 lg:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight lg:text-xl">Usuarios</h1>
            <p className="text-xs text-muted-foreground">Quién puede entrar al sistema</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button aria-label="Actualizar usuarios" variant="outline" size="icon" onClick={cargar} disabled={loading} >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
            <Button onClick={() => abrir({ tipo: "crear" })} className="gap-2">
              <PlusCircle className="h-4 w-4" /> Nuevo usuario
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <p className="rounded-sm border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            Los usuarios no se borran: se <strong>desactivan</strong>, así el historial conserva quién vendió, anuló
            o cerró cada turno. Un usuario desactivado ya no puede entrar y su sesión se cierra de inmediato.
          </p>

          {error && (
            <div className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading && usuarios.length === 0 ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {usuarios.map((u) => {
                const esYo = yo?.nombre === u.nombre
                return (
                  <li
                    key={u.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-sm border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
                      !u.activo && "opacity-70",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{u.nombre}</span>
                        {esYo && <span className="text-xs text-muted-foreground">(tú)</span>}
                        <StatePill tone={u.rol === "ADMIN" ? "primary" : "muted"}>
                          {u.rol === "ADMIN" && <ShieldCheck className="h-3 w-3" />}
                          {etiquetaRol(u.rol)}
                        </StatePill>
                        <StatePill tone={u.activo ? "success" : "destructive"}>
                          {u.activo ? "Activo" : "Desactivado"}
                        </StatePill>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => abrir({ tipo: "rol", usuario: u })}>
                        <UserCog className="h-4 w-4" /> Rol
                      </Button>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => abrir({ tipo: "password", usuario: u })}>
                        <KeyRound className="h-4 w-4" /> Contraseña
                      </Button>
                      {u.activo ? (
                        !esYo && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => abrir({ tipo: "desactivar", usuario: u })}
                          >
                            <UserX className="h-4 w-4" /> Desactivar
                          </Button>
                        )
                      ) : (
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => abrir({ tipo: "reactivar", usuario: u })}>
                          <UserCheck className="h-4 w-4" /> Reactivar
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={accion !== null} onOpenChange={(v) => !v && cerrar()}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {accion && accion.tipo !== "crear" && (
              <DialogDescription>{accion.usuario.nombre}</DialogDescription>
            )}
          </DialogHeader>

          <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
            {accion?.tipo === "crear" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="usuarios-nombre" className="text-xs font-medium text-muted-foreground">Nombre</Label>
                <Input id="usuarios-nombre"
                  value={nombre}
                  onChange={(e) => { setNombre(e.target.value); setErrorNombre("") }}
                  placeholder="Ej. Karla"
                  autoFocus
                  maxLength={100}
                  aria-invalid={!!errorNombre}
                  aria-describedby={errorNombre ? "usuarios-nombre-error" : undefined}
                />
                {errorNombre && <CampoError id="usuarios-nombre-error">{errorNombre}</CampoError>}
              </div>
            )}

            {(accion?.tipo === "crear" || accion?.tipo === "rol") && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="usuarios-rol" className="text-xs font-medium text-muted-foreground">Rol</Label>
                <Select value={rol} onValueChange={(v) => setRol(v as Rol)}>
                  <SelectTrigger id="usuarios-rol" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAJERO">{etiquetaRol("CAJERO")}</SelectItem>
                    <SelectItem value="ADMIN">{etiquetaRol("ADMIN")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  La cajera vende, anula, devuelve, paga gastos chicos desde la gaveta y guarda en la bóveda. La
                  dueña además controla retiros, aportes, compras, precios, reportes y usuarios.
                </p>
              </div>
            )}

            {(accion?.tipo === "crear" || accion?.tipo === "password") && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="usuarios-minimo-6-caracteres" className="text-xs font-medium text-muted-foreground">
                  {accion.tipo === "crear" ? "Contraseña" : "Nueva contraseña"} (mínimo 6 caracteres)
                </Label>
                <Input id="usuarios-minimo-6-caracteres"
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorPassword("") }}
                  autoComplete="new-password"
                  autoFocus={accion.tipo === "password"}
                  aria-invalid={!!errorPassword}
                  aria-describedby={errorPassword ? "usuarios-password-error" : undefined}
                />
                {errorPassword && <CampoError id="usuarios-password-error">{errorPassword}</CampoError>}
              </div>
            )}

            {accion?.tipo === "desactivar" && (
              <p className="text-sm text-muted-foreground">
                <strong>{accion.usuario.nombre}</strong> ya no podrá entrar y, si tiene la sesión abierta, se le
                cerrará en su próxima acción. Su historial se conserva. Puedes reactivarlo cuando quieras.
              </p>
            )}
            {accion?.tipo === "reactivar" && (
              <p className="text-sm text-muted-foreground">
                <strong>{accion.usuario.nombre}</strong> podrá volver a entrar con su contraseña.
              </p>
            )}

            {errorDialogo && (
              <CampoError className="rounded-sm border border-destructive/30 bg-destructive/10 p-2 text-sm">{errorDialogo}</CampoError>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={guardando}
                variant={accion?.tipo === "desactivar" ? "destructive-solid" : "default"}
                className="gap-2"
              >
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                {accion?.tipo === "desactivar" ? "Desactivar" : accion?.tipo === "reactivar" ? "Reactivar" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
