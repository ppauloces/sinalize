import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SectionLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="-mb-1 flex shrink-0 items-center justify-between text-[0.69rem] font-bold tracking-wider text-muted-foreground uppercase">
      <span>{children}</span>
      {hint && <small className="text-[0.69rem] font-medium tracking-normal normal-case">{hint}</small>}
    </div>
  )
}

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('flex shrink-0 flex-col gap-2.5 rounded-xl border bg-card p-3.5 shadow-xs', className)} {...props} />
}

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd className={cn('rounded border bg-muted px-1.5 py-px font-sans text-[0.68rem] font-semibold', className)} {...props} />
}
