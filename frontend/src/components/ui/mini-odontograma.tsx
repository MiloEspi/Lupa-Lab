import { cn } from '../../lib/utils'
import { INFERIOR, SUPERIOR } from './selector-piezas'

/**
 * Odontograma en miniatura: las 32 piezas en dos arcadas y las piezas del pedido resaltadas.
 * Sirve para ver de un vistazo dónde va el trabajo, sin leer números.
 */
export function MiniOdontograma({ piezas, className }: { piezas: string[]; className?: string }) {
  const fila = (lista: string[]) => (
    <div className="grid grid-cols-[repeat(8,1fr)_8px_repeat(8,1fr)] gap-[3px]">
      {lista.map((n, i) => {
        const on = piezas.includes(n)
        return (
          <span key={n} className="contents">
            {i === 8 && <span aria-hidden />}
            <span
              aria-hidden
              className={cn(
                'grid h-[22px] place-items-center rounded-[6px] font-mono text-[8.5px] leading-none font-semibold transition-all duration-300',
                on
                  ? 'z-10 scale-[1.28] bg-gradient-to-b from-[color-mix(in_srgb,var(--ac)_80%,white)] to-ac text-acI shadow-[0_6px_12px_-4px_var(--ac),0_0_0_2px_color-mix(in_srgb,var(--ac)_25%,transparent)]'
                  : 'bg-bg2/80 text-transparent shadow-[inset_0_0_0_1px_var(--ln)]',
              )}
            >
              {on ? n : ''}
            </span>
          </span>
        )
      })}
    </div>
  )
  return (
    <div role="img" aria-label={piezas.length ? `Pieza ${piezas.join(', ')} resaltada en el odontograma` : 'Ninguna pieza elegida'} className={cn('grid gap-1.5 py-1', className)}>
      {fila(SUPERIOR)}
      <div aria-hidden className="h-px bg-gradient-to-r from-transparent via-ctl/40 to-transparent" />
      {fila(INFERIOR)}
    </div>
  )
}
