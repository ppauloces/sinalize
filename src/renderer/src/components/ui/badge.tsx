import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex h-4.5 shrink-0 items-center gap-1 rounded-sm px-1.5 font-mono text-[10px] font-medium tracking-wide whitespace-nowrap uppercase [&>svg]:size-3', {
  variants: {
    variant: {
      default: 'bg-elevated text-fg-2',
      brand: 'bg-brand-soft text-brand-fg',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      outline: 'border border-line text-fg-2',
    },
  },
  defaultVariants: { variant: 'default' },
})

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
