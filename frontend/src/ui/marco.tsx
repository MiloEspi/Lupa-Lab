import { useQueryClient } from '@tanstack/react-query'
import { Activity, BookOpen, Building2, Contact, Home, LogOut, UserRound, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { api } from '../api/cliente'
import { cn } from '../lib/utils'
import { puede, useYo } from '../lib/sesion'
import { Card } from './card'

/** Pantallas sin sesión (ingreso, invitación, contraseña): una tarjeta centrada. */
export function PantallaPublica({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="fondo-app grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <Marca className="mb-6 justify-center" />
        <Card className="entra p-6 sm:p-8">
          <h1 className="m-0 mb-5 text-[26px]">{titulo}</h1>
          {children}
        </Card>
      </div>
    </main>
  )
}

export function Marca({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-ink text-[15px] font-bold text-bg">
        L
      </span>
      <span className="display text-[20px] font-semibold">
        Lupa <span className="text-acT">Lab</span>
      </span>
    </div>
  )
}

const ENLACES = [
  { a: '/', texto: 'Inicio', icono: Home },
  { a: '/clientes', texto: 'Clientes', icono: Contact },
  { a: '/catalogo', texto: 'Catálogo', icono: BookOpen },
  { a: '/equipo', texto: 'Equipo', icono: Users, permiso: 'gestionar_equipo' },
  { a: '/actividad', texto: 'Actividad', icono: Activity, permiso: 'ver_auditoria' },
  { a: '/perfil', texto: 'Mi perfil', icono: UserRound },
]

/** Marco de la app: barra lateral fija (P11) y el contenido. En el celular la barra va arriba. */
export function Marco({ children }: { children: ReactNode }) {
  const { data: yo } = useYo()
  const navegar = useNavigate()
  const cliente = useQueryClient()
  const varios = (yo?.membresias.length ?? 0) > 1

  async function salir() {
    await api.POST('/api/auth/salir')
    cliente.clear()
    navegar('/ingresar', { replace: true })
  }

  return (
    <div className="fondo-app min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <aside className="vidrio-lateral z-10 flex flex-col gap-4 p-4 md:sticky md:top-0 md:m-3 md:h-[calc(100dvh-24px)] md:rounded-[22px]">
        <Marca />
        <div className="rounded-xl bg-sf2/70 px-3 py-2 text-[13px] text-ink2">
          <span className="font-mono text-[11px] tracking-wider text-ink3 uppercase">Laboratorio</span>
          <p className="m-0 font-semibold text-ink">{yo?.membresia_activa?.laboratorio.nombre}</p>
          {varios && (
            <NavLink to="/elegir-laboratorio" className="inline-flex items-center gap-1 text-acT">
              <Building2 aria-hidden className="size-3.5" /> Cambiar
            </NavLink>
          )}
        </div>
        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:flex-col">
          {ENLACES.filter((e) => !e.permiso || puede(yo, e.permiso)).map(({ a, texto, icono: Icono }) => (
            <NavLink
              key={a}
              to={a}
              end={a === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3 text-[15px] font-medium text-ink2 hover:bg-sf/70 hover:text-ink',
                  isActive && 'bg-ink text-bg hover:bg-ink hover:text-bg',
                )
              }
            >
              <Icono aria-hidden className="size-[18px]" />
              {texto}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-2 border-t border-ln pt-3 md:mt-auto md:block">
          <div className="min-w-0">
            <p className="m-0 truncate text-[14px] font-semibold">{yo?.usuario.nombre_visible}</p>
            <p className="m-0 hidden truncate text-[13px] text-ink3 md:block">{yo?.usuario.email}</p>
          </div>
          <button
            onClick={salir}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 text-[14px] font-medium text-ink2 hover:bg-sf/70 md:mt-2"
          >
            <LogOut aria-hidden className="size-4" /> Salir
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  )
}

export function Titulo({ rotulo, children, accion }: { rotulo?: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {rotulo && <p className="m-0 font-mono text-[12px] tracking-wider text-ink3 uppercase">{rotulo}</p>}
        <h1 className="m-0 text-[30px] leading-tight">{children}</h1>
      </div>
      {accion}
    </header>
  )
}

export function Aviso({ tono = 'problema', children }: { tono?: 'problema' | 'ok' | 'info'; children: ReactNode }) {
  const tonos = { problema: 'bg-baS text-ba', ok: 'bg-okS text-ok', info: 'bg-infoS text-info' }
  return (
    <p role={tono === 'problema' ? 'alert' : 'status'} className={cn('m-0 rounded-xl px-3.5 py-2.5 text-[14px] font-medium', tonos[tono])}>
      {children}
    </p>
  )
}
