import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

/** Marca numerada: el mismo gesto que la nota sobre el escaneo. Es el motivo de la marca. */
export function Marker({ n, estado = 'pendiente', className }: { n: number; estado?: 'hecho' | 'actual' | 'pendiente'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full border-2 text-[13px] font-semibold',
        estado === 'hecho' && 'border-ok bg-ok text-white',
        estado === 'actual' && 'latido border-ac bg-ac text-acI',
        estado === 'pendiente' && 'border-ctl bg-sf text-ink2',
        className,
      )}
    >
      {estado === 'hecho' ? <Check className="size-4" strokeWidth={3} /> : n}
    </span>
  )
}
