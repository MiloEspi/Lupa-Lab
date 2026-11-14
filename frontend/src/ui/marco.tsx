import { useQueryClient } from '@tanstack/react-query'
import { Activity, Building2, Contact, LayoutGrid, LogOut, Plus, Rows3, UserRound, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router'
import { api } from '../api/cliente'
import { Card } from '../components/ui/card'
import { ToothIcon } from '../components/ui/tooth'
import { puede, useYo } from '../lib/sesion'
import { cn } from '../lib/utils'

/** Fondo de la app: velos de color, malla de puntos y orbes (igual que el prototipo). */
export function Fondo({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('fondo-app min-h-dvh', className)}>
      <div aria-hidden className="orbes">
        <i />
        <i />
        <i />
      </div>
      {children}
    </div>
  )
}

/** Pantallas sin sesión (ingreso, invitación, contraseña): una tarjeta centrada. */
export function PantallaPublica({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Fondo className="grid place-items-center px-4 py-10">
      <main className="w-full max-w-[420px]">
        <Marca className="mb-6 justify-center" />
        <Card className="entra p-6 sm:p-8">
          <h1 className="m-0 mb-5 text-[26px]">{titulo}</h1>
          {children}
        </Card>
      </main>
    </Fondo>
  )
}

/** La muela con el degradado del color de acción: el sello del prototipo. */
function Sello() {
  return (
    <span className="grid size-[38px] shrink-0 place-items-center rounded-[13px] bg-gradient-to-br from-[color-mix(in_srgb,var(--ac)_80%,white)] via-ac to-[color-mix(in_srgb,var(--ac)_80%,black)] text-acI shadow-boton">
      <ToothIcon className="size-5" />
    </span>
  )
}

export function Marca({ className, nombre }: { className?: string; nombre?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Sello />
      <span className="grid leading-none">
        <span className="display text-[22px] font-bold tracking-tight">{nombre ?? 'Lupa Lab'}</span>
        {nombre && <span className="mt-0.5 font-mono text-[10px] tracking-[0.1em] text-ink3 uppercase">Lupa Lab</span>}
      </span>
    </div>
  )
}

type Enlace = { a: string; texto: string; icono: LucideIcon; permiso?: string; fin?: boolean }

/** Lo del día a día arriba; lo de administración, separado abajo. */
const PRINCIPAL: Enlace[] = [
  { a: '/nuevo', texto: 'Nuevo caso', icono: Plus, permiso: 'crear_caso' },
  { a: '/casos', texto: 'Casos', icono: Rows3 },
  { a: '/clientes', texto: 'Clientes', icono: Contact },
  { a: '/catalogo', texto: 'Catálogo', icono: LayoutGrid },
]
const ADMINISTRACION: Enlace[] = [
  { a: '/equipo', texto: 'Equipo', icono: Users, permiso: 'gestionar_equipo' },
  { a: '/actividad', texto: 'Actividad', icono: Activity, permiso: 'ver_auditoria' },
  { a: '/perfil', texto: 'Mi perfil', icono: UserRound },
]

function Item({ a, texto, icono: Icono }: Enlace) {
  return (
    <NavLink
      to={a}
      className={({ isActive }) =>
        cn(
          'flex min-h-[44px] shrink-0 items-center gap-2.5 rounded-[14px] px-3 text-[15px] whitespace-nowrap text-ink2 no-underline transition duration-200 hover:translate-x-0.5 hover:bg-sf/55 hover:text-ink',
          isActive && 'bg-gradient-to-r from-acS to-[color-mix(in_srgb,var(--acS)_40%,transparent)] font-semibold text-acT shadow-[inset_3px_0_0_var(--ac),0_8px_16px_-12px_var(--ac)] hover:bg-acS hover:text-acT',
        )
      }
    >
      <Icono aria-hidden className="size-5" strokeWidth={1.8} />
      {texto}
    </NavLink>
  )
}

const iniciales = (texto: string) =>
  texto
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

/** Marco de la app del equipo: menú lateral de vidrio fijo en PC, barra superior en el celular (AppShell del prototipo). */
export function Marco({ children }: { children: ReactNode }) {
  const { data: yo } = useYo()
  const navegar = useNavigate()
  const cliente = useQueryClient()
  const membresia = yo?.membresia_activa
  const varios = (yo?.membresias.length ?? 0) > 1
  const visibles = (lista: Enlace[]) => lista.filter((e) => !e.permiso || puede(yo, e.permiso))
  const rol = membresia?.roles?.map((r) => yo?.roles_disponibles.find((x) => x.valor === r)?.nombre ?? r).join(' · ')

  async function salir() {
    await api.POST('/api/auth/salir')
    cliente.clear()
    navegar('/ingresar', { replace: true })
  }

  return (
    <Fondo>
      <div className="relative isolate grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:grid-cols-[256px_minmax(0,1fr)]">
        {/* Manchas de color que viajan con el contenido: al hacer scroll pasan por detrás del vidrio de la barra. */}
        <div aria-hidden className="ambiente" />
        <aside className="vidrio-lateral relative z-10 flex flex-col gap-5 p-3.5 max-lg:border-b lg:sticky lg:top-3 lg:m-3 lg:mr-0 lg:h-[calc(100vh-24px)] lg:self-start lg:overflow-y-auto lg:rounded-[24px] lg:p-5 lg:px-3.5">
          <NavLink to="/casos" className="px-2 text-ink no-underline">
            <Marca nombre={membresia?.laboratorio.nombre} />
          </NavLink>
          <nav aria-label="Principal" className="flex gap-0.5 overflow-x-auto lg:flex-col">
            {visibles(PRINCIPAL).map((e) => (
              <Item key={e.a} {...e} />
            ))}
            <span aria-hidden className="mx-3 my-2 hidden h-px bg-ln lg:block" />
            {visibles(ADMINISTRACION).map((e) => (
              <Item key={e.a} {...e} />
            ))}
          </nav>
          <div className="lamina mt-auto hidden gap-2.5 rounded-[16px] p-3 lg:grid" data-tono="base">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[color-mix(in_srgb,var(--ac)_60%,white)] to-ac text-[13px] font-semibold text-acI shadow-boton">
                {iniciales(yo?.usuario.nombre_visible ?? '')}
              </span>
              <span className="grid min-w-0 leading-tight">
                <strong className="truncate font-semibold">{yo?.usuario.nombre || yo?.usuario.email}</strong>
                <span className="truncate text-[13px] text-ink3">{rol}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {varios && (
                <NavLink to="/elegir-laboratorio" className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-medium text-acT hover:bg-acS">
                  <Building2 aria-hidden className="size-3.5" /> Cambiar
                </NavLink>
              )}
              <button onClick={salir} className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-medium text-ink2 hover:bg-bg2">
                <LogOut aria-hidden className="size-3.5" /> Salir
              </button>
            </div>
          </div>
          <button onClick={salir} className="inline-flex min-h-11 items-center gap-2 self-start rounded-[12px] px-3 text-[14px] font-medium text-ink2 lg:hidden">
            <LogOut aria-hidden className="size-4" /> Salir
          </button>
        </aside>
        <main className="relative z-10 flex min-w-0 flex-col gap-4 p-4 sm:p-6 lg:px-7 lg:pb-10">{children}</main>
      </div>
    </Fondo>
  )
}

export function Titulo({ rotulo, children, accion }: { rotulo?: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <header className="mb-2 flex flex-wrap items-end justify-between gap-3">
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
