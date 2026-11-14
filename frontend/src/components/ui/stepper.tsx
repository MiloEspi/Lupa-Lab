import { cn } from '../../lib/utils'
import { Marker } from './marker'

export type Etapa = { nombre: string; quien?: string; cuando?: string }

/** Ruta de etapas del caso. Vertical: cada etapa dice quién y cuándo; el estado va en texto. */
export function Stepper({ etapas, actual }: { etapas: Etapa[]; actual: number }) {
  return (
    <ol className="m-0 list-none p-0">
      {etapas.map((e, i) => {
        const estado = i < actual ? 'hecho' : i === actual ? 'actual' : 'pendiente'
        const textoEstado = estado === 'hecho' ? 'hecha' : estado === 'actual' ? 'en curso' : 'pendiente'
        return (
          <li key={e.nombre} className="relative flex gap-3 pb-4 last:pb-0" aria-current={estado === 'actual' ? 'step' : undefined}>
            {i < etapas.length - 1 && (
              <span aria-hidden className={cn('absolute top-8 bottom-0 left-[15px] w-0.5 rounded', i < actual ? 'bg-ok' : 'bg-ln')} />
            )}
            <Marker n={i + 1} estado={estado} />
            <div className="min-w-0 pt-0.5">
              <p className={cn('m-0 text-[15px] leading-tight font-medium', estado === 'pendiente' ? 'text-ink2' : 'text-ink')}>
                {e.nombre}
                <span className="sr-only">, {textoEstado}</span>
              </p>
              {(e.quien || e.cuando) && <p className="m-0 mt-0.5 text-[13px] text-ink3">{[e.quien, e.cuando].filter(Boolean).join(' · ')}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
