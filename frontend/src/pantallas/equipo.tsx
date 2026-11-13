/** Administración > Equipo: personas, roles, bajas e invitaciones. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MailPlus, X } from 'lucide-react'
import { useState } from 'react'
import { api, ErrorApi, pedir, type Esquemas } from '../api/cliente'
import { useYo } from '../lib/sesion'
import { cn } from '../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Field } from '../ui/field'
import { Aviso, Titulo } from '../ui/marco'

type Rol = Esquemas['RolesEnum']

/** Chips de roles: un toque prende o apaga cada uno (sin desplegables, P12). */
function SelectorRoles({ valor, onChange, deshabilitado }: { valor: Rol[]; onChange: (r: Rol[]) => void; deshabilitado?: boolean }) {
  const { data: yo } = useYo()
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Roles">
      {yo?.roles_disponibles.map(({ valor: rol, nombre }) => {
        const activo = valor.includes(rol as Rol)
        return (
          <button
            key={rol}
            type="button"
            disabled={deshabilitado}
            aria-pressed={activo}
            onClick={() => onChange(activo ? valor.filter((r) => r !== rol) : [...valor, rol as Rol])}
            className={cn(
              'min-h-9 rounded-full border px-3 text-[13px] font-medium transition-colors disabled:opacity-50',
              activo ? 'border-ink bg-ink text-bg' : 'border-ctl bg-sf2 text-ink2 hover:border-ink',
            )}
          >
            {nombre}
          </button>
        )
      })}
    </div>
  )
}

export function Equipo() {
  const cliente = useQueryClient()
  const miembros = useQuery({ queryKey: ['miembros'], queryFn: () => pedir(api.GET('/api/equipo/miembros')) })
  const invitaciones = useQuery({ queryKey: ['invitaciones'], queryFn: () => pedir(api.GET('/api/equipo/invitaciones')) })
  const [errorFila, setErrorFila] = useState<{ id: string; mensaje: string } | null>(null)

  const cambiar = useMutation({
    mutationFn: ({ id, cambio }: { id: string; cambio: Esquemas['PatchedMiembroCambioRequest'] }) =>
      pedir(api.PATCH('/api/equipo/miembros/{id}', { params: { path: { id } }, body: cambio })),
    onMutate: () => setErrorFila(null),
    onError: (e, { id }) => setErrorFila({ id, mensaje: e.message }),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['miembros'] }),
  })
  const revocar = useMutation({
    mutationFn: (id: string) => pedir(api.DELETE('/api/equipo/invitaciones/{id}', { params: { path: { id } } })),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['invitaciones'] }),
  })

  return (
    <>
      <Titulo rotulo="Administración">Equipo</Titulo>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="p-0">
          <h2 className="m-0 px-5 pt-5 text-[18px]">Personas</h2>
          {miembros.isPending && <p className="px-5 text-ink3">Cargando…</p>}
          {miembros.error && <div className="p-5"><Aviso>{miembros.error.message}</Aviso></div>}
          <ul className="m-0 list-none p-0">
            {miembros.data?.map((m) => (
              <li key={m.id} className={cn('grid gap-3 border-t border-ln px-5 py-4 first:border-t-0 sm:grid-cols-[220px_1fr_auto] sm:items-center', !m.activa && 'opacity-70')}>
                <div className="min-w-0">
                  <p className="m-0 truncate font-semibold">{m.usuario.nombre_visible}</p>
                  <p className="m-0 truncate text-[13px] text-ink3">{m.usuario.email}</p>
                  {!m.activa && <Badge tone="neutral" className="mt-1">De baja</Badge>}
                </div>
                <SelectorRoles
                  valor={m.roles ?? []}
                  deshabilitado={!m.activa || cambiar.isPending}
                  onChange={(roles) => cambiar.mutate({ id: m.id, cambio: { roles } })}
                />
                <Button variant={m.activa ? 'ghost' : 'secondary'} onClick={() => cambiar.mutate({ id: m.id, cambio: { activa: !m.activa } })}>
                  {m.activa ? 'Dar de baja' : 'Reactivar'}
                </Button>
                {errorFila?.id === m.id && <div className="sm:col-span-3"><Aviso>{errorFila.mensaje}</Aviso></div>}
              </li>
            ))}
          </ul>
        </Card>
        <div className="grid content-start gap-6">
          <Invitar />
          {!!invitaciones.data?.length && (
            <Card className="p-5">
              <h2 className="m-0 mb-3 text-[18px]">Invitaciones pendientes</h2>
              <ul className="m-0 grid list-none gap-2 p-0">
                {invitaciones.data.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 rounded-xl bg-sf2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[14px] font-semibold">{i.email}</p>
                      <p className="m-0 text-[12px] text-ink3">Vence el {new Date(i.vence).toLocaleDateString('es-AR')}</p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Anular la invitación de ${i.email}`} onClick={() => revocar.mutate(i.id)}>
                      <X aria-hidden className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function Invitar() {
  const cliente = useQueryClient()
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [roles, setRoles] = useState<Rol[]>([])
  const [enviado, setEnviado] = useState('')
  const invitar = useMutation({
    mutationFn: () => pedir(api.POST('/api/equipo/invitaciones', { body: { email, nombre, roles } })),
    onSuccess: () => {
      setEnviado(email)
      setEmail('')
      setNombre('')
      setRoles([])
      cliente.invalidateQueries({ queryKey: ['invitaciones'] })
    },
  })
  const errorDe = (campo: string) => (invitar.error instanceof ErrorApi ? invitar.error.campos[campo]?.[0] : undefined)

  return (
    <Card tono="tinte" className="p-5">
      <h2 className="m-0 mb-3 flex items-center gap-2 text-[18px]">
        <MailPlus aria-hidden className="size-5 text-acT" /> Invitar a alguien
      </h2>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          setEnviado('')
          invitar.mutate()
        }}
      >
        <Field label="Mail" type="email" required value={email} error={errorDe('email')} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <div className="grid gap-1.5">
          <span className="text-[14px] font-semibold">Roles</span>
          <SelectorRoles valor={roles} onChange={setRoles} />
          {errorDe('roles') && <p className="m-0 text-[13px] font-medium text-ba">Elegí al menos un rol.</p>}
        </div>
        {invitar.error && !errorDe('email') && !errorDe('roles') && <Aviso>{invitar.error.message}</Aviso>}
        {enviado && <Aviso tono="ok">Le mandamos la invitación a {enviado}. El link vence en 7 días.</Aviso>}
        <Button type="submit" disabled={invitar.isPending}>
          Mandar invitación
        </Button>
      </form>
    </Card>
  )
}
