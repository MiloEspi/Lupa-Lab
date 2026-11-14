import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Barra flotante translúcida que queda pegada arriba al hacer scroll (idea tomada de la barra de
 * terminal-industries.com). Se usa para el encabezado del caso: siempre se sabe en qué caso estás.
 */
export function BarraFlotante({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'brillo-borde sticky top-3 z-40 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[20px] border border-ln/70 px-4 py-2.5',
        'bg-[linear-gradient(120deg,color-mix(in_srgb,var(--sf)_78%,transparent),color-mix(in_srgb,var(--acS)_55%,transparent))] shadow-[0_1px_0_rgb(255_255_255/.8)_inset,0_14px_34px_-14px_rgba(24,32,44,.35)] backdrop-blur-xl backdrop-saturate-150',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Rótulo de sección en monoespaciada: "01 · Odontólogo". Ordena sin necesidad de colores. */
export function Rotulo({ n, children, className }: { n?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-mono text-[12px] font-medium tracking-[0.1em] text-ink3 uppercase', className)}>
      {n && <span className="rounded-md bg-ink px-1.5 py-px text-[11px] font-semibold text-bg">{n}</span>}
      {children}
    </span>
  )
}

/** Código del caso u otra referencia técnica, en monoespaciada. */
export function Codigo({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[13px] font-medium tracking-tight text-ink2', className)}>{children}</span>
}

/** Código del caso en grande, con la tipografía de exhibición: se lee de lejos. */
export function CodigoGrande({ prefijo, numero, className }: { prefijo: string; numero: string; className?: string }) {
  return (
    <span className={cn('display inline-flex items-baseline gap-1 leading-none font-bold tracking-tight', className)}>
      <span className="text-ink3">{prefijo}</span>
      <span className="bg-gradient-to-br from-ink via-ink to-acT bg-clip-text text-transparent">{numero}</span>
    </span>
  )
}
