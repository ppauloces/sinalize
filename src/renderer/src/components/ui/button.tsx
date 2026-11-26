import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: 'bg-brand text-white hover:bg-brand/88 active:bg-brand/80',
        secondary: 'border border-line bg-elevated text-fg hover:border-line-strong hover:bg-hover',
        outline: 'border border-line bg-transparent text-fg hover:bg-hover',
        ghost: 'text-fg-2 hover:bg-hover hover:text-fg',
        destructive: 'bg-danger-strong text-white hover:bg-danger-strong/88',
        'destructive-outline': 'border border-danger/50 bg-transparent text-danger hover:bg-danger-soft',
        link: 'text-brand-fg underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-7 px-2.5',
        xs: 'h-5 gap-1 rounded-sm px-1.5 text-[11px] [&_svg:not([class*=size-])]:size-3',
        sm: 'h-6 px-2 text-[11px]',
        lg: 'h-8 px-3',
        icon: 'size-7',
        'icon-xs': 'size-5 rounded-sm [&_svg:not([class*=size-])]:size-3',
        'icon-sm': 'size-6',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
