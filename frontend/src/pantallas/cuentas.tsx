/** Pantallas sin sesión: ingreso, recuperar y restablecer contraseña, invitación, elegir laboratorio. */
import { useMutation, useQuery } from '@tanstack/react-query'
import { Building2, ChevronRight } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { api, ErrorApi, pedir } from '../api/cliente'
import { useGuardarYo, useYo } from '../lib/sesion'
import { Cargando } from '../ui/con-sesion'
import { Button } from '../components/ui/button'
import { Field } from '../components/ui/field'
import { Aviso, PantallaPublica } from '../ui/marco'

const error = (e: unknown, campo: string) => (e instanceof ErrorApi ? e.campos[campo]?.[0] : undefined)

export function Ingresar() {
  const { data: yo } = useYo()
  const guardarYo = useGuardarYo()
  const navegar = useNavigate()
  const desde = (useLocation().state as { desde?: string } | null)?.desde ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const ingreso = useMutation({
    mutationFn: () => pedir(api.POST('/api/auth/ingresar', { body: { email, password } })),
    onSuccess: (datos) => {
      guardarYo(datos)
      navegar(datos.membresia_activa ? desde : '/elegir-laboratorio', { replace: true })
    },
  })

  if (yo) return <Navigate to="/" replace />

  function enviar(e: FormEvent) {
    e.preventDefault()
    ingreso.mutate()
  }

  return (
    <PantallaPublica titulo="Entrá a tu laboratorio">
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <Field label="Mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {ingreso.error && <Aviso>{ingreso.error.message}</Aviso>}
        <Button type="submit" disabled={ingreso.isPending}>
          {ingreso.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
        <Link to="/recuperar" className="justify-self-center text-[14px] font-medium text-acT">
          Me olvidé la contraseña
        </Link>
      </form>
    </PantallaPublica>
  )
}

export function Recuperar() {
  const [email, setEmail] = useState('')
  const pedido = useMutation({ mutationFn: () => pedir(api.POST('/api/auth/recuperar', { body: { email } })) })

  return (
    <PantallaPublica titulo="Recuperá tu contraseña">
      {pedido.isSuccess ? (
        <div className="grid gap-4">
          <Aviso tono="ok">Si {email} tiene usuario, te llega un mail con un link para elegir una contraseña nueva.</Aviso>
          <Link to="/ingresar" className="text-[14px] font-medium text-acT">
            Volver a entrar
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            pedido.mutate()
          }}
        >
          <p className="m-0 text-ink2">Escribí tu mail y te mandamos un link.</p>
          <Field label="Mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {pedido.error && <Aviso>{pedido.error.message}</Aviso>}
          <Button type="submit" disabled={pedido.isPending}>
            Mandarme el link
          </Button>
          <Link to="/ingresar" className="justify-self-center text-[14px] font-medium text-acT">
            Volver
          </Link>
        </form>
      )}
    </PantallaPublica>
  )
}

/** Contraseña nueva con confirmación; la valida el backend (largo, comunes). */
function CamposPasswordNueva({ valor, setValor, errorCampo }: { valor: string; setValor: (v: string) => void; errorCampo?: string }) {
  return (
    <Field
      label="Contraseña nueva"
      type="password"
      autoComplete="new-password"
      hint="Al menos 10 caracteres. Una frase corta es más fácil de recordar."
      error={errorCampo}
      required
      value={valor}
      onChange={(e) => setValor(e.target.value)}
    />
  )
}

export function Restablecer() {
  const { uid = '', token = '' } = useParams()
  const [password, setPassword] = useState('')
  const pedido = useMutation({
    mutationFn: () => pedir(api.POST('/api/auth/restablecer', { body: { uid, token, password } })),
  })

  return (
    <PantallaPublica titulo="Elegí una contraseña nueva">
      {pedido.isSuccess ? (
        <div className="grid gap-4">
          <Aviso tono="ok">Listo. Cerramos las sesiones abiertas: entrá con la contraseña nueva.</Aviso>
          <Button asChild>
            <Link to="/ingresar">Entrar</Link>
          </Button>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            pedido.mutate()
          }}
        >
          <CamposPasswordNueva valor={password} setValor={setPassword} errorCampo={error(pedido.error, 'password')} />
          {pedido.error && !error(pedido.error, 'password') && <Aviso>{pedido.error.message}</Aviso>}
          <Button type="submit" disabled={pedido.isPending}>
            Guardar contraseña
          </Button>
        </form>
      )}
    </PantallaPublica>
  )
}

