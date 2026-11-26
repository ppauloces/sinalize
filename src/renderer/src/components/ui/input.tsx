import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-7 w-full min-w-0 rounded-md border border-line bg-elevated px-2 text-xs text-fg transition-colors outline-none placeholder:text-fg-3 hover:border-line-strong focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
