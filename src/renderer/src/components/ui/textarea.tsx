import * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex w-full resize-none rounded-md border border-line bg-elevated px-2 py-1.5 text-xs leading-relaxed text-fg transition-colors outline-none placeholder:text-fg-3 hover:border-line-strong focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/40 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
