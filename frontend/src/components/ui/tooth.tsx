import { cn } from '../../lib/utils'

/** Muela estilizada. Es el sello de la marca: aparece en las fichas y en la pieza FDI. */
export function ToothIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
      <path d="M7.2 3.2c-2.1 0-3.7 1.7-3.7 4.1 0 2 .9 3.4 1.3 5.3.4 2 .5 5 1.3 7.3.3.9 1.3.9 1.6 0 .5-1.6.8-3.7 2-3.7h.6c1.2 0 1.5 2.1 2 3.7.3.9 1.3.9 1.6 0 .8-2.3.9-5.3 1.3-7.3.4-1.9 1.3-3.3 1.3-5.3 0-2.4-1.6-4.1-3.7-4.1-1.3 0-1.9.7-3.4.7S8.5 3.2 7.2 3.2z" />
    </svg>
  )
}

/** Chip de pieza FDI: "36" con la muela al lado. */
export function Pieza({ fdi, className }: { fdi: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-[10px] border border-ln bg-sf2 py-0.5 pr-2 pl-1.5 text-[13px] font-semibold text-ink', className)} title={`Pieza ${fdi}`}>
      <ToothIcon className="size-4 text-acT" />
      {fdi}
    </span>
  )
}

/** Color de la guía Vita, con el diente teñido de ese tono (el texto manda; el color acompaña). */
const VITA: Record<string, string> = { A1: '#F4EBD6', A2: '#EEE0C2', A3: '#E6D2AC', B1: '#F3ECD9', B2: '#EBDDBE', C1: '#E5DCC8', D2: '#E8DFCF' }
export function Tono({ tono }: { tono: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink2">
      <span aria-hidden className="size-4 rounded-full border border-[color-mix(in_srgb,var(--ink)_28%,transparent)]" style={{ background: VITA[tono] ?? '#EEE0C2' }} />
      {tono}
    </span>
  )
}
