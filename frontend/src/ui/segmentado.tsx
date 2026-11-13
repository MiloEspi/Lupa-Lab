import { cn } from '../lib/utils'

/** Selector de opciones excluyentes con un toque (sin desplegables). */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[]
  valor: T
  onChange: (v: T) => void
  etiqueta: string
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="inline-flex rounded-2xl border border-ctl bg-sf2 p-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            'min-h-10 rounded-xl px-4 text-[14px] font-semibold transition-colors',
            o.valor === valor ? 'bg-ink text-bg' : 'text-ink2 hover:text-ink',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  )
}

/** Interruptor accesible (role=switch) para sí/no. */
export function Interruptor({ etiqueta, valor, onChange }: { etiqueta: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={valor}
      onClick={() => onChange(!valor)}
      className="inline-flex min-h-11 items-center gap-3 text-[14px] font-semibold"
    >
      <span className={cn('relative h-6 w-11 rounded-full border transition-colors', valor ? 'border-ok bg-ok' : 'border-ctl bg-bg2')}>
        <span className={cn('absolute top-0.5 size-[18px] rounded-full bg-sf shadow transition-[left]', valor ? 'left-[22px]' : 'left-0.5')} />
      </span>
      {etiqueta}
    </button>
  )
}
