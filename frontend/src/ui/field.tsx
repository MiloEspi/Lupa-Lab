import type { InputHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '../lib/utils'

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string }

export function Field({ label, hint, error, className, ...p }: Props) {
  const id = useId()
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <label htmlFor={id} className="text-[14px] font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={hint || error ? `${id}-d` : undefined}
        className={cn('campo min-h-11 w-full min-w-0 px-3.5 text-[15px]', error && 'border-ba')}
        {...p}
      />
      {(hint || error) && (
        <p id={`${id}-d`} className={cn('m-0 text-[13px]', error ? 'font-medium text-ba' : 'text-ink3')}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}