export function AceptarInvitacion() {
  const { token = '' } = useParams()
  const guardarYo = useGuardarYo()
  const navegar = useNavigate()
  const invitacion = useQuery({
    queryKey: ['invitacion', token],
    queryFn: () => pedir(api.GET('/api/auth/invitaciones/{token}', { params: { path: { token } } })),
    retry: false,
  })
  const [nombre, setNombre] = useState<string | null>(null)
  const [apellido, setApellido] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const aceptar = useMutation({
    mutationFn: () =>
      pedir(
        api.POST('/api/auth/invitaciones/{token}', {
          params: { path: { token } },
          body: { nombre: nombre ?? invitacion.data?.nombre, apellido: apellido ?? invitacion.data?.apellido, password },
        }),
      ),
    onSuccess: (yo) => {
      guardarYo(yo)
      navegar('/', { replace: true })
    },
  })

  if (invitacion.isPending) return <Cargando />
  if (invitacion.isError)
    return (
      <PantallaPublica titulo="El link no sirve">
        <Aviso>{invitacion.error.message}</Aviso>
        <p className="mt-4 mb-0 text-ink2">Pedile a quien administra el laboratorio que te mande una invitación nueva.</p>
      </PantallaPublica>
    )

  const datos = invitacion.data
  return (
    <PantallaPublica titulo={`Sumate a ${datos.laboratorio}`}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          aceptar.mutate()
        }}
      >
        <p className="m-0 text-ink2">
          Vas a entrar como <strong className="text-ink">{datos.email}</strong>.
        </p>
        {datos.ya_tiene_usuario ? (
          <Field
            label="Tu contraseña de siempre"
            hint="Ya tenés usuario en Lupa Lab: confirmá que sos vos."
            type="password"
            autoComplete="current-password"
            error={error(aceptar.error, 'password')}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre" autoComplete="given-name" value={nombre ?? datos.nombre} onChange={(e) => setNombre(e.target.value)} />
              <Field label="Apellido" autoComplete="family-name" value={apellido ?? datos.apellido} onChange={(e) => setApellido(e.target.value)} />
            </div>
            <CamposPasswordNueva valor={password} setValor={setPassword} errorCampo={error(aceptar.error, 'password')} />
          </>
        )}
        {aceptar.error && !error(aceptar.error, 'password') && <Aviso>{aceptar.error.message}</Aviso>}
        <Button type="submit" disabled={aceptar.isPending}>
          Entrar al laboratorio
        </Button>
      </form>
    </PantallaPublica>
  )
}

export function ElegirLaboratorio() {
  const { data: yo } = useYo()
  const guardarYo = useGuardarYo()
  const navegar = useNavigate()
  const elegir = useMutation({
    mutationFn: (laboratorio: string) => pedir(api.POST('/api/auth/laboratorio', { body: { laboratorio } })),
    onSuccess: (datos) => {
      guardarYo(datos)
      navegar('/', { replace: true })
    },
  })
  if (!yo) return null
  return (
    <PantallaPublica titulo="¿En qué laboratorio trabajás ahora?">
      <ul className="m-0 grid list-none gap-2 p-0">
        {yo.membresias.map((m) => (
          <li key={m.id}>
            <button
              onClick={() => elegir.mutate(m.laboratorio.id)}
              disabled={elegir.isPending}
              aria-current={yo.membresia_activa?.id === m.id}
              className="campo flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] font-semibold"
            >
              <Building2 aria-hidden className="size-5 text-acT" />
              <span className="flex-1">{m.laboratorio.nombre}</span>
              <ChevronRight aria-hidden className="size-4 text-ink3" />
            </button>
          </li>
        ))}
      </ul>
      {elegir.error && <Aviso>{elegir.error.message}</Aviso>}
    </PantallaPublica>
  )
}
