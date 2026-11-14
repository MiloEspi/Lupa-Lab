import { AlertCircle, Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export type EtapaRuta = { nombre: string; quien: string; cuando: string }

/**
 * Recorrido horizontal del caso. Cada etapa es un botón: al tocarla se ven quién, cuándo y las fotos.
 * El estado va en texto (aria-label) y en forma (check, signo de atención, número), no solo en color.
 */
export function RutaHorizontal({
  etapas,
  actual,
  frenada,
  seleccionada,
  onSelect,
}: {
  etapas: EtapaRuta[]
  actual: number
  frenada: boolean
  seleccionada: number
  onSelect: (i: number) => void
}) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="m-0 flex min-w-[900px] list-none p-0">
        {etapas.map((e, i) => {
          const hecha = i < actual
          const esta = i === actual
          const bloq = esta && frenada
          const sel = i === seleccionada
          const estado = hecha ? 'terminada' : esta ? (bloq ? 'frenada' : 'en curso') : 'pendiente'
          return (
            <li key={e.nombre} className="relative flex flex-1 basis-0 flex-col items-center">
              <span aria-hidden className={cn('absolute top-[19px] left-0 h-[3px] w-1/2', i === 0 ? 'bg-transparent' : i <= actual ? 'bg-ok' : 'bg-ln')} />
              <span aria-hidden className={cn('absolute top-[19px] left-1/2 h-[3px] w-1/2', i === etapas.length - 1 ? 'bg-transparent' : i < actual ? 'bg-ok' : 'bg-ln')} />
              <button
                type="button"
                aria-pressed={sel}
                aria-label={`${e.nombre}, ${estado}`}
                onClick={() => onSelect(i)}
                className={cn(
                  'relative z-10 grid size-10 place-items-center rounded-full border-2 text-[15px] font-bold transition',
                  hecha && 'border-ok bg-ok text-white',
                  esta && !bloq && 'latido border-ac bg-acS text-acT',
                  bloq && 'border-wa bg-waS text-wa',
                  !hecha && !esta && 'border-ctl bg-sf text-ink2',
                  sel && 'shadow-[0_0_0_5px_var(--acS)]',
                )}
              >
                {hecha ? <Check className="size-5" strokeWidth={3} /> : bloq ? <AlertCircle className="size-5" strokeWidth={2.6} /> : esta ? '•' : i + 1}
              </button>
              <span className={cn('mt-2 text-center text-[14px] font-semibold', sel ? 'text-acT' : i <= actual ? 'text-ink' : 'text-ink2')}>{e.nombre}</span>
              <span className="text-center text-[13px] text-ink3">{e.quien}</span>
              <span className={cn('text-center text-[13px]', bloq ? 'font-medium text-wa' : 'text-ink3')}>{e.cuando}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
