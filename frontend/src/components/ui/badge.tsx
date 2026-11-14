import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

// Un estado nunca va solo con color: siempre punto + texto.
const badge = cva('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium', {
  variants: {
    tone: {
      neutral: 'bg-bg2 text-ink2',
      accion: 'bg-acS text-acT',
      ok: 'bg-okS text-ok',
      atencion: 'bg-waS text-wa',
      problema: 'bg-baS text-ba',
      info: 'bg-infoS text-info',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ className, tone, children, ...p }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return (
    <span className={cn(badge({ tone }), className)} {...p}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}
