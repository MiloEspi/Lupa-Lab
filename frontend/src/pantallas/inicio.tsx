import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Laptop, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { api, ErrorApi, pedir } from '../api/cliente'
import { useYo } from '../lib/sesion'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Field } from '../ui/field'
import { Aviso, Titulo } from '../ui/marco'

const nombreRol = (yo: ReturnType<typeof useYo>['data'], rol: string) =>
  yo?.roles_disponibles.find((r) => r.valor === rol)?.nombre ?? rol

export function Inicio() {
  const { data: yo } = useYo()
  const roles = yo?.membresia_activa?.roles ?? []
  return (
    <>
      <Titulo rotulo={yo?.membresia_activa?.laboratorio.nombre}>Hola, {yo?.usuario.nombre || yo?.usuario.email}</Titulo>
      <Card className="max-w-2xl p-6">
        <h2 className="m-0 mb-2 text-[18px]">Tus roles</h2>
        <div className="flex flex-wrap gap-2">
          {roles.length ? roles.map((r) => <Badge key={r} tone="accion">{nombreRol(yo, r)}</Badge>) : <span className="text-ink3">Todavía no tenés roles asignados.</span>}
        </div>
        <p className="mt-5 mb-0 text-ink2">
          Los casos, la revisión técnica y la producción se suman en las próximas etapas. Por ahora podés manejar tu perfil
          {yo?.permisos.includes('gestionar_equipo') ? ' y el equipo del laboratorio' : ''}.
        </p>
      </Card>
    </>
  )
}

function CambiarPassword() {
  const [actual, setActual] = useState('')
  const [password, setPassword] = useState('')
  const cambio = useMutation({
    mutationFn: () => pedir(api.POST('/api/auth/contrasena', { body: { actual, password } })),
    onSuccess: () => {
      setActual('')
      setPassword('')
    },
  })
  const errorDe = (c: string) => (cambio.error instanceof ErrorApi ? cambio.error.campos[c]?.[0] : undefined)
  return (
    <Card className="p-6">
      <h2 className="m-0 mb-4 text-[18px]">Contraseña</h2>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          cambio.mutate()
        }}
      >
        <Field label="Contraseña actual" type="password" autoComplete="current-password" required value={actual} error={errorDe('actual')} onChange={(e) => setActual(e.target.value)} />
        <Field
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          hint="Al menos 10 caracteres."
          required
          value={password}
          error={errorDe('password')}
          onChange={(e) => setPassword(e.target.value)}
        />
        {cambio.isSuccess && <Aviso tono="ok">Contraseña cambiada. Cerramos las sesiones de tus otros dispositivos.</Aviso>}
        <Button type="submit" variant="secondary" disabled={cambio.isPending} className="justify-self-start">
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  )
}

function pareceCelular(agente: string) {
  return /Android|iPhone|iPad|Mobile/i.test(agente)
}

function describir(agente: string) {
  const navegador = /Edg\//.test(agente) ? 'Edge' : /Chrome\//.test(agente) ? 'Chrome' : /Firefox\//.test(agente) ? 'Firefox' : /Safari\//.test(agente) ? 'Safari' : 'Navegador'
  const sistema = /Windows/.test(agente) ? 'Windows' : /Android/.test(agente) ? 'Android' : /iPhone|iPad/.test(agente) ? 'iOS' : /Mac OS/.test(agente) ? 'Mac' : /Linux/.test(agente) ? 'Linux' : ''
  return [navegador, sistema].filter(Boolean).join(' en ')
}

function Dispositivos() {
  const cliente = useQueryClient()
  const sesiones = useQuery({ queryKey: ['sesiones'], queryFn: () => pedir(api.GET('/api/auth/sesiones')) })
  const cerrar = useMutation({
    mutationFn: (id: string) => pedir(api.DELETE('/api/auth/sesiones/{id}', { params: { path: { id } } })),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['sesiones'] }),
  })
  return (
    <Card className="p-6">
      <h2 className="m-0 mb-1 text-[18px]">Mis dispositivos</h2>
      <p className="mt-0 mb-4 text-[14px] text-ink2">Si perdiste un celular o usaste una PC ajena, cerrá esa sesión desde acá.</p>
      <ul className="m-0 grid list-none gap-2 p-0">
        {sesiones.data?.map((s) => {
          const Icono = pareceCelular(s.agente ?? '') ? Smartphone : Laptop
          return (
            <li key={s.id} className="flex items-center gap-3 rounded-xl bg-sf2 px-3 py-2.5">
              <Icono aria-hidden className="size-5 text-ink3" />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[14px] font-semibold">
                  {describir(s.agente ?? '')} {s.esta && <Badge tone="ok" className="ml-1">Este</Badge>}
                </p>
                <p className="m-0 text-[12px] text-ink3">Último uso: {new Date(s.ultimo_uso ?? s.creada).toLocaleString('es-AR')}</p>
              </div>
              {!s.esta && (
                <Button variant="ghost" onClick={() => cerrar.mutate(s.id)}>
                  Cerrar
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function Perfil() {
  const { data: yo } = useYo()
  return (
    <>
      <Titulo rotulo={yo?.usuario.email}>Mi perfil</Titulo>
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <CambiarPassword />
        <Dispositivos />
      </div>
    </>
  )
}

const ACCIONES: Record<string, string> = {
  ingreso: 'Entró',
  salida: 'Salió',
  invitacion_enviada: 'Invitó',
  invitacion_aceptada: 'Aceptó la invitación',
  invitacion_revocada: 'Anuló una invitación',
  miembro_cambiado: 'Cambió roles o estado',
  contrasena_cambiada: 'Cambió su contraseña',
  contrasena_restablecida: 'Restableció su contraseña',
  sesion_cerrada: 'Cerró una sesión',
}

export function Actividad() {
  const eventos = useQuery({ queryKey: ['eventos'], queryFn: () => pedir(api.GET('/api/auditoria/eventos')) })
  return (
    <>
      <Titulo rotulo="Auditoría">Actividad</Titulo>
      <Card className="max-w-4xl p-0">
        {eventos.error && <div className="p-5"><Aviso>{eventos.error.message}</Aviso></div>}
        <ol className="m-0 list-none p-0">
          {eventos.data?.map((e) => (
            <li key={e.id} className="grid gap-1 border-t border-ln px-5 py-3 first:border-t-0 sm:grid-cols-[150px_1fr]">
              <time className="font-mono text-[12px] text-ink3">{new Date(e.cuando).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</time>
              <span className="text-[14px]">
                <strong>{e.nombre_usuario || 'Sistema'}</strong> · {ACCIONES[e.accion] ?? e.accion}
                {e.despues && typeof e.despues === 'object' && 'email' in e.despues ? ` · ${String(e.despues.email)}` : ''}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </>
  )
}
