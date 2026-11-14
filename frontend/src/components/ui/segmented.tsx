import type { CSSProperties, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type TonoOpcion = 'ok' | 'wa' | 'ba' | 'ac'
type Opcion<T extends string> = { id: T; label: string; icon?: ReactNode; tono?: TonoOpcion }

/**
 * Selector segmentado con aria-pressed. El "pulgar" se desliza entre opciones con un resorte y toma
 * el color de la opción elegida. El estado se lee en texto y en forma, no solo en color.
 * Si `value` no coincide con ninguna opción, el pulgar se esconde (nada elegido todavía).
 */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  compacto = false,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: Opcion<T>[]
  className?: string
  compacto?: boolean
}) {
  const idx = options.findIndex((o) => o.id === value)
  const tono = idx >= 0 ? options[idx].tono : undefined
  return (
    <div role="group" aria-label={label} className={cn('segmentado', className)} style={{ '--n': options.length, '--i': Math.max(idx, 0) } as CSSProperties}>
      <span aria-hidden className="segmentado-pulgar" data-tono={tono} data-vacio={idx < 0} />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          data-tono={o.tono}
          onClick={() => onChange(o.id)}
          className={cn(
            'segmentado-opcion inline-flex items-center justify-center gap-1.5 rounded-[12px] px-2.5 text-[14px] text-ink2 hover:text-ink aria-pressed:font-semibold aria-pressed:text-ink',
            compacto ? 'min-h-[38px]' : 'min-h-11',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
