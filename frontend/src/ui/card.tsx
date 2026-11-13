import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils'

export type TonoCard = 'base' | 'tinte' | 'calido' | 'menta' | 'oscuro'

/** Lámina: la tarjeta de la app. Ya no es blanca: degradado, brillo de borde y sombra en capas, según el tono. */
export function Card({ className, tono = 'base', ...p }: HTMLAttributes<HTMLDivElement> & { tono?: TonoCard }) {
  return <div data-tono={tono} className={cn('lamina', className)} {...p} />
}

/** Ficha: la tarjeta del caso, con la solapa del número como una etiqueta de laboratorio. */
export function Ficha({ numero, aside, className, children }: { numero: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card className={cn('relative mt-3 p-4 pt-6', className)}>
      <span className="absolute -top-3 left-4 inline-flex items-center gap-1.5 rounded-[10px] border border-ln bg-sf2 px-2.5 py-1 text-[13px] font-semibold tracking-wide text-ink2 shadow-[0_1px_0_rgb(255_255_255/.8)_inset]">
        <span aria-hidden className="size-1.5 rounded-full bg-ac" />
        {numero}
      </span>
      {aside && <div className="absolute -top-3 right-4">{aside}</div>}
      {children}
    </Card>
  )
}
