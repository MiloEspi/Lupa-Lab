import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/utils'

// Tamaños táctiles: md 44 px (PC), lg 56 px (producción, con guantes).
// Todos los botones se elevan al pasar el mouse y se hunden al apretar.
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-[15px] font-medium whitespace-nowrap select-none transition-[transform,box-shadow,background,filter,border-color] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[.97] disabled:opacity-45 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-gradient-to-b from-[color-mix(in_srgb,var(--ac)_86%,white)] via-ac to-[color-mix(in_srgb,var(--ac)_88%,black)] text-acI shadow-boton hover:brightness-105 hover:shadow-[0_1px_0_rgb(255_255_255/.3)_inset,0_14px_26px_-10px_var(--ac)]',
        secondary:
          'border border-ctl bg-gradient-to-b from-[color-mix(in_srgb,var(--sf)_92%,white)] to-[color-mix(in_srgb,var(--sf)_50%,var(--bg2))] text-ink shadow-[0_1px_0_rgb(255_255_255/.9)_inset,0_2px_4px_-1px_rgb(24_32_44/.14)] hover:border-acT hover:from-[color-mix(in_srgb,var(--acS)_70%,white)] hover:to-acS hover:shadow-[0_1px_0_rgb(255_255_255/.9)_inset,0_12px_20px_-12px_color-mix(in_srgb,var(--ac)_60%,transparent)]',
        ghost: 'text-acT hover:bg-acS',
        // Botón sobrio para decisiones importantes: tinta con brillo, sin color de acento.
        ink: 'bg-gradient-to-b from-[color-mix(in_srgb,var(--ink)_82%,white)] via-ink to-[color-mix(in_srgb,var(--ink)_82%,black)] text-bg shadow-[0_1px_0_rgb(255_255_255/.22)_inset,0_-1px_0_rgb(0_0_0/.3)_inset,0_12px_22px_-12px_var(--ink)] hover:shadow-[0_1px_0_rgb(255_255_255/.22)_inset,0_18px_28px_-12px_var(--ink)] hover:brightness-110',
        danger: 'border border-ba/50 bg-gradient-to-b from-baS to-[color-mix(in_srgb,var(--baS)_70%,var(--ba))] text-ba hover:brightness-105',
      },
      size: { md: 'min-h-11 px-4 text-[15px]', lg: 'min-h-14 px-6 text-[17px]', icon: 'size-11' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { asChild?: boolean }

export function Button({ className, variant, size, asChild, ...p }: Props) {
  const C = asChild ? Slot : 'button'
  return <C className={cn(button({ variant, size }), className)} {...p} />
}
