import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useYo } from '../lib/sesion'

/** Deja pasar solo con sesión y laboratorio elegido; si no, manda a donde corresponde. */
export function ConSesion({ children }: { children: ReactNode }) {
  const { data: yo, isPending, isError } = useYo()
  const lugar = useLocation()
  if (isPending) return <Cargando />
  if (isError) return <p className="p-8 text-ba">No pudimos conectar con el servidor. Probá de nuevo en un rato.</p>
  if (!yo) return <Navigate to="/ingresar" replace state={{ desde: lugar.pathname }} />
  if (!yo.membresia_activa && lugar.pathname !== '/elegir-laboratorio') {
    return <Navigate to="/elegir-laboratorio" replace />
  }
  return children
}

export function Cargando() {
  return (
    <div role="status" className="grid min-h-dvh place-items-center text-ink3">
      Cargando…
    </div>
  )
}
