import * as T from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

export const Tabs = T.Root
export const TabsContent = T.Content

export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return <T.List className={cn('inline-flex flex-wrap gap-1 rounded-[14px] bg-bg2 p-1', className)} {...p} />
}

export function TabsTrigger({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'min-h-10 rounded-[11px] px-3.5 text-[14px] font-medium text-ink2 transition hover:text-ink data-[state=active]:bg-sf data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_2px_rgb(24_32_44/.14)]',
        className,
      )}
      {...p}
    />
  )
}
